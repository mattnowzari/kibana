/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { lazy } from 'react';
import { i18n } from '@kbn/i18n';
import type {
  ActionTypeModel as ConnectorTypeModel,
  GenericValidationResult,
} from '@kbn/triggers-actions-ui-plugin/public/types';
import { CONNECTOR_ID } from '@kbn/connector-schemas/mcp/constants';

interface McpActionParams {
  subAction: string;
  subActionParams: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

export function getConnectorType(): ConnectorTypeModel<unknown, unknown, McpActionParams> {
  return {
    id: CONNECTOR_ID,
    iconClass: 'logoWebhook',
    selectMessage: i18n.translate('xpack.stackConnectors.components.mcp.selectMessageText', {
      defaultMessage: 'Connect to an MCP (Model Context Protocol) server.',
    }),
    actionTypeTitle: i18n.translate('xpack.stackConnectors.components.mcp.connectorTypeTitle', {
      defaultMessage: 'MCP',
    }),
    validateParams: async (
      actionParams: McpActionParams
    ): Promise<GenericValidationResult<McpActionParams>> => {
      const errors: {
        subAction: string[];
        subActionParams: { name?: string[]; arguments?: string[] };
      } = {
        subAction: [],
        subActionParams: {},
      };
      const validationResult = { errors };

      if (!actionParams.subAction) {
        errors.subAction.push('Sub action is required');
      }

      if (actionParams.subAction === 'callTool') {
        if (!actionParams.subActionParams?.name) {
          errors.subActionParams.name = ['Tool name is required'];
        }
      }

      return validationResult;
    },
    actionConnectorFields: lazy(() => import('./mcp_connectors')),
    actionParamsFields: lazy(() => import('./mcp_params')),
    defaultActionParams: {
      subAction: 'callTool',
      subActionParams: {
        name: '',
        arguments: {},
      },
    },
  };
}
