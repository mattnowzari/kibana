/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InternalToolDefinition } from '../tool_provider';
import type { ToolTypeDefinition } from '../tool_types/definitions';
import type { ToolTypeConversionContext } from '../tool_types/definitions';
import type { ToolPersistedDefinition } from './client';
import { ToolType } from '@kbn/onechat-common';
import type { McpToolConfig } from '@kbn/onechat-common/tools/types/mcp';
import { convertPersistedDefinition } from './converter';
import { discoverMcpTools } from '../tool_types/mcp/discover_tools';
import { executeMcpTool } from '../tool_types/mcp/execute_tool';
import { convertMcpSchemaToZod } from '../tool_types/mcp/schema_converter';
import type { PluginStartContract as ActionsPluginStart } from '@kbn/actions-plugin/server';
import { z } from '@kbn/zod';

/**
 * Separator used in expanded MCP tool IDs: {originalId}__mcp__{capabilityName}
 */
export const MCP_TOOL_ID_SEPARATOR = '__mcp__';

/**
 * Parses an expanded MCP tool ID to extract the original tool ID and capability name
 * @returns { originalId, capabilityName } or null if not an expanded MCP tool ID
 */
export function parseExpandedMcpToolId(toolId: string): { originalId: string; capabilityName: string } | null {
  const parts = toolId.split(MCP_TOOL_ID_SEPARATOR);
  if (parts.length !== 2) {
    return null;
  }
  return {
    originalId: parts[0],
    capabilityName: parts[1],
  };
}

/**
 * Creates an expanded MCP tool ID from the original tool ID and capability name
 */
export function createExpandedMcpToolId(originalId: string, capabilityName: string): string {
  return `${originalId}${MCP_TOOL_ID_SEPARATOR}${capabilityName}`;
}

/**
 * Expands a single MCP tool into multiple InternalToolDefinition instances,
 * one for each selected capability
 */
export async function expandMcpTool({
  tool,
  definition,
  context,
  getActions,
}: {
  tool: ToolPersistedDefinition;
  definition: ToolTypeDefinition;
  context: ToolTypeConversionContext;
  getActions?: () => ActionsPluginStart | undefined;
}): Promise<InternalToolDefinition[]> {
  if (tool.type !== ToolType.mcp) {
    // Not an MCP tool, return as-is
    return [convertPersistedDefinition({ tool, definition, context })];
  }

  const config = tool.configuration as McpToolConfig;
  const { request, spaceId } = context;
  const actions = getActions?.();

  if (!actions) {
    // Actions not available, return original tool
    return [convertPersistedDefinition({ tool, definition, context })];
  }

  const selectedCapabilities = config.selected_capabilities || [];
  if (selectedCapabilities.length === 0) {
    // No capabilities selected, return original tool
    return [convertPersistedDefinition({ tool, definition, context })];
  }

  // Discover available tools from the MCP server
  let availableTools;
  try {
    const actionsClient = await actions.getActionsClientWithRequest(request);
    availableTools = await discoverMcpTools(config.connector_id, actionsClient);
  } catch (error: any) {
    // If discovery fails, return original tool
    return [convertPersistedDefinition({ tool, definition, context })];
  }

  // Create a map of capability name to tool definition
  const toolMap = new Map(availableTools.map((t) => [t.name, t]));

  // Expand into multiple tools, one per selected capability
  const expandedTools: InternalToolDefinition[] = [];

  for (const capabilityName of selectedCapabilities) {
    const mcpTool = toolMap.get(capabilityName);
    if (!mcpTool) {
      // Capability not found, skip it
      continue;
    }

    const expandedToolId = createExpandedMcpToolId(tool.id, capabilityName);
    const actionsClient = await actions.getActionsClientWithRequest(request);

    // Create handler for this specific capability
    const getHandler = async () => {
      return async (params: Record<string, any>, handlerContext: any) => {
        const results = await executeMcpTool(
          config.connector_id,
          capabilityName,
          params,
          actionsClient
        );
        return { results };
      };
    };

    // Create schema for this specific capability
    const getSchema = async () => {
      const toolSchema = convertMcpSchemaToZod(mcpTool.inputSchema);
      return toolSchema;
    };

    expandedTools.push({
      id: expandedToolId,
      type: ToolType.mcp,
      description: mcpTool.description || `${tool.description || 'MCP tool'}: ${capabilityName}`,
      tags: tool.tags,
      configuration: tool.configuration,
      readonly: false,
      getHandler,
      getSchema,
      getLlmDescription: async (args) => {
        return mcpTool.description || `${tool.description || 'MCP tool'}: ${capabilityName}`;
      },
    });
  }

  return expandedTools.length > 0 ? expandedTools : [convertPersistedDefinition({ tool, definition, context })];
}

