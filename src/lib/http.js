'use strict';

function ensureOriginAllowed(req, res, config) {
  if (!config.ALLOWED_ORIGINS.length) return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  if (config.ALLOWED_ORIGINS.includes(origin)) return true;
  res.status(403).json({ error: 'origin_not_allowed' });
  return false;
}

function validateMcpVersion(req, res, config) {
  const version = req.headers['mcp-protocol-version'];
  if (!version) return true;
  if (config.SUPPORTED_MCP_VERSIONS.has(version)) return true;
  res.status(400).json({ error: 'unsupported_mcp_protocol_version', supported: Array.from(config.SUPPORTED_MCP_VERSIONS) });
  return false;
}

module.exports = { ensureOriginAllowed, validateMcpVersion };
