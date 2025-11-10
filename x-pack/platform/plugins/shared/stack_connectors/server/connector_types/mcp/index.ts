/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ActionTypeExecutorResult as ConnectorTypeExecutorResult } from '@kbn/actions-plugin/server/types';
import {
  AlertingConnectorFeatureId,
  SecurityConnectorFeatureId,
  UptimeConnectorFeatureId,
} from '@kbn/actions-plugin/common';
import {
  CONNECTOR_ID,
  CONNECTOR_NAME,
  ConfigSchema,
  SecretsSchema,
  ParamsSchema,
} from '@kbn/connector-schemas/mcp';
import type { McpConnectorType, McpConnectorTypeExecutorOptions } from './types';
import { McpClient } from './mcp_client';

export function getConnectorType(): McpConnectorType {
  return {
    id: CONNECTOR_ID,
    minimumLicenseRequired: 'gold',
    name: CONNECTOR_NAME,
    supportedFeatureIds: [
      AlertingConnectorFeatureId,
      UptimeConnectorFeatureId,
      SecurityConnectorFeatureId,
    ],
    validate: {
      config: {
        schema: ConfigSchema,
      },
      secrets: {
        schema: SecretsSchema,
      },
      params: {
        schema: ParamsSchema,
      },
    },
    executor,
  };
}

async function executor(
  execOptions: McpConnectorTypeExecutorOptions
): Promise<ConnectorTypeExecutorResult<unknown>> {
  const { actionId, config, params, secrets, logger, configurationUtilities } = execOptions;

  const client = new McpClient(config.url, secrets?.apiKey, logger, configurationUtilities);

  try {
    switch (params.method) {
      case 'initialize': {
        await client.initialize(params.params as any);
        return {
          status: 'ok',
          data: { initialized: true },
          actionId,
        };
      }

      case 'tools/list': {
        const tools = await client.listTools();
        return {
          status: 'ok',
          data: { tools },
          actionId,
        };
      }

      case 'tools/call': {
        if (!params.params || typeof params.params !== 'object') {
          return {
            status: 'error',
            actionId,
            message: 'Invalid params for tools/call: params must be an object with name and arguments',
            serviceMessage: 'Missing or invalid params for tools/call',
          };
        }

        const callParams = params.params as { name: string; arguments?: Record<string, any> };
        if (!callParams.name) {
          return {
            status: 'error',
            actionId,
            message: 'Invalid params for tools/call: name is required',
            serviceMessage: 'Missing tool name',
          };
        }

        const result = await client.callTool({
          name: callParams.name,
          arguments: callParams.arguments,
        });

        return {
          status: 'ok',
          data: result,
          actionId,
        };
      }

      default:
        return {
          status: 'error',
          actionId,
          message: `Unsupported MCP method: ${params.method}`,
          serviceMessage: `Method ${params.method} is not supported`,
        };
    }
  } catch (error: any) {
    logger.error(`MCP connector error [${actionId}]: ${error.message}`);
    return {
      status: 'error',
      actionId,
      message: `MCP operation failed: ${error.message}`,
      serviceMessage: error.message,
    };
  }
}

