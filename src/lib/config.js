'use strict';

const path = require('path');

const PORT = Number(process.env.PORT || 8787);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID || '';
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET || '';
const NOTION_REDIRECT_URI = process.env.NOTION_REDIRECT_URI || `${BASE_URL}/oauth/callback`;
const NOTION_OAUTH_AUTHORIZE = 'https://api.notion.com/v1/oauth/authorize';
const NOTION_OAUTH_TOKEN = 'https://api.notion.com/v1/oauth/token';
const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = process.env.NOTION_VERSION || '2025-09-03';

const MCP_CLIENT_ID = process.env.MCP_CLIENT_ID || 'mcp-cli';
const ALLOWED_REDIRECT_URIS = (process.env.ALLOWED_REDIRECT_URIS || 'http://localhost:3000/callback')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const TOKEN_STORE_PATH = process.env.TOKEN_STORE_PATH || path.join(__dirname, '..', '..', 'data', 'token_store.json.enc');
const TOKEN_ENC_KEY_FILE = process.env.TOKEN_ENC_KEY_FILE || path.join(__dirname, '..', '..', 'data', 'token_store.key');
const STATE_SIGNING_KEY_FILE = process.env.STATE_SIGNING_KEY_FILE || path.join(__dirname, '..', '..', 'data', 'state_signing.key');
let TOKEN_ENC_KEY = process.env.TOKEN_ENC_KEY || '';
let STATE_SIGNING_KEY = process.env.STATE_SIGNING_KEY || '';

const ACCESS_TOKEN_TTL_MS = Number(process.env.ACCESS_TOKEN_TTL_MS || 60 * 60 * 1000);
const REFRESH_TOKEN_TTL_MS = Number(process.env.REFRESH_TOKEN_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const AUTH_CODE_TTL_MS = Number(process.env.AUTH_CODE_TTL_MS || 10 * 60 * 1000);

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 1000);
const RATE_LIMIT_MAX_MCP = Number(process.env.RATE_LIMIT_MAX_MCP || 120);
const RATE_LIMIT_MAX_AUTH = Number(process.env.RATE_LIMIT_MAX_AUTH || 30);

const SUPPORTED_MCP_VERSIONS = new Set(['2025-11-25', '2025-06-18', '2025-03-26']);

module.exports = {
  PORT,
  BASE_URL,
  NOTION_CLIENT_ID,
  NOTION_CLIENT_SECRET,
  NOTION_REDIRECT_URI,
  NOTION_OAUTH_AUTHORIZE,
  NOTION_OAUTH_TOKEN,
  NOTION_API_BASE,
  NOTION_VERSION,
  MCP_CLIENT_ID,
  ALLOWED_REDIRECT_URIS,
  ALLOWED_ORIGINS,
  TOKEN_STORE_PATH,
  TOKEN_ENC_KEY_FILE,
  STATE_SIGNING_KEY_FILE,
  TOKEN_ENC_KEY,
  STATE_SIGNING_KEY,
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  AUTH_CODE_TTL_MS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_MCP,
  RATE_LIMIT_MAX_AUTH,
  SUPPORTED_MCP_VERSIONS
};
