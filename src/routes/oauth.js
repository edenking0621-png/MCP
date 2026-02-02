'use strict';

function registerOAuthRoutes(app, deps) {
  const {
    config,
    enforceRateLimit,
    randomToken,
    signState,
    verifyState,
    saveAuthCode,
    consumeAuthCode,
    buildTokenResponse,
    issueAccessToken,
    store,
    defaultClient,
    STATE_SIGNING_KEY,
    notionTokenRequest,
    nowIso,
    sha256Base64Url
  } = deps;

  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json({
      resource: `${config.BASE_URL}/mcp`,
      authorization_servers: [`${config.BASE_URL}`]
    });
  });

  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json({
      issuer: `${config.BASE_URL}`,
      authorization_endpoint: `${config.BASE_URL}/authorize`,
      registration_endpoint: `${config.BASE_URL}/register`,
      token_endpoint: `${config.BASE_URL}/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['notion.read', 'notion.write', 'notion.admin']
    });
  });

  app.get('/authorize', async (req, res) => {
    if (!enforceRateLimit(req, res, config.RATE_LIMIT_MAX_AUTH)) return;
    try {
      const { response_type, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = req.query;
      if (response_type !== 'code') {
        return res.status(400).json({ error: 'unsupported_response_type' });
      }
      const client = store.findClient(client_id, defaultClient);
      if (!client) {
        return res.status(400).json({ error: 'invalid_client' });
      }
      if (!client.redirect_uris || !client.redirect_uris.includes(redirect_uri)) {
        return res.status(400).json({ error: 'invalid_redirect_uri' });
      }
      if (!code_challenge || code_challenge_method !== 'S256') {
        return res.status(400).json({ error: 'invalid_pkce' });
      }
      if (!config.NOTION_CLIENT_ID || !config.NOTION_CLIENT_SECRET) {
        return res.status(500).json({ error: 'notion_client_missing' });
      }
      const statePayload = {
        nonce: randomToken(16),
        issuedAt: Date.now(),
        client_id,
        redirect_uri,
        scope: scope || 'notion.read',
        client_state: state || '',
        code_challenge,
        code_challenge_method
      };
      const signedState = signState(statePayload, STATE_SIGNING_KEY);
      const url = new URL(config.NOTION_OAUTH_AUTHORIZE);
      url.searchParams.set('client_id', config.NOTION_CLIENT_ID);
      url.searchParams.set('redirect_uri', config.NOTION_REDIRECT_URI);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('owner', 'user');
      url.searchParams.set('state', signedState);
      res.redirect(url.toString());
    } catch (err) {
      res.status(500).json({ error: 'authorize_failed', message: err.message });
    }
  });

  app.get('/oauth/callback', async (req, res) => {
    try {
      const { code, state } = req.query;
      if (!code || !state) {
        return res.status(400).json({ error: 'missing_code_or_state' });
      }
      const payload = verifyState(state, STATE_SIGNING_KEY);
      if (!payload) {
        return res.status(400).json({ error: 'invalid_state' });
      }
      if (Date.now() - payload.issuedAt > config.AUTH_CODE_TTL_MS) {
        return res.status(400).json({ error: 'state_expired' });
      }
      const tokenData = await notionTokenRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.NOTION_REDIRECT_URI
      });
      const authCode = randomToken(24);
      saveAuthCode(authCode, {
        client_id: payload.client_id,
        redirect_uri: payload.redirect_uri,
        scope: payload.scope,
        code_challenge: payload.code_challenge,
        code_challenge_method: payload.code_challenge_method,
        created_at: Date.now(),
        notion: {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000,
          bot_id: tokenData.bot_id,
          workspace_id: tokenData.workspace_id,
          owner: tokenData.owner
        }
      });
      const redirect = new URL(payload.redirect_uri);
      redirect.searchParams.set('code', authCode);
      if (payload.client_state) {
        redirect.searchParams.set('state', payload.client_state);
      }
      res.redirect(redirect.toString());
    } catch (err) {
      res.status(500).json({ error: 'oauth_callback_failed', message: err.message, details: err.details || null });
    }
  });

  app.post('/token', require('express').urlencoded({ extended: false }), async (req, res) => {
    if (!enforceRateLimit(req, res, config.RATE_LIMIT_MAX_AUTH)) return;
    try {
      const grantType = req.body.grant_type;
      if (grantType === 'authorization_code') {
        const { code, client_id, redirect_uri, code_verifier } = req.body;
        const client = store.findClient(client_id, defaultClient);
        if (!client) {
          return res.status(400).json({ error: 'invalid_client' });
        }
        if (!client.redirect_uris || !client.redirect_uris.includes(redirect_uri)) {
          return res.status(400).json({ error: 'invalid_redirect_uri' });
        }
        const payload = consumeAuthCode(code);
        if (!payload) {
          return res.status(400).json({ error: 'invalid_code' });
        }
        if (Date.now() - payload.created_at > config.AUTH_CODE_TTL_MS) {
          return res.status(400).json({ error: 'code_expired' });
        }
        if (payload.client_id !== client_id || payload.redirect_uri !== redirect_uri) {
          return res.status(400).json({ error: 'invalid_request' });
        }
        if (!code_verifier || sha256Base64Url(code_verifier) !== payload.code_challenge) {
          return res.status(400).json({ error: 'invalid_pkce' });
        }
        const record = issueAccessToken(payload);
        store.saveTokenRecord(record);
        return res.json(buildTokenResponse(record));
      }
      if (grantType === 'refresh_token') {
        const { refresh_token } = req.body;
        const record = store.findTokenByRefresh(refresh_token);
        if (!record) {
          return res.status(400).json({ error: 'invalid_grant' });
        }
        if (record.refresh_expires_at && Date.now() > record.refresh_expires_at) {
          store.deleteTokenRecord(record.id);
          return res.status(400).json({ error: 'refresh_expired' });
        }
        record.access_token = randomToken(32);
        record.access_expires_at = Date.now() + config.ACCESS_TOKEN_TTL_MS;
        record.updated_at = nowIso();
        store.saveTokenRecord(record);
        return res.json(buildTokenResponse(record));
      }
      res.status(400).json({ error: 'unsupported_grant_type' });
    } catch (err) {
      res.status(500).json({ error: 'token_failed', message: err.message, details: err.details || null });
    }
  });

  app.post('/register', require('express').json({ limit: '64kb' }), async (req, res) => {
    if (!enforceRateLimit(req, res, config.RATE_LIMIT_MAX_AUTH)) return;
    try {
      const { client_name, redirect_uris, scope } = req.body || {};
      if (!client_name || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
        return res.status(400).json({ error: 'invalid_client_metadata' });
      }
      const client_id = `mcp-${randomToken(10)}`;
      const scopes = (scope || '').split(' ').filter(Boolean);
      const client = {
        client_id,
        client_name,
        redirect_uris,
        scopes: scopes.length ? scopes : ['notion.read'],
        created_at: nowIso()
      };
      store.saveClient(client);
      res.status(201).json({
        client_id,
        token_endpoint_auth_method: 'none',
        redirect_uris: client.redirect_uris,
        scope: client.scopes.join(' ')
      });
    } catch (err) {
      res.status(500).json({ error: 'registration_failed', message: err.message });
    }
  });
}

module.exports = { registerOAuthRoutes };
