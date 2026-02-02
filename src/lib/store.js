'use strict';

const fs = require('fs');
const path = require('path');
const { decryptJson, encryptJson, safeJsonParse } = require('./crypto');

function loadTokenStore(TOKEN_STORE_PATH, TOKEN_ENC_KEY) {
  if (!fs.existsSync(TOKEN_STORE_PATH)) {
    return { version: 1, tokens: [], clients: [] };
  }
  const raw = fs.readFileSync(TOKEN_STORE_PATH, 'utf8');
  const parsed = safeJsonParse(raw);
  if (!parsed) {
    throw new Error('Failed to parse token store.');
  }
  const store = decryptJson(parsed, TOKEN_ENC_KEY);
  if (!store.clients) store.clients = [];
  if (!store.tokens) store.tokens = [];
  if (!store.version) store.version = 1;
  return store;
}

function saveTokenStore(TOKEN_STORE_PATH, TOKEN_ENC_KEY, store) {
  const dir = path.dirname(TOKEN_STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const encrypted = encryptJson(store, TOKEN_ENC_KEY);
  fs.writeFileSync(TOKEN_STORE_PATH, JSON.stringify(encrypted, null, 2), 'utf8');
}

function createStoreHelpers(TOKEN_STORE_PATH, TOKEN_ENC_KEY) {
  let tokenStore = loadTokenStore(TOKEN_STORE_PATH, TOKEN_ENC_KEY);

  function findTokenByAccess(accessToken) {
    return tokenStore.tokens.find(t => t.access_token === accessToken);
  }

  function findTokenByRefresh(refreshToken) {
    return tokenStore.tokens.find(t => t.refresh_token === refreshToken);
  }

  function saveTokenRecord(record) {
    const idx = tokenStore.tokens.findIndex(t => t.id === record.id);
    if (idx >= 0) tokenStore.tokens[idx] = record;
    else tokenStore.tokens.push(record);
    saveTokenStore(TOKEN_STORE_PATH, TOKEN_ENC_KEY, tokenStore);
  }

  function deleteTokenRecord(recordId) {
    tokenStore.tokens = tokenStore.tokens.filter(t => t.id !== recordId);
    saveTokenStore(TOKEN_STORE_PATH, TOKEN_ENC_KEY, tokenStore);
  }

  function findClient(clientId, fallbackClient) {
    if (fallbackClient && clientId === fallbackClient.client_id) return fallbackClient;
    return tokenStore.clients.find(c => c.client_id === clientId) || null;
  }

  function saveClient(client) {
    const idx = tokenStore.clients.findIndex(c => c.client_id === client.client_id);
    if (idx >= 0) tokenStore.clients[idx] = client;
    else tokenStore.clients.push(client);
    saveTokenStore(TOKEN_STORE_PATH, TOKEN_ENC_KEY, tokenStore);
  }

  function updateTokenStore(nextStore) {
    tokenStore = nextStore;
    saveTokenStore(TOKEN_STORE_PATH, TOKEN_ENC_KEY, tokenStore);
  }

  return {
    getStore: () => tokenStore,
    updateTokenStore,
    findTokenByAccess,
    findTokenByRefresh,
    saveTokenRecord,
    deleteTokenRecord,
    findClient,
    saveClient
  };
}

module.exports = { loadTokenStore, saveTokenStore, createStoreHelpers };
