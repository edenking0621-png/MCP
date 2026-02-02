'use strict';

const { BASE_URL } = require('./config');

function jsonRpcError(id, code, message, data) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, data } };
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function buildWwwAuthenticate(scope) {
  const params = [`realm="mcp"`, `resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`];
  if (scope) params.push(`scope="${scope}"`);
  return `Bearer ${params.join(', ')}`;
}

module.exports = { jsonRpcError, jsonRpcResult, buildWwwAuthenticate };
