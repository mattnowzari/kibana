/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import axios from 'axios';
import type { SubActionConnectorType } from '@kbn/actions-plugin/server/sub_action_framework/types';
import type { PostSaveConnectorHookParams } from '@kbn/actions-plugin/server/sub_action_framework/types';
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
} from '@kbn/connector-schemas/mcp';
import type {
  ConnectorTypeConfigType as Config,
  ConnectorTypeSecretsType as Secrets,
} from '@kbn/connector-schemas/mcp';
import { ToolType } from '@kbn/onechat-common';
import { snakeCase } from 'lodash';
import { McpConnector } from './mcp_connector';

function deriveServerName(url: string): string {
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname.toLowerCase();
    hostname = hostname.replace(/^(www|api|mcp)\./, '');
    const parts = hostname.split('.');
    const serverName = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    return serverName.replace(/[^a-z0-9]/g, '-');
  } catch {
    return 'mcp-server';
  }
}

async function fetchConnectorName(args: {
  baseUrl: string;
  headers: Record<string, string>;
  connectorId: string;
}): Promise<string | undefined> {
  const { baseUrl, headers, connectorId } = args;
  try {
    const res = await axios.get<{ name?: string }>(
      `${baseUrl}/api/actions/connector/${connectorId}`,
      {
        headers: {
          ...headers,
          'Elastic-Api-Version': '2023-10-31',
          Accept: 'application/json',
        },
      }
    );
    return res.data?.name;
  } catch {
    return undefined;
  }
}

async function createAgentBuilderTools(
  params: PostSaveConnectorHookParams<Config, Secrets>,
  logger: Logger
): Promise<void> {
  const { connectorId, config, request, wasSuccessful } = params;
  if (!wasSuccessful || !config.selected_tools || config.selected_tools.length === 0) {
    return;
  }

  const serverName = deriveServerName(config.url);
  let protocol = 'http';
  const forwardedProto = request.headers['x-forwarded-proto'];
  if (Array.isArray(forwardedProto)) {
    protocol = forwardedProto[0] || 'http';
  } else if (typeof forwardedProto === 'string' && forwardedProto.length > 0) {
    protocol = forwardedProto;
  }
  const hostHeader = request.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const baseUrl = host ? `${protocol}://${host}` : 'http://localhost:5601';
  const authHeaders: Record<string, string> = {};
  const authHeader = request.headers.authorization;
  if (authHeader) {
    authHeaders.Authorization = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  }
  const cookie = request.headers.cookie;
  if (cookie) {
    authHeaders.Cookie = Array.isArray(cookie) ? cookie.join('; ') : cookie;
  }

  const connectorName = await fetchConnectorName({ baseUrl, headers: authHeaders, connectorId });
  const namespace = snakeCase(connectorName ?? serverName);

  for (const toolName of config.selected_tools) {
    const toolId = `mcp.${namespace}.${toolName}`;
    try {
      await axios.post(
        `${baseUrl}/api/agent_builder/tools`,
        {
          id: toolId,
          type: ToolType.mcp,
          description: `MCP tool: ${toolName}`,
          tags: [],
          configuration: {
            connector_id: connectorId,
            tool_name: toolName,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'kbn-xsrf': 'mcp-tool-create',
            'Elastic-Api-Version': '2023-10-31',
            ...authHeaders,
          },
        }
      );
      logger.debug(`Created Agent Builder tool: ${toolId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to create Agent Builder tool ${toolId}: ${message}`);
    }
  }
}

export function getConnectorType(): SubActionConnectorType<Config, Secrets> {
  return {
    id: CONNECTOR_ID,
    minimumLicenseRequired: 'gold',
    name: CONNECTOR_NAME,
    supportedFeatureIds: [
      AlertingConnectorFeatureId,
      UptimeConnectorFeatureId,
      SecurityConnectorFeatureId,
    ],
    schema: {
      config: ConfigSchema,
      secrets: SecretsSchema,
    },
    getService: (params) => new McpConnector(params),
    postSaveHook: async (params) => {
      await createAgentBuilderTools(params, params.logger);
    },
  };
}
