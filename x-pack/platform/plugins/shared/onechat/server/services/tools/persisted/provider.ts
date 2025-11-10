/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { ToolType, createBadRequestError, isToolNotFoundError } from '@kbn/onechat-common';
import type { Logger } from '@kbn/logging';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { WritableToolProvider, ToolProviderFn, InternalToolDefinition } from '../tool_provider';
import type { AnyToolTypeDefinition, ToolTypeDefinition } from '../tool_types/definitions';
import { isEnabledDefinition } from '../tool_types/definitions';
import { createClient } from './client';
import type {
  ToolTypeValidatorContext,
  ToolTypeConversionContext,
} from '../tool_types/definitions';
import { convertPersistedDefinition } from './converter';
import { expandMcpTool, parseExpandedMcpToolId } from './mcp_expansion';
import type { PluginStartContract as ActionsPluginStart } from '@kbn/actions-plugin/server';

export const createPersistedProviderFn =
  (opts: {
    logger: Logger;
    esClient: ElasticsearchClient;
    toolTypes: AnyToolTypeDefinition[];
    getActions?: () => ActionsPluginStart | undefined;
  }): ToolProviderFn<false> =>
  ({ request, space }) => {
    return createPersistedToolClient({
      ...opts,
      request,
      space,
    });
  };

