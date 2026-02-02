'use strict';

const express = require('express');
require('dotenv').config();

const config = require('./lib/config');
const { nowIso, loadOrCreateSecret, randomToken, sha256Base64Url } = require('./lib/crypto');
const { createStoreHelpers } = require('./lib/store');
const { notionTokenRequest } = require('./lib/notion');
const { buildTools } = require('./lib/tools');
const { enforceRateLimit } = require('./lib/rateLimit');
const { jsonRpcError, jsonRpcResult, buildWwwAuthenticate } = require('./lib/mcp');
const {
  saveAuthCode,
  consumeAuthCode,
  signState,
  verifyState,
  hasScope,
  requireBearerToken,
  buildDefaultClient,
  buildTokenResponse,
  issueAccessToken
} = require('./lib/oauth');
const { registerHealthRoutes } = require('./routes/health');
const { registerOAuthRoutes } = require('./routes/oauth');
const { registerMcpRoutes } = require('./routes/mcp');

const app = express();
app.use(express.json({ limit: '1mb' }));

const TOKEN_ENC_KEY = loadOrCreateSecret(config.TOKEN_ENC_KEY, config.TOKEN_ENC_KEY_FILE, 32, 'TOKEN_ENC_KEY');
const STATE_SIGNING_KEY = loadOrCreateSecret(config.STATE_SIGNING_KEY, config.STATE_SIGNING_KEY_FILE, 32, 'STATE_SIGNING_KEY');

const store = createStoreHelpers(config.TOKEN_STORE_PATH, TOKEN_ENC_KEY);
const defaultClient = buildDefaultClient();

const { toolSchemas, toolList, validators } = buildTools(store.saveTokenRecord);

registerHealthRoutes(app, nowIso);
registerOAuthRoutes(app, {
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
});
registerMcpRoutes(app, {
  config,
  enforceRateLimit,
  requireBearerToken,
  hasScope,
  buildWwwAuthenticate,
  jsonRpcError,
  jsonRpcResult,
  toolSchemas,
  toolList,
  validators,
  store
});

app.listen(config.PORT, () => {
  console.log(`Notion MCP server listening on ${config.BASE_URL}`);
});
