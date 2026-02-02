'use strict';

const Ajv = require('ajv');
const {
  compactSearchResults,
  extractTitleFromDatabase,
  extractTitleFromPage,
  notionApiRequest
} = require('./notion');

const ajv = new Ajv({ allErrors: true, strict: false });

function buildTools(saveTokenRecord) {
  const toolSchemas = {
    'notion.search': {
      description: 'Search pages and databases the integration can access.',
      scope: 'notion.read',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          filter: {
            type: 'object',
            properties: {
              object: { type: 'string', enum: ['page', 'database'] }
            },
            additionalProperties: false
          },
          sort: {
            type: 'object',
            properties: {
              direction: { type: 'string', enum: ['ascending', 'descending'] },
              timestamp: { type: 'string', enum: ['last_edited_time', 'created_time'] }
            },
            additionalProperties: false
          },
          page_size: { type: 'integer', minimum: 1, maximum: 100 },
          start_cursor: { type: 'string' }
        },
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                object: { type: 'string' },
                url: { type: 'string' },
                title: { type: 'string' },
                last_edited_time: { type: 'string' }
              },
              required: ['id', 'object', 'url']
            }
          },
          next_cursor: { type: ['string', 'null'] },
          has_more: { type: 'boolean' }
        },
        required: ['results', 'has_more']
      },
      handler: async (record, params) => {
        const payload = await notionApiRequest(record, 'POST', '/search', params || {}, saveTokenRecord);
        return compactSearchResults(payload);
      }
    },
    'notion.get_page': {
      description: 'Retrieve a page by ID.',
      scope: 'notion.read',
      inputSchema: {
        type: 'object',
        properties: {
          page_id: { type: 'string' },
          include_properties: { type: 'boolean', default: false }
        },
        required: ['page_id'],
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          url: { type: 'string' },
          created_time: { type: 'string' },
          last_edited_time: { type: 'string' },
          archived: { type: 'boolean' },
          title: { type: 'string' },
          properties: { type: 'object' }
        },
        required: ['id', 'url']
      },
      handler: async (record, params) => {
        const page = await notionApiRequest(record, 'GET', `/pages/${params.page_id}`, null, saveTokenRecord);
        const output = {
          id: page.id,
          url: page.url,
          created_time: page.created_time,
          last_edited_time: page.last_edited_time,
          archived: page.archived,
          title: extractTitleFromPage(page)
        };
        if (params.include_properties) {
          output.properties = page.properties;
        }
        return output;
      }
    },
    'notion.get_database': {
      description: 'Retrieve a database or data source by ID.',
      scope: 'notion.read',
      inputSchema: {
        type: 'object',
        properties: {
          database_id: { type: 'string' },
          data_source_id: { type: 'string' }
        },
        anyOf: [
          { required: ['database_id'] },
          { required: ['data_source_id'] }
        ],
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          url: { type: ['string', 'null'] },
          properties: { type: 'object' }
        },
        required: ['id', 'url']
      },
      handler: async (record, params) => {
        if (params.data_source_id) {
          const ds = await notionApiRequest(record, 'GET', `/data_sources/${params.data_source_id}`, null, saveTokenRecord);
          return {
            id: ds.id,
            title: ds.name || '',
            url: ds.url || null,
            properties: ds.properties
          };
        }
        const db = await notionApiRequest(record, 'GET', `/databases/${params.database_id}`, null, saveTokenRecord);
        return {
          id: db.id,
          title: extractTitleFromDatabase(db),
          url: db.url,
          properties: db.properties
        };
      }
    },
    'notion.query_database': {
      description: 'Query a database or data source with filters and sorts.',
      scope: 'notion.read',
      inputSchema: {
        type: 'object',
        properties: {
          database_id: { type: 'string' },
          data_source_id: { type: 'string' },
          filter: { type: 'object' },
          sorts: { type: 'array' },
          page_size: { type: 'integer', minimum: 1, maximum: 100 },
          start_cursor: { type: 'string' }
        },
        anyOf: [
          { required: ['database_id'] },
          { required: ['data_source_id'] }
        ],
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          results: { type: 'array' },
          next_cursor: { type: ['string', 'null'] },
          has_more: { type: 'boolean' }
        },
        required: ['results', 'has_more']
      },
      handler: async (record, params) => {
        const { database_id, data_source_id, ...rest } = params;
        const pathSuffix = data_source_id ? `/data_sources/${data_source_id}/query` : `/databases/${database_id}/query`;
        const payload = await notionApiRequest(record, 'POST', pathSuffix, rest, saveTokenRecord);
        return {
          results: payload.results || [],
          next_cursor: payload.next_cursor || null,
          has_more: !!payload.has_more
        };
      }
    },
    'notion.create_page': {
      description: 'Create a page in a database or as a child of another page.',
      scope: 'notion.write',
      inputSchema: {
        type: 'object',
        properties: {
          parent: {
            type: 'object',
            properties: {
              database_id: { type: 'string' },
              data_source_id: { type: 'string' },
              page_id: { type: 'string' }
            },
            additionalProperties: false
          },
          properties: { type: 'object' },
          children: { type: 'array' }
        },
        required: ['parent', 'properties'],
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          url: { type: 'string' },
          created_time: { type: 'string' }
        },
        required: ['id', 'url']
      },
      handler: async (record, params) => {
        const payload = { ...params };
        if (payload.parent && !payload.parent.type) {
          if (payload.parent.data_source_id) payload.parent.type = 'data_source_id';
          else if (payload.parent.database_id) payload.parent.type = 'database_id';
          else if (payload.parent.page_id) payload.parent.type = 'page_id';
        }
        const response = await notionApiRequest(record, 'POST', '/pages', payload, saveTokenRecord);
        return {
          id: response.id,
          url: response.url,
          created_time: response.created_time
        };
      }
    },
    'notion.update_page': {
      description: 'Update page properties or archive status.',
      scope: 'notion.write',
      inputSchema: {
        type: 'object',
        properties: {
          page_id: { type: 'string' },
          properties: { type: 'object' },
          archived: { type: 'boolean' }
        },
        required: ['page_id'],
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          url: { type: 'string' },
          archived: { type: 'boolean' }
        },
        required: ['id', 'url']
      },
      handler: async (record, params) => {
        const { page_id, ...rest } = params;
        const payload = await notionApiRequest(record, 'PATCH', `/pages/${page_id}`, rest, saveTokenRecord);
        return {
          id: payload.id,
          url: payload.url,
          archived: payload.archived
        };
      }
    },
    'notion.append_block': {
      description: 'Append child blocks to a page or block.',
      scope: 'notion.write',
      inputSchema: {
        type: 'object',
        properties: {
          block_id: { type: 'string' },
          children: { type: 'array' }
        },
        required: ['block_id', 'children'],
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          has_more: { type: 'boolean' }
        },
        required: ['id']
      },
      handler: async (record, params) => {
        const { block_id, children } = params;
        const payload = await notionApiRequest(record, 'PATCH', `/blocks/${block_id}/children`, { children }, saveTokenRecord);
        return {
          id: block_id,
          has_more: !!payload.has_more
        };
      }
    },
    'notion.list_users': {
      description: 'List users in the workspace (governance).',
      scope: 'notion.admin',
      inputSchema: {
        type: 'object',
        properties: {
          page_size: { type: 'integer', minimum: 1, maximum: 100 },
          start_cursor: { type: 'string' }
        },
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          results: { type: 'array' },
          next_cursor: { type: ['string', 'null'] },
          has_more: { type: 'boolean' }
        },
        required: ['results', 'has_more']
      },
      handler: async (record, params) => {
        const payload = await notionApiRequest(
          record,
          'GET',
          `/users?page_size=${params?.page_size || 100}${params?.start_cursor ? `&start_cursor=${encodeURIComponent(params.start_cursor)}` : ''}`,
          null,
          saveTokenRecord
        );
        return {
          results: payload.results || [],
          next_cursor: payload.next_cursor || null,
          has_more: !!payload.has_more
        };
      }
    },
    'notion.whoami': {
      description: 'Return the integration bot identity and workspace metadata.',
      scope: 'notion.admin',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      outputSchema: {
        type: 'object',
        properties: {
          bot_id: { type: 'string' },
          workspace_id: { type: 'string' },
          owner: { type: 'object' }
        },
        required: ['bot_id']
      },
      handler: async (record) => ({
        bot_id: record.notion.bot_id || '',
        workspace_id: record.notion.workspace_id || '',
        owner: record.notion.owner || null
      })
    }
  };

  const toolList = Object.entries(toolSchemas).map(([name, def]) => ({
    name,
    description: def.description,
    inputSchema: def.inputSchema,
    outputSchema: def.outputSchema
  }));

  const validators = new Map(Object.entries(toolSchemas).map(([name, def]) => [name, ajv.compile(def.inputSchema)]));

  return { toolSchemas, toolList, validators };
}

module.exports = { buildTools };
