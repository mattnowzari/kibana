/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type {
  IRouter,
  RequestHandlerContext,
  KibanaRequest,
  IKibanaResponse,
  KibanaResponseFactory,
  Logger,
} from '@kbn/core/server';
import type { ActionsConfigurationUtilities } from '@kbn/actions-plugin/server/actions_config';
import { INTERNAL_BASE_STACK_CONNECTORS_API_PATH } from '../../common';
import { McpSdkClient } from '../connector_types/mcp/mcp_sdk_client';

const bodySchema = schema.object({
  url: schema.string({ minLength: 1 }),
});

export const mcpDiscoverRoute = (
  router: IRouter,
  configurationUtilities: ActionsConfigurationUtilities,
  logger: Logger
) => {
  router.post(
    {
      path: `${INTERNAL_BASE_STACK_CONNECTORS_API_PATH}/mcp/discover`,
      security: {
        authz: {
          requiredPrivileges: ['actions:save'],
        },
      },
      validate: {
        body: bodySchema,
      },
      options: {
        access: 'internal',
      },
    },
    handler
  );

  async function handler(
    ctx: RequestHandlerContext,
    req: KibanaRequest<unknown, unknown, { url: string }>,
    res: KibanaResponseFactory
  ): Promise<IKibanaResponse> {
    const { url } = req.body;

    try {
      const client = new McpSdkClient(url, logger, configurationUtilities);
      await client.initialize();
      const tools = await client.listTools();

      return res.ok({
        body: {
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`MCP discovery error: ${message}`);
      return res.badRequest({
        body: {
          error: `Failed to discover MCP tools: ${message}`,
        },
      });
    }
  }
};

