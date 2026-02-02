'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function nowIso() {
  return new Date().toISOString();
}

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (_err) {
    return null;
  }
}

function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function sha256Base64Url(input) {
  return base64UrlEncode(crypto.createHash('sha256').update(input).digest());
}

function randomToken(bytes = 32) {
  return base64UrlEncode(crypto.randomBytes(bytes));
}

function getEncryptionKey(TOKEN_ENC_KEY) {
  requireEnv('TOKEN_ENC_KEY', TOKEN_ENC_KEY);
  const trimmed = TOKEN_ENC_KEY.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  const buf = Buffer.from(trimmed, 'base64');
  if (buf.length !== 32) {
    throw new Error('TOKEN_ENC_KEY must be 32 bytes (base64) or 64 hex chars.');
  }
  return buf;
}

function encryptJson(obj, TOKEN_ENC_KEY) {
  const key = getEncryptionKey(TOKEN_ENC_KEY);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: base64UrlEncode(iv),
    tag: base64UrlEncode(tag),
    data: base64UrlEncode(ciphertext)
  };
}

function decryptJson(payload, TOKEN_ENC_KEY) {
  const key = getEncryptionKey(TOKEN_ENC_KEY);
  const iv = base64UrlDecode(payload.iv);
  const tag = base64UrlDecode(payload.tag);
  const data = base64UrlDecode(payload.data);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

function loadOrCreateSecret(envValue, filePath, bytes, label) {
  if (envValue) return envValue;
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8').trim();
  }
  const secret = crypto.randomBytes(bytes).toString('base64');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, secret, { encoding: 'utf8' });
  console.warn(`[security] ${label} was not set; generated and stored at ${filePath}. Set the env var for production.`);
  return secret;
}

module.exports = {
  nowIso,
  safeJsonParse,
  base64UrlEncode,
  base64UrlDecode,
  sha256Base64Url,
  randomToken,
  encryptJson,
  decryptJson,
  loadOrCreateSecret
};
