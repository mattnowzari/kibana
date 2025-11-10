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

      // For MCP tools, we need to discover the tools and create handlers for each selected capability
      // For now, we'll create a single tool that can route to different capabilities
      return {
        getHandler: () => {
          return async (params, context) => {
            const actionsClient = await actions.getActionsClientWithRequest(request);
            const { toolName } = params as { toolName: string; [key: string]: any };

            if (!toolName) {
              throw new Error('toolName is required for MCP tools');
            }

            if (!config.selected_capabilities.includes(toolName)) {
              throw new Error(`Tool "${toolName}" is not in the selected capabilities`);
            }

            const toolParams = { ...params };
            delete toolParams.toolName;

            const results = await executeMcpTool(config.connector_id, toolName, toolParams, actionsClient);
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
          const selectedTools = availableTools.filter((t) =>
            config.selected_capabilities.includes(t.name)
          );

          // For now, return a schema that includes toolName and the union of all selected tool schemas
          // In the future, we could generate separate tools for each capability
          const toolNameEnum = z.enum(
            config.selected_capabilities as [string, ...string[]]
          ).describe('The name of the MCP tool to call');

          if (selectedTools.length === 0) {
            return z.object({
              toolName: toolNameEnum,
            });
          }

          // Merge all schemas - this is a simplified approach
          // In production, you'd want to generate separate tools
          const mergedShape: Record<string, z.ZodTypeAny> = {
            toolName: toolNameEnum,
          };

          // Add properties from all selected tools (with optional modifier since we don't know which tool is being called)
          for (const tool of selectedTools) {
            const toolSchema = convertMcpSchemaToZod(tool.inputSchema);
            const toolShape = toolSchema.shape;
            for (const [key, zodValue] of Object.entries(toolShape)) {
              if (!mergedShape[key]) {
                mergedShape[key] = (zodValue as z.ZodTypeAny).optional();
              }
            }
          }

          return z.object(mergedShape);
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

      // Discover tools to check availability
      let availableTools;
      try {
        availableTools = await discoverMcpTools(config.connector_id, actionsClient);
      } catch (error: any) {
        // If tool discovery fails, we still allow saving (user might fix the connector later)
        // But if capabilities are provided, we should validate them
        if (config.selected_capabilities && config.selected_capabilities.length > 0) {
          throw new Error(
            `Failed to discover MCP tools: ${error.message}. Cannot validate selected capabilities.`
          );
        }
        // No capabilities selected and discovery failed - allow saving
        return config;
      }

      // Only require capabilities if tools are available
      if (availableTools.length > 0) {
        if (!config.selected_capabilities || config.selected_capabilities.length === 0) {
          throw new Error('At least one MCP capability must be selected');
        }

        // Validate selected capabilities exist
        const availableToolNames = new Set(availableTools.map((t) => t.name));
        for (const capability of config.selected_capabilities) {
          if (!availableToolNames.has(capability)) {
            throw new Error(`MCP capability "${capability}" not found on server`);
          }
        }
      } else {
        // No tools available - capabilities are optional
        // User can save the tool even if no tools are found
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

      // Validate selected capabilities if provided
      if (mergedConfig.selected_capabilities && mergedConfig.selected_capabilities.length > 0) {
        const availableTools = await discoverMcpTools(mergedConfig.connector_id, actionsClient);
        const availableToolNames = new Set(availableTools.map((t) => t.name));

        for (const capability of mergedConfig.selected_capabilities) {
          if (!availableToolNames.has(capability)) {
            throw new Error(`MCP capability "${capability}" not found on server`);
          }
        }
      }

      return mergedConfig;
    },
  };
};

