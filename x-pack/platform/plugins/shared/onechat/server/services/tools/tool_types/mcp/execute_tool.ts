/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ActionsClient } from '@kbn/actions-plugin/server';
import type { ToolHandlerResult } from '@kbn/onechat-server/tools';
import { ToolResultType } from '@kbn/onechat-common/tools';
import { createErrorResult } from '@kbn/onechat-server';

export async function executeMcpTool(
  connectorId: string,
  toolName: string,
  toolParams: Record<string, any>,
  actionsClient: ActionsClient
): Promise<ToolHandlerResult[]> {
  try {
    const result = await actionsClient.execute({
      actionId: connectorId,
      params: {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: toolParams,
        },
      },
    });

    if (result.status === 'error') {
      return [
        createErrorResult({
          message: `MCP tool execution failed: ${result.message || 'Unknown error'}`,
          metadata: {
            connectorId,
            toolName,
          },
        }),
      ];
    }

    // MCP tools return content in a specific format
    const mcpResult = result.data as any;
    let content: string;

    if (mcpResult?.content) {
      // Handle MCP content format (array of content items)
      if (Array.isArray(mcpResult.content)) {
        content = mcpResult.content
          .map((item: any) => {
            if (item.type === 'text') {
              return item.text;
            }
            return JSON.stringify(item);
          })
          .join('\n');
      } else {
        content = String(mcpResult.content);
      }
    } else {
      content = JSON.stringify(mcpResult, null, 2);
    }

    return [
      {
        type: ToolResultType.other,
        data: {
          content,
          toolName,
          connectorId,
        },
      },
    ];
  } catch (error: any) {
    return [
      createErrorResult({
        message: `Error executing MCP tool: ${error.message}`,
        metadata: {
          connectorId,
          toolName,
        },
      }),
    ];
  }
}

