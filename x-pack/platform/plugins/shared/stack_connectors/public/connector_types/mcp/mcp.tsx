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
import type { ActionParamsType, ConnectorTypeConfigType, ConnectorTypeSecretsType } from '@kbn/connector-schemas/mcp';

export function getConnectorType(): ConnectorTypeModel<
  ConnectorTypeConfigType,
  ConnectorTypeSecretsType,
  ActionParamsType
> {
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
      actionParams: ActionParamsType
    ): Promise<GenericValidationResult<ActionParamsType>> => {
      const translations = await import('./translations');
      const errors: { method: string[]; params: string[] } = {
        method: [],
        params: [],
      };
      const validationResult = { errors };

      if (!actionParams.method) {
        errors.method.push(translations.METHOD_REQUIRED);
      }

      return validationResult;
    },
    actionConnectorFields: lazy(() => import('./mcp_connectors')),
    actionParamsFields: lazy(() => import('./mcp_params')),
    defaultActionParams: {
      method: 'tools/call',
      params: {
        name: 'list_indices',
        arguments: {
          index_pattern: '*',
        },
      },
    },
  };
}

