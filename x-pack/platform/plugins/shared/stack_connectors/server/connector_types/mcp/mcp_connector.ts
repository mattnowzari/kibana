/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ServiceParams } from '@kbn/actions-plugin/server';
import { SubActionConnector } from '@kbn/actions-plugin/server';
import type { AxiosError } from 'axios';
import { z } from '@kbn/zod';
import { McpSdkClient, type McpToolDefinition } from './mcp_sdk_client';
import type {
  ConnectorTypeConfigType as Config,
  ConnectorTypeSecretsType as Secrets,
} from '@kbn/connector-schemas/mcp';

const InitializeParamsSchema = z
  .object({
    protocolVersion: z.string().optional(),
    capabilities: z.record(z.unknown()).optional(),
    clientInfo: z
      .object({
        name: z.string(),
        version: z.string(),
      })
      .optional(),
  })
  .optional();

const ListToolsResponseSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      inputSchema: z.object({
        type: z.string(),
        properties: z.record(z.unknown()).optional(),
        required: z.array(z.string()).optional(),
      }),
    })
  ),
});

const CallToolParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.unknown()).optional(),
});

export class McpConnector extends SubActionConnector<Config, Secrets> {
  private client: McpSdkClient;

  constructor(params: ServiceParams<Config, Secrets>) {
    super(params);
    this.client = new McpSdkClient(
      this.config.url,
      this.logger,
      this.configurationUtilities
    );
    this.registerSubActions();
  }

  private registerSubActions() {
    this.registerSubAction({
      name: 'initialize',
      method: 'initialize',
      schema: InitializeParamsSchema,
    });

    this.registerSubAction({
      name: 'listTools',
      method: 'listTools',
      schema: null,
    });

    this.registerSubAction({
      name: 'callTool',
      method: 'callTool',
      schema: CallToolParamsSchema,
    });
  }

  protected getResponseErrorMessage(error: AxiosError): string {
    if (!error.response?.status) {
      return `Unexpected API Error: ${error.code ?? ''} - ${error.message ?? 'Unknown error'}`;
    }
    if (error.response?.data) {
      const data = error.response.data as { error?: { message?: string } };
      if (data.error?.message) {
        return `API Error: ${data.error.message}`;
      }
    }
    return `API Error: ${error.response?.statusText}${
      error.response?.data ? ` - ${JSON.stringify(error.response.data)}` : ''
    }`;
  }

  public async initialize(params?: z.infer<typeof InitializeParamsSchema>): Promise<void> {
    await this.client.initialize(params);
  }

  public async listTools(): Promise<{ tools: McpToolDefinition[] }> {
    const tools = await this.client.listTools();
    return { tools };
  }

  public async callTool(params: z.infer<typeof CallToolParamsSchema>): Promise<unknown> {
    const result = await this.client.callTool({
      name: params.name,
      arguments: params.arguments,
    });
    return result;
  }
}

