'use strict';

const {
  NOTION_API_BASE,
  NOTION_OAUTH_TOKEN,
  NOTION_CLIENT_ID,
  NOTION_CLIENT_SECRET,
  NOTION_VERSION
} = require('./config');
const { nowIso } = require('./crypto');

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
}

async function notionTokenRequest(body) {
  requireEnv('NOTION_CLIENT_ID', NOTION_CLIENT_ID);
  requireEnv('NOTION_CLIENT_SECRET', NOTION_CLIENT_SECRET);
  const auth = Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString('base64');
  const resp = await fetch(NOTION_OAUTH_TOKEN, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error('Notion token exchange failed');
    err.details = data;
    throw err;
  }
  return data;
}

async function refreshNotionToken(record, saveTokenRecord) {
  if (!record.notion || !record.notion.refresh_token) {
    throw new Error('Missing Notion refresh token');
  }
  const refreshed = await notionTokenRequest({
    grant_type: 'refresh_token',
    refresh_token: record.notion.refresh_token
  });
  record.notion.access_token = refreshed.access_token;
  record.notion.refresh_token = refreshed.refresh_token || record.notion.refresh_token;
  record.notion.expires_at = Date.now() + (refreshed.expires_in || 3600) * 1000;
  record.notion.workspace_id = refreshed.workspace_id || record.notion.workspace_id;
  record.notion.bot_id = refreshed.bot_id || record.notion.bot_id;
  record.updated_at = nowIso();
  saveTokenRecord(record);
  return record;
}

async function notionApiRequest(record, method, pathSuffix, body, saveTokenRecord) {
  if (!record || !record.notion || !record.notion.access_token) {
    throw new Error('Missing Notion access token');
  }
  if (record.notion.expires_at && Date.now() > record.notion.expires_at - 60 * 1000) {
    await refreshNotionToken(record, saveTokenRecord);
  }
  const resp = await fetch(`${NOTION_API_BASE}${pathSuffix}`, {
    method,
    headers: {
      Authorization: `Bearer ${record.notion.access_token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await resp.json();
  if (resp.status === 401) {
    await refreshNotionToken(record, saveTokenRecord);
    return notionApiRequest(record, method, pathSuffix, body, saveTokenRecord);
  }
  if (!resp.ok) {
    const err = new Error('Notion API request failed');
    err.details = data;
    err.status = resp.status;
    throw err;
  }
  return data;
}

function extractPlainText(richTextArray) {
  if (!Array.isArray(richTextArray)) return '';
  return richTextArray.map(item => item.plain_text || '').join('').trim();
}

function extractTitleFromPage(page) {
  const props = page.properties || {};
  const titleProp = Object.values(props).find(p => p && p.type === 'title');
  if (!titleProp) return '';
  return extractPlainText(titleProp.title);
}

function extractTitleFromDatabase(db) {
  return extractPlainText(db.title || []);
}

function compactSearchResults(payload) {
  return {
    results: (payload.results || []).map(item => ({
      id: item.id,
      object: item.object,
      url: item.url,
      title: item.object === 'database' ? extractTitleFromDatabase(item) : extractTitleFromPage(item),
      last_edited_time: item.last_edited_time
    })),
    next_cursor: payload.next_cursor || null,
    has_more: !!payload.has_more
  };
}

module.exports = {
  notionTokenRequest,
  refreshNotionToken,
  notionApiRequest,
  extractPlainText,
  extractTitleFromPage,
  extractTitleFromDatabase,
  compactSearchResults
};
