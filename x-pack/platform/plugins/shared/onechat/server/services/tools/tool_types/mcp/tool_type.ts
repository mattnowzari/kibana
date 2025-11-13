/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import type { PluginStartContract as ActionsPluginStart } from '@kbn/actions-plugin/server';
import { ToolType } from '@kbn/onechat-common';
import type { McpToolConfig } from '@kbn/onechat-common/tools/types/mcp';
import type { AnyToolTypeDefinition } from '../definitions';
import { configurationSchema, configurationUpdateSchema } from './schemas';
import { discoverMcpTools } from './discover_tools';
import { executeMcpTool } from './execute_tool';
import { convertMcpSchemaToZod } from './schema_converter';

export const getMcpToolType = ({
  getActions,
}: {
  getActions?: () => ActionsPluginStart | undefined;
}): AnyToolTypeDefinition<ToolType.mcp, McpToolConfig, z.ZodObject<any>> => {
  if (!getActions) {
    return {
      toolType: ToolType.mcp,
      disabled: true,
    };
  }

  return {
    toolType: ToolType.mcp,
    getDynamicProps: (config, { request, spaceId }) => {
      const actions = getActions?.();
      if (!actions) {
        throw new Error('Actions plugin is not available');
      }

      // Each MCP tool maps to a single tool_name from the connector
      return {
        getHandler: () => {
          return async (params, context) => {
            const actionsClient = await actions.getActionsClientWithRequest(request);
            const results = await executeMcpTool(
              config.connector_id,
              config.tool_name,
              params,
              actionsClient
            );
            return { results };
          };
        },
        getSchema: async () => {
          const actions = getActions?.();
          if (!actions) {
            return z.object({});
          }

          const actionsClient = await actions.getActionsClientWithRequest(request);
          const availableTools = await discoverMcpTools(config.connector_id, actionsClient);
          const toolDef = availableTools.find((t) => t.name === config.tool_name);

          if (!toolDef) {
            // Tool not found - return empty schema
            return z.object({});
          }

          // Convert the tool's input schema to zod
          return convertMcpSchemaToZod(toolDef.inputSchema);
        },
      };
    },

    createSchema: configurationSchema,
    updateSchema: configurationUpdateSchema,
    validateForCreate: async ({ config, context: { request, spaceId } }) => {
      const actions = getActions?.();
      if (!actions) {
        throw new Error('Actions plugin is not available');
      }

      const actionsClient = await actions.getActionsClientWithRequest(request);

      // Validate connector exists, is accessible, and is an MCP connector
      let connector;
      try {
        connector = await actionsClient.get({ id: config.connector_id });
      } catch (error: any) {
        if (error.statusCode === 404) {
          throw new Error(`MCP connector not found: ${config.connector_id}`);
        }
        throw new Error(
          `Failed to access MCP connector ${config.connector_id}: ${error.message || error}`
        );
      }

      // Verify it's an MCP connector
      if (connector.actionTypeId !== '.mcp') {
        throw new Error(
          `Connector ${config.connector_id} is not an MCP connector (type: ${connector.actionTypeId})`
        );
      }

      // Validate tool_name exists on the server
      let availableTools;
      try {
        availableTools = await discoverMcpTools(config.connector_id, actionsClient);
      } catch (error: any) {
        // If tool discovery fails, we still allow saving (user might fix the connector later)
        // But if tool_name is provided, we should validate it
        if (config.tool_name) {
          throw new Error(
            `Failed to discover MCP tools: ${error.message}. Cannot validate tool name.`
          );
        }
        // No tool_name provided and discovery failed - allow saving
        return config;
      }

      // Validate tool_name exists
      if (!config.tool_name) {
        throw new Error('Tool name is required');
      }

      const availableToolNames = new Set(availableTools.map((t) => t.name));
      if (!availableToolNames.has(config.tool_name)) {
        throw new Error(`MCP tool "${config.tool_name}" not found on server`);
      }

      return config;
    },
    validateForUpdate: async ({ update, current, context: { request, spaceId } }) => {
      const mergedConfig = {
        ...current,
        ...update,
      };

      const actions = getActions?.();
      if (!actions) {
        throw new Error('Actions plugin is not available');
      }

      const actionsClient = await actions.getActionsClientWithRequest(request);

      // Validate connector exists, is accessible, and is an MCP connector
      let connector;
      try {
        connector = await actionsClient.get({ id: mergedConfig.connector_id });
      } catch (error: any) {
        if (error.statusCode === 404) {
          throw new Error(`MCP connector not found: ${mergedConfig.connector_id}`);
        }
        throw new Error(
          `Failed to access MCP connector ${mergedConfig.connector_id}: ${error.message || error}`
        );
      }

      // Verify it's an MCP connector
      if (connector.actionTypeId !== '.mcp') {
        throw new Error(
          `Connector ${mergedConfig.connector_id} is not an MCP connector (type: ${connector.actionTypeId})`
        );
      }

      // Validate tool_name if provided
      if (mergedConfig.tool_name) {
        const availableTools = await discoverMcpTools(mergedConfig.connector_id, actionsClient);
        const availableToolNames = new Set(availableTools.map((t) => t.name));

        if (!availableToolNames.has(mergedConfig.tool_name)) {
          throw new Error(`MCP tool "${mergedConfig.tool_name}" not found on server`);
        }
      }

      return mergedConfig;
    },
  };
};

