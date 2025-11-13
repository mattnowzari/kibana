/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { McpToolDefinition } from '../../../../../../stack_connectors/server/connector_types/mcp/mcp_client';

export interface DiscoveredMcpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export async function discoverMcpTools(
  connectorId: string,
  actionsClient: ActionsClient
): Promise<DiscoveredMcpTool[]> {
  try {
    const result = await actionsClient.execute({
      actionId: connectorId,
      params: {
        subAction: 'listTools',
        subActionParams: {},
      },
    });

    if (result.status === 'error') {
      throw new Error(result.message || 'Failed to discover MCP tools');
    }

    const tools = (result.data as { tools?: McpToolDefinition[] })?.tools || [];
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  } catch (error: any) {
    throw new Error(`Failed to discover MCP tools: ${error.message}`);
  }
}