export const createPersistedToolClient = ({
  request,
  toolTypes,
  logger,
  esClient,
  space,
  getActions,
}: {
  toolTypes: AnyToolTypeDefinition[];
  logger: Logger;
  esClient: ElasticsearchClient;
  space: string;
  request: KibanaRequest;
  getActions?: () => ActionsPluginStart | undefined;
}): WritableToolProvider => {
  const toolClient = createClient({ space, esClient, logger });
  const definitionMap = toolTypes.filter(isEnabledDefinition).reduce((map, def) => {
    map[def.toolType] = def;
    return map;
  }, {} as Record<ToolType, ToolTypeDefinition>);

  const validationContext = (): ToolTypeValidatorContext => {
    return {
      esClient,
      request,
      spaceId: space,
    };
  };

  const conversionContext = (): ToolTypeConversionContext => {
    return {
      esClient,
      request,
      spaceId: space,
    };
  };

  return {
    id: 'persisted',
    readonly: false,

    async has(toolId: string) {
      // Check if this is an expanded MCP tool ID
      const parsed = parseExpandedMcpToolId(toolId);
      if (parsed) {
        // Check if the original tool exists
        try {
          await toolClient.get(parsed.originalId);
          return true;
        } catch (e) {
          if (isToolNotFoundError(e)) {
            return false;
          }
          throw e;
        }
      }

      // Regular tool ID check
      try {
        await toolClient.get(toolId);
        return true;
      } catch (e) {
        if (isToolNotFoundError(e)) {
          return false;
        }
        throw e;
      }
    },

    async get(toolId) {
      // Check if this is an expanded MCP tool ID
      const parsed = parseExpandedMcpToolId(toolId);
      if (parsed) {
        // Get the original tool and expand it
        const tool = await toolClient.get(parsed.originalId);
        const definition = definitionMap[tool.type];
        if (!definition) {
          throw createBadRequestError(`Unknown type for tool '${parsed.originalId}': '${tool.type}'`);
        }

        // Expand the tool and find the specific capability
        const expandedTools = await expandMcpTool({
          tool,
          definition,
          context: conversionContext(),
          getActions,
        });

        const expandedTool = expandedTools.find((t) => t.id === toolId);
        if (!expandedTool) {
          throw createBadRequestError(`Expanded MCP tool '${toolId}' not found`);
        }

        return expandedTool;
      }

      // Regular tool - check if it's an MCP tool that needs expansion
      const tool = await toolClient.get(toolId);
      const definition = definitionMap[tool.type];
      if (!definition) {
        throw createBadRequestError(`Unknown type for tool '${toolId}': '${tool.type}'`);
      }

      // If it's an MCP tool, expand it (but return all, caller will filter if needed)
      if (tool.type === ToolType.mcp) {
        const expandedTools = await expandMcpTool({
          tool,
          definition,
          context: conversionContext(),
          getActions,
        });
        // If expansion resulted in multiple tools, this shouldn't happen for get()
        // But if it did, return the first one (or we could throw an error)
        if (expandedTools.length > 1) {
          // This means the tool was expanded - but get() should only return one
          // The caller should be using the expanded ID
          throw createBadRequestError(
            `MCP tool '${toolId}' has been expanded. Use expanded tool IDs like '${toolId}__mcp__{capability}'`
          );
        }
        return expandedTools[0];
      }

      return convertPersistedDefinition({ tool, definition, context: conversionContext() });
    },

    async list() {
      const tools = await toolClient.list();
      const context = conversionContext();
      const allTools: InternalToolDefinition[] = [];

      for (const tool of tools) {
        // evict unknown tools - atm it's used for workflow tools if the plugin is disabled.
        if (!definitionMap[tool.type]) {
          continue;
        }

        const definition = definitionMap[tool.type]!;

        // Expand MCP tools into multiple tools
        if (tool.type === ToolType.mcp) {
          const expandedTools = await expandMcpTool({
            tool,
            definition,
            context,
            getActions,
          });
          allTools.push(...expandedTools);
        } else {
          allTools.push(convertPersistedDefinition({ tool, definition, context }));
        }
      }

      return allTools;
    },

    async create(createRequest) {
      const definition = definitionMap[createRequest.type];
      if (!definition) {
        throw createBadRequestError(`Unknown tool type: '${createRequest.type}'`);
      }

      try {
        definition.createSchema.validate(createRequest.configuration);
      } catch (e) {
        throw createBadRequestError(
          `Invalid configuration for tool type ${createRequest.type}: ${e.message}`
        );
      }

      let updatedConfig: Record<string, unknown>;
      try {
        updatedConfig = await definition.validateForCreate({
          config: createRequest.configuration,
          context: validationContext(),
        });
      } catch (e) {
        throw createBadRequestError(
          `Invalid configuration for tool type ${createRequest.type}: ${e.message}`
        );
      }

      const mergedRequest = {
        ...createRequest,
        configuration: updatedConfig,
      };

      const tool = await toolClient.create(mergedRequest);

      return convertPersistedDefinition({ tool, definition, context: conversionContext() });
    },

    async update(toolId, updateRequest) {
      // Parse expanded MCP tool ID to get original ID
      const parsed = parseExpandedMcpToolId(toolId);
      const originalToolId = parsed ? parsed.originalId : toolId;

      // Get the original tool (not expanded)
      const tool = await toolClient.get(originalToolId);
      const definition = definitionMap[tool.type];
      if (!definition) {
        throw createBadRequestError(`Unknown type for tool '${originalToolId}': '${tool.type}'`);
      }

      // If trying to update an expanded ID, throw error
      if (parsed) {
        throw createBadRequestError(
          `Cannot update expanded MCP tool '${toolId}'. Update the original tool '${originalToolId}' instead.`
        );
      }

      try {
        definition.updateSchema.validate(updateRequest.configuration);
      } catch (e) {
        throw createBadRequestError(
          `Invalid configuration for tool type ${tool.type}: ${e.message}`
        );
      }

      let updatedConfig: Record<string, unknown>;
      try {
        updatedConfig = await definition.validateForUpdate({
          update: updateRequest.configuration ?? {},
          current: tool.configuration,
          context: validationContext(),
        });
      } catch (e) {
        throw createBadRequestError(
          `Invalid configuration for tool type ${tool.type}: ${e.message}`
        );
      }

      const mergedConfig = {
        ...updateRequest,
        configuration: updatedConfig,
      };
      const updatedTool = await toolClient.update(originalToolId, mergedConfig);
      return convertPersistedDefinition({ tool: updatedTool, definition, context: conversionContext() });
    },

    async delete(toolId: string) {
      // Parse expanded MCP tool ID to get original ID
      const parsed = parseExpandedMcpToolId(toolId);
      const originalToolId = parsed ? parsed.originalId : toolId;

      // If trying to delete an expanded ID, throw error
      if (parsed) {
        throw createBadRequestError(
          `Cannot delete expanded MCP tool '${toolId}'. Delete the original tool '${originalToolId}' instead.`
        );
      }

      return toolClient.delete(originalToolId);
    },
  };
};
