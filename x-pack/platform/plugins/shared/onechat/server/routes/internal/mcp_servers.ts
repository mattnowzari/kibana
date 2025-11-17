/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { snakeCase } from 'lodash';
import { ToolType } from '@kbn/onechat-common';
import type { RouteDependencies } from '../types';
import { getHandlerWrapper } from '../wrap_handler';
import { apiPrivileges } from '../../../common/features';
import { internalApiPath } from '../../../common/constants';

const MCP_CONNECTOR_TYPE_ID = '.mcp';

interface McpServerListItem {
  id: string;
  name: string;
  url: string;
  connected: boolean;
  availableToolCount: number;
  activeToolCount: number;
}

interface McpServerDetails {
  connector: {
    id: string;
    name: string;
    url: string;
  };
  connected: boolean;
  availableTools: Array<{ name: string; description?: string }>;
  activeToolIds: string[];
}

export function registerInternalMcpServersRoutes({
  router,
  getInternalServices,
  logger,
  coreSetup,
  pluginsSetup,
}: RouteDependencies) {
  const wrapHandler = getHandlerWrapper({ logger });
  const configurationUtilities = pluginsSetup.actions.getActionsConfigurationUtilities();

  // List all MCP servers (connectors)
  router.get(
    {
      path: `${internalApiPath}/mcp/servers`,
      validate: false,
      options: { access: 'internal' },
      security: {
        authz: { requiredPrivileges: [apiPrivileges.readOnechat] },
      },
    },
    wrapHandler(async (ctx, request, response) => {
      const [, { actions }] = await coreSetup.getStartServices();
      const { tools: toolService } = getInternalServices();

      if (!actions) {
        return response.ok({ body: { servers: [] } });
      }

      const actionsClient = await actions.getActionsClientWithRequest(request);

      // Get all connectors and filter for MCP type
      const allConnectors = await actionsClient.getAll();
      const mcpConnectors = allConnectors.filter(
        (c: any) => c.actionTypeId === MCP_CONNECTOR_TYPE_ID
      );

      // Get all tools to count active tools per connector
      const registry = await toolService.getRegistry({ request });
      const allTools = await registry.list({});
      const mcpTools = allTools.filter((t) => t.type === ToolType.mcp);

      const servers: McpServerListItem[] = await Promise.all(
        mcpConnectors.map(async (connector: any) => {
          let connected = false;
          let availableToolCount = 0;

          // Try to connect and discover tools through the connector executor
          try {
            const execRes = await actionsClient.execute({
              actionId: connector.id,
              params: { subAction: 'listTools', subActionParams: {} },
            });
            if ((execRes as any).status !== 'error') {
              const tools = ((execRes as any).data?.tools ?? []) as Array<{ name: string }>;
              availableToolCount = tools.length;
              // Consider server "connected" only if it returns at least one tool
              connected = tools.length > 0;
            }
          } catch (error) {
            logger.debug(`Failed to connect to MCP server ${connector.id}: ${error}`);
          }

          // Count active tools for this connector
          const activeToolCount = mcpTools.filter(
            (t) => (t.configuration as any)?.connector_id === connector.id
          ).length;

          return {
            id: connector.id,
            name: connector.name,
            url: (connector.config as any)?.url || '',
            connected,
            availableToolCount,
            activeToolCount,
          };
        })
      );

      return response.ok({ body: { servers } });
    })
  );

  // Get details for a specific MCP server
  router.get(
    {
      path: `${internalApiPath}/mcp/servers/{id}`,
      validate: {
        params: schema.object({
          id: schema.string(),
        }),
      },
      options: { access: 'internal' },
      security: {
        authz: { requiredPrivileges: [apiPrivileges.readOnechat] },
      },
    },
    wrapHandler(async (ctx, request, response) => {
      const { id } = request.params;
      const [, { actions }] = await coreSetup.getStartServices();
      const { tools: toolService } = getInternalServices();

      if (!actions) {
        return response.notFound({ body: { message: 'Actions plugin not available' } });
      }

      const actionsClient = await actions.getActionsClientWithRequest(request);

      // Get the connector
      let connector;
      try {
        connector = await actionsClient.get({ id });
      } catch (error) {
        return response.notFound({ body: { message: `Connector ${id} not found` } });
      }

      if (connector.actionTypeId !== MCP_CONNECTOR_TYPE_ID) {
        return response.badRequest({ body: { message: 'Connector is not an MCP connector' } });
      }

      let connected = false;
      let availableTools: Array<{ name: string; description?: string }> = [];

      // Try to discover tools via connector executor
      try {
        const execRes = await actionsClient.execute({
          actionId: connector.id,
          params: { subAction: 'listTools', subActionParams: {} },
        });
        if ((execRes as any).status !== 'error') {
          const tools = ((execRes as any).data?.tools ?? []) as Array<{
            name: string;
            description?: string;
          }>;
          availableTools = tools.map((t) => ({ name: t.name, description: t.description }));
          // Consider server "connected" only if it returns at least one tool
          connected = availableTools.length > 0;
        }
      } catch (error) {
        logger.debug(`Failed to connect to MCP server ${id}: ${error}`);
      }

      // Get active tools for this connector
      const registry = await toolService.getRegistry({ request });
      const allTools = await registry.list({});
      const activeTools = allTools.filter(
        (t) => t.type === ToolType.mcp && (t.configuration as any)?.connector_id === id
      );
      const activeToolIds = activeTools.map((t) => (t.configuration as any)?.tool_name || '');

      const serverDetails: McpServerDetails = {
        connector: {
          id: connector.id,
          name: connector.name,
          url: (connector.config as any)?.url || '',
        },
        connected,
        availableTools,
        activeToolIds,
      };

      return response.ok({ body: serverDetails });
    })
  );

  // Update tools for a specific MCP server
  router.post(
    {
      path: `${internalApiPath}/mcp/servers/{id}/tools`,
      validate: {
        params: schema.object({
          id: schema.string(),
        }),
        body: schema.object({
          toolIds: schema.arrayOf(schema.string()),
        }),
      },
      options: { access: 'internal' },
      security: {
        authz: { requiredPrivileges: [apiPrivileges.manageOnechat] },
      },
    },
    wrapHandler(async (ctx, request, response) => {
      const { id: connectorId } = request.params;
      const { toolIds: newToolIds } = request.body;
      const [, { actions }] = await coreSetup.getStartServices();
      const { tools: toolService } = getInternalServices();

      if (!actions) {
        return response.badRequest({ body: { message: 'Actions plugin not available' } });
      }

      const actionsClient = await actions.getActionsClientWithRequest(request);

      // Get the connector
      let connector;
      try {
        connector = await actionsClient.get({ id: connectorId });
      } catch (error) {
        return response.notFound({ body: { message: `Connector ${connectorId} not found` } });
      }

      if (connector.actionTypeId !== MCP_CONNECTOR_TYPE_ID) {
        return response.badRequest({ body: { message: 'Connector is not an MCP connector' } });
      }

      // Get current active tools for this connector
      const registry = await toolService.getRegistry({ request });
      const allTools = await registry.list({});
      const currentTools = allTools.filter(
        (t) => t.type === ToolType.mcp && (t.configuration as any)?.connector_id === connectorId
      );
      const currentToolNames = currentTools.map((t) => (t.configuration as any)?.tool_name || '');

      // Compute diff
      const toolsToAdd = newToolIds.filter((name) => !currentToolNames.includes(name));
      const toolsToRemove = currentTools.filter(
        (t) => !newToolIds.includes((t.configuration as any)?.tool_name || '')
      );

      // Generate namespace from connector name
      const namespace = snakeCase(connector.name);

      // Discover available tools to get canonical descriptions
      let availableToolsForDescriptions: Array<{ name: string; description?: string }> = [];
      try {
        const execRes = await actionsClient.execute({
          actionId: connector.id,
          params: { subAction: 'listTools', subActionParams: {} },
        });
        if ((execRes as any).status !== 'error') {
          availableToolsForDescriptions = (((execRes as any).data?.tools ??
            []) as Array<{ name: string; description?: string }>);
        }
      } catch (e) {
        // If discovery fails, fall back to generic descriptions
      }
      const nameToDescription = new Map(
        availableToolsForDescriptions.map((t) => [t.name, t.description])
      );

      // Delete tools that are no longer selected
      for (const tool of toolsToRemove) {
        try {
          await registry.delete(tool.id);
          logger.debug(`Deleted MCP tool: ${tool.id}`);
        } catch (error) {
          logger.warn(`Failed to delete MCP tool ${tool.id}: ${error}`);
        }
      }

      // Create new tools
      for (const toolName of toolsToAdd) {
        const toolId = `mcp.${namespace}.${toolName}`;
        try {
          await registry.create({
            id: toolId,
            type: ToolType.mcp,
            description: nameToDescription.get(toolName) || `MCP tool: ${toolName}`,
            tags: [],
            configuration: {
              connector_id: connectorId,
              tool_name: toolName,
            },
          });
          logger.debug(`Created MCP tool: ${toolId}`);
        } catch (error) {
          logger.warn(`Failed to create MCP tool ${toolId}: ${error}`);
        }
      }

      return response.ok({
        body: {
          success: true,
          added: toolsToAdd.length,
          removed: toolsToRemove.length,
        },
      });
    })
  );

  // Delete an MCP server and all associated MCP tools
  router.delete(
    {
      path: `${internalApiPath}/mcp/servers/{id}`,
      validate: {
        params: schema.object({
          id: schema.string(),
        }),
      },
      options: { access: 'internal' },
      security: {
        authz: { requiredPrivileges: [apiPrivileges.manageOnechat] },
      },
    },
    wrapHandler(async (ctx, request, response) => {
      const { id: connectorId } = request.params;
      const [, { actions }] = await coreSetup.getStartServices();
      const { tools: toolService } = getInternalServices();

      if (!actions) {
        return response.badRequest({ body: { message: 'Actions plugin not available' } });
      }

      const actionsClient = await actions.getActionsClientWithRequest(request);

      // Get the connector first to validate it's MCP
      let connector;
      try {
        connector = await actionsClient.get({ id: connectorId });
      } catch (error) {
        return response.notFound({ body: { message: `Connector ${connectorId} not found` } });
      }

      if (connector.actionTypeId !== MCP_CONNECTOR_TYPE_ID) {
        return response.badRequest({ body: { message: 'Connector is not an MCP connector' } });
      }

      // Delete associated MCP tools
      const registry = await toolService.getRegistry({ request });
      const allTools = await registry.list({});
      const relatedTools = allTools.filter(
        (t) => t.type === ToolType.mcp && (t.configuration as any)?.connector_id === connectorId
      );
      let deletedTools = 0;
      for (const tool of relatedTools) {
        try {
          await registry.delete(tool.id);
          deletedTools += 1;
        } catch (error) {
          logger.warn(`Failed to delete MCP tool ${tool.id}: ${error}`);
        }
      }

      // Delete the connector itself
      try {
        await actionsClient.delete({ id: connectorId });
      } catch (error) {
        // If connector deletion fails, report, but note tools may already be removed
        return response.customError({
          statusCode: 500,
          body: { message: `Failed to delete MCP connector ${connectorId}` },
        });
      }

      return response.ok({
        body: {
          success: true,
          removedTools: deletedTools,
          removedConnector: true,
        },
      });
    })
  );
}
