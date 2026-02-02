'use strict';

const { randomToken, sha256Base64Url, base64UrlEncode, base64UrlDecode, safeJsonParse, nowIso } = require('./crypto');
const { MCP_CLIENT_ID, ALLOWED_REDIRECT_URIS, ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } = require('./config');
const { buildWwwAuthenticate } = require('./mcp');
const crypto = require('crypto');

const authCodeStore = new Map();

function saveAuthCode(code, payload) {
  authCodeStore.set(code, payload);
}

function consumeAuthCode(code) {
  const payload = authCodeStore.get(code);
  if (!payload) return null;
  authCodeStore.delete(code);
  return payload;
}

function signState(payload, STATE_SIGNING_KEY) {
  const data = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = crypto.createHmac('sha256', STATE_SIGNING_KEY).update(data).digest('hex');
  return `${base64UrlEncode(data)}.${signature}`;
}

function verifyState(state, STATE_SIGNING_KEY) {
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const data = base64UrlDecode(parts[0]);
  const signature = parts[1];
  const expected = crypto.createHmac('sha256', STATE_SIGNING_KEY).update(data).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'))) {
    return null;
  }
  return safeJsonParse(data.toString('utf8'));
}

function hasScope(record, requiredScope) {
  if (!requiredScope) return true;
  const scopes = (record.scopes || '').split(' ').filter(Boolean);
  return scopes.includes(requiredScope);
}

function requireBearerToken(req, res, findTokenByAccess, saveTokenRecord) {
  const auth = req.headers.authorization || '';
  const [type, token] = auth.split(' ');
  if (type !== 'Bearer' || !token) {
    res.status(401).set('WWW-Authenticate', buildWwwAuthenticate()).json({ error: 'missing_bearer_token' });
    return null;
  }
  const record = findTokenByAccess(token);
  if (!record) {
    res.status(401).set('WWW-Authenticate', buildWwwAuthenticate()).json({ error: 'invalid_token' });
    return null;
  }
  if (record.access_expires_at && Date.now() > record.access_expires_at) {
    res.status(401).set('WWW-Authenticate', buildWwwAuthenticate()).json({ error: 'token_expired' });
    return null;
  }
  record.last_used_at = nowIso();
  saveTokenRecord(record);
  return record;
}

function buildDefaultClient() {
  return {
    client_id: MCP_CLIENT_ID,
    redirect_uris: ALLOWED_REDIRECT_URIS,
    scopes: ['notion.read', 'notion.write', 'notion.admin']
  };
}

function buildTokenResponse(record) {
  return {
    access_token: record.access_token,
    refresh_token: record.refresh_token,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope: record.scopes
  };
}

function issueAccessToken(payload) {
  const access_token = randomToken(32);
  const refresh_token = randomToken(48);
  return {
    id: randomToken(12),
    access_token,
    refresh_token,
    access_expires_at: Date.now() + ACCESS_TOKEN_TTL_MS,
    refresh_expires_at: Date.now() + REFRESH_TOKEN_TTL_MS,
    created_at: nowIso(),
    updated_at: nowIso(),
    last_used_at: nowIso(),
    client_id: payload.client_id,
    scopes: payload.scope || 'notion.read',
    notion: payload.notion
  };
}

module.exports = {
  saveAuthCode,
  consumeAuthCode,
  signState,
  verifyState,
  hasScope,
  requireBearerToken,
  buildDefaultClient,
  buildTokenResponse,
  issueAccessToken,
  sha256Base64Url
};
