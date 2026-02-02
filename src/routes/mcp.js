'use strict';

const { ensureOriginAllowed, validateMcpVersion } = require('../lib/http');

function registerMcpRoutes(app, deps) {
  const {
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
  } = deps;

  app.post('/mcp', async (req, res) => {
    if (!enforceRateLimit(req, res, config.RATE_LIMIT_MAX_MCP)) return;
    if (!ensureOriginAllowed(req, res, config)) return;
    if (!validateMcpVersion(req, res, config)) return;

    const record = requireBearerToken(req, res, store.findTokenByAccess, store.saveTokenRecord);
    if (!record) return;

    const request = req.body;
    if (!request || request.jsonrpc !== '2.0') {
      return res.status(400).json(jsonRpcError(null, -32600, 'Invalid Request'));
    }

    if (request.result || request.error) {
      return res.status(202).end();
    }

    const { method, params, id } = request;
    if (!method) {
      return res.status(400).json(jsonRpcError(null, -32600, 'Invalid Request'));
    }
    const isNotification = typeof id === 'undefined';

    if (method === 'initialize') {
      const result = {
        protocolVersion: '2025-11-25',
        serverInfo: { name: 'notion-mcp-remote', version: '0.1.0' },
        capabilities: { tools: {} }
      };
      if (isNotification) return res.status(202).end();
      return res.json(jsonRpcResult(id, result));
    }

    if (method === 'tools/list') {
      if (isNotification) return res.status(202).end();
      return res.json(jsonRpcResult(id, { tools: toolList }));
    }

    if (method === 'tools/call') {
      const name = params?.name;
      const args = params?.arguments;
      const tool = toolSchemas[name];
      if (!tool) {
        if (isNotification) return res.status(202).end();
        return res.json(jsonRpcError(id, -32601, 'Tool not found'));
      }
      if (!hasScope(record, tool.scope)) {
        res.set('WWW-Authenticate', buildWwwAuthenticate(tool.scope));
        if (isNotification) return res.status(202).end();
        return res.status(403).json(jsonRpcError(id, -32001, 'Insufficient scope', { required: tool.scope }));
      }
      const validator = validators.get(name);
      if (validator && !validator(args || {})) {
        if (isNotification) return res.status(202).end();
        return res.json(jsonRpcError(id, -32602, 'Invalid params', validator.errors));
      }
      try {
        const output = await tool.handler(record, args || {});
        if (isNotification) return res.status(202).end();
        return res.json(jsonRpcResult(id, { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] }));
      } catch (err) {
        if (isNotification) return res.status(202).end();
        return res.json(jsonRpcError(id, -32000, 'Tool execution failed', err.details || err.message));
      }
    }

    if (isNotification) return res.status(202).end();
    return res.json(jsonRpcError(id, -32601, 'Method not found'));
  });

  app.get('/mcp', (_req, res) => {
    res.status(405).json({ error: 'method_not_allowed', detail: 'Use POST /mcp' });
  });
}

module.exports = { registerMcpRoutes };
