/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { Logger } from '@kbn/logging';
import type { ActionsConfigurationUtilities } from '@kbn/actions-plugin/server/actions_config';
import {
  SUPPORTED_PROTOCOL_VERSIONS,
  DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
} from '@modelcontextprotocol/sdk/types.js';
import { getCustomAgents } from '@kbn/actions-plugin/server/lib/get_custom_agents';

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface McpInitializeParams {
  protocolVersion?: string;
  capabilities?: Record<string, any>;
  clientInfo?: {
    name: string;
    version: string;
  };
}

export interface McpCallToolParams {
  name: string;
  arguments?: Record<string, any>;
}

export class McpClient {
  private axiosInstance: AxiosInstance;
  private protocolVersion: string = DEFAULT_NEGOTIATED_PROTOCOL_VERSION;
  private initialized: boolean = false;
  private logger: Logger;

  constructor(
    url: string,
    apiKey: string | undefined,
    logger: Logger,
    configurationUtilities?: ActionsConfigurationUtilities
  ) {
    this.logger = logger;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const axiosConfig: any = {
      baseURL: url,
      headers,
      timeout: 30000,
    };

    // Use custom agents for proper SSL/TLS handling if configurationUtilities is provided
    if (configurationUtilities) {
      const customAgents = getCustomAgents(configurationUtilities, logger, url);
      axiosConfig.httpAgent = customAgents.httpAgent;
      axiosConfig.httpsAgent = customAgents.httpsAgent;
    }

    this.axiosInstance = axios.create(axiosConfig);
  }

  async initialize(params?: McpInitializeParams): Promise<void> {
    if (this.initialized) {
      return;
    }

    const requestId = this.generateRequestId();
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'initialize',
      params: {
        protocolVersion: params?.protocolVersion || DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
        capabilities: params?.capabilities || {},
        clientInfo: params?.clientInfo || {
          name: 'kibana-mcp-connector',
          version: '1.0.0',
        },
      },
    };

    try {
      const response = await this.axiosInstance.post('', request);
      let result = response.data;

      // Handle batch responses (array) or single response
      if (Array.isArray(result)) {
        result = result.find((r) => r.id === requestId) || result[0];
      }

      if (result.error) {
        throw new Error(`MCP initialization failed: ${result.error.message || 'Unknown error'}`);
      }

      if (result.result?.protocolVersion) {
        const serverVersion = result.result.protocolVersion;
        if (SUPPORTED_PROTOCOL_VERSIONS.includes(serverVersion)) {
          this.protocolVersion = serverVersion;
        } else {
          this.logger.warn(
            `Unsupported MCP protocol version: ${serverVersion}. Using default: ${DEFAULT_NEGOTIATED_PROTOCOL_VERSION}`
          );
        }
      }

      this.initialized = true;
      this.logger.debug('MCP client initialized successfully');
    } catch (error: any) {
      this.logger.error(`MCP initialization error: ${error.message}`);
      throw new Error(`Failed to initialize MCP connection: ${error.message}`);
    }
  }

  async listTools(): Promise<McpToolDefinition[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const requestId = this.generateRequestId();
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/list',
    };

    try {
      const config: AxiosRequestConfig = {
        headers: {
          'mcp-protocol-version': this.protocolVersion,
        },
      };

      const response = await this.axiosInstance.post('', request, config);
      let result = response.data;

      // Handle batch responses (array) or single response
      if (Array.isArray(result)) {
        result = result.find((r) => r.id === requestId) || result[0];
      }

      if (result.error) {
        throw new Error(`MCP tools/list failed: ${result.error.message || 'Unknown error'}`);
      }

      return result.result?.tools || [];
    } catch (error: any) {
      this.logger.error(`MCP tools/list error: ${error.message}`);
      throw new Error(`Failed to list MCP tools: ${error.message}`);
    }
  }

  async callTool(params: McpCallToolParams): Promise<any> {
    if (!this.initialized) {
      await this.initialize();
    }

    const requestId = this.generateRequestId();
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name: params.name,
        arguments: params.arguments || {},
      },
    };

    try {
      const config: AxiosRequestConfig = {
        headers: {
          'mcp-protocol-version': this.protocolVersion,
        },
      };

      const response = await this.axiosInstance.post('', request, config);
      let result = response.data;

      // Handle batch responses (array) or single response
      if (Array.isArray(result)) {
        result = result.find((r) => r.id === requestId) || result[0];
      }

      if (result.error) {
        throw new Error(`MCP tools/call failed: ${result.error.message || 'Unknown error'}`);
      }

      return result.result;
    } catch (error: any) {
      this.logger.error(`MCP tools/call error: ${error.message}`);
      throw new Error(`Failed to call MCP tool: ${error.message}`);
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

