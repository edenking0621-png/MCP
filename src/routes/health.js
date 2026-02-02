'use strict';

function registerHealthRoutes(app, nowIso) {
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', time: nowIso() });
  });

  app.get('/', (_req, res) => {
    res.type('text/plain').send('Notion MCP server is running. See /healthz and POST /mcp.');
  });
}

module.exports = { registerHealthRoutes };
