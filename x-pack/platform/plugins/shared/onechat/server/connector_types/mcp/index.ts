/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { SubActionConnectorType } from '@kbn/actions-plugin/server/sub_action_framework/types';
import type {
  PostSaveConnectorHookParams,
  PostDeleteConnectorHookParams,
} from '@kbn/actions-plugin/server/sub_action_framework/types';
import { AgentBuilderConnectorFeatureId } from '@kbn/actions-plugin/common';
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
import type { InternalStartServices } from '../../services';

// Prevent recursive postSave invocations caused by internal updates
const inProgressConnectorUpdates = new Set<string>();

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

async function createAgentBuilderTools(
  getInternalServices: () => InternalStartServices,
  params: PostSaveConnectorHookParams<Config, Secrets>,
  logger: Logger
): Promise<void> {
  const { connectorId, config, request, wasSuccessful } = params;
  if (!wasSuccessful || !config.selected_tools || config.selected_tools.length === 0) {
    return;
  }
  if (inProgressConnectorUpdates.has(connectorId)) {
    // Skip re-entrant execution triggered by our own internal update call
    return;
  }
  inProgressConnectorUpdates.add(connectorId);
  try {
    // Use server name-based namespace to avoid extra lookups
    const serverName = deriveServerName(config.url);
    const namespace = snakeCase(serverName);

    const { tools: toolService } = getInternalServices();
    const registry = await toolService.getRegistry({ request });

    // Determine which tools to create vs delete based on current selection
    const desiredToolNames = new Set(config.selected_tools);
    const existingAssociatedTools = (await registry.list()).filter(
      (t) =>
        t.type === ToolType.mcp &&
        (t.configuration as { connector_id?: string })?.connector_id === connectorId
    );
    const existingByName = new Map<string, { id: string }>();
    for (const tool of existingAssociatedTools) {
      const name = (tool.configuration as { tool_name?: string })?.tool_name;
      if (name) {
        existingByName.set(name, { id: tool.id });
      }
    }

    const toCreate: string[] = [];
    const toDelete: string[] = [];

    // Tools to delete: previously associated but no longer selected
    for (const [name, { id }] of existingByName.entries()) {
      if (!desiredToolNames.has(name)) {
        toDelete.push(id);
      }
    }
    // Tools to create: selected but not yet associated
    for (const name of desiredToolNames) {
      if (!existingByName.has(name)) {
        toCreate.push(name);
      }
    }

    // Delete deselected tools
    for (const toolId of toDelete) {
      try {
        await registry.delete(toolId);
        logger.debug(`Deleted deselected MCP Agent Builder tool: ${toolId}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to delete MCP Agent Builder tool ${toolId}: ${message}`);
      }
    }

    // Create newly selected tools
    for (const toolName of toCreate) {
      const toolId = `mcp.${namespace}.${toolName}`;
      try {
        await registry.create({
          id: toolId,
          type: ToolType.mcp,
          description: `MCP tool: ${toolName}`,
          tags: [],
          configuration: {
            connector_id: connectorId,
            tool_name: toolName,
          },
        });
        logger.debug(`Created Agent Builder tool: ${toolId}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to create Agent Builder tool ${toolId}: ${message}`);
      }
    }

    // Persist associated tool ids on the connector for easy lookup in edit UI
    try {
      const services = getInternalServices();
      const actions = services.actions;
      if (!actions) {
        logger.warn('Actions plugin start not available; skipping connector config update');
        return;
      }

      // Build a full set of associated MCP tool ids for this connector (after create/delete)
      const allToolsAfter = await registry.list();
      const associatedIds = allToolsAfter
        .filter(
          (t) =>
            t.type === ToolType.mcp &&
            (t.configuration as { connector_id?: string })?.connector_id === connectorId
        )
        .map((t) => t.id);
      const finalIds = Array.from(new Set(associatedIds));

      const actionsClient = await actions.getActionsClientWithRequest(request);
      const connector = await actionsClient.get({ id: connectorId });
      const existingConfig = (connector.config ?? {}) as Record<string, unknown>;
      const existingIds = Array.isArray((existingConfig as any).created_tool_ids)
        ? ((existingConfig as any).created_tool_ids as string[])
        : [];
      const mergedIds = Array.from(new Set([...existingIds, ...finalIds]));

      // Only update if there's a net change to avoid unnecessary re-entrant calls
      const needUpdate =
        mergedIds.length !== existingIds.length ||
        mergedIds.some((id) => !existingIds.includes(id));
      if (needUpdate) {
        await actionsClient.update({
          id: connectorId,
          action: {
            name: connector.name ?? 'MCP',
            config: {
              ...existingConfig,
              created_tool_ids: mergedIds,
            },
            secrets: connector.secrets ?? {},
          },
        });
        logger.debug(
          `Updated MCP connector ${connectorId} with ${finalIds.length} associated MCP tool ids`
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.warn(`Failed to persist created MCP tool ids on connector ${connectorId}: ${message}`);
    }
  } finally {
    inProgressConnectorUpdates.delete(connectorId);
  }
}

async function deleteAssociatedAgentBuilderTools(
  getInternalServices: () => InternalStartServices,
  params: PostDeleteConnectorHookParams<Config, Secrets>,
  logger: Logger
): Promise<void> {
  const { connectorId, request } = params;

  try {
    const { tools: toolService } = getInternalServices();
    const registry = await toolService.getRegistry({ request });
    const allTools = await registry.list();

    const toDelete = new Set<string>();
    for (const tool of allTools) {
      if (tool.type !== ToolType.mcp) {
        continue;
      }
      const configuration = tool.configuration as { connector_id?: string } | undefined;
      if (configuration?.connector_id === connectorId) {
        toDelete.add(tool.id);
      }
    }

    for (const toolId of toDelete) {
      try {
        await registry.delete(toolId);
        logger.debug(`Deleted associated MCP Agent Builder tool: ${toolId}`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.warn(`Failed to delete MCP Agent Builder tool ${toolId}: ${message}`);
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn(
      `Failed to delete associated MCP Agent Builder tools for connector ${connectorId}: ${message}`
    );
  }
}

export function getConnectorType({
  getInternalServices,
}: {
  getInternalServices: () => InternalStartServices;
}): SubActionConnectorType<Config, Secrets> {
  return {
    id: CONNECTOR_ID,
    minimumLicenseRequired: 'gold',
    name: CONNECTOR_NAME,
    supportedFeatureIds: [AgentBuilderConnectorFeatureId],
    schema: {
      config: ConfigSchema,
      secrets: SecretsSchema,
    },
    getService: (params) => new McpConnector(params),
    postSaveHook: async (params) => {
      await createAgentBuilderTools(getInternalServices, params, params.logger);
    },
    postDeleteHook: async (params) => {
      await deleteAssociatedAgentBuilderTools(getInternalServices, params, params.logger);
    },
  };
}
