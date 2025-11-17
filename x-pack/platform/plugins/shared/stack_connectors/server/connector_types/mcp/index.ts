/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SubActionConnectorType } from '@kbn/actions-plugin/server/sub_action_framework/types';
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
import { McpConnector } from './mcp_connector';

export function getConnectorType(): SubActionConnectorType<Config, Secrets> {
  return {
    id: CONNECTOR_ID,
    minimumLicenseRequired: 'gold',
    name: CONNECTOR_NAME,
    supportedFeatureIds: ['agentBuilder'],
    schema: {
      config: ConfigSchema,
      secrets: SecretsSchema,
    },
    getService: (params) => new McpConnector(params),
  };
}
