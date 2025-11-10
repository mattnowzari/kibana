/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { TypeRegistry } from '@kbn/triggers-actions-ui-plugin/public/application/type_registry';
import { registerConnectorTypes } from '..';
import type { ActionTypeModel as ConnectorTypeModel } from '@kbn/triggers-actions-ui-plugin/public/types';
import { experimentalFeaturesMock, registrationServicesMock } from '../../mocks';
import { ExperimentalFeaturesService } from '../../common/experimental_features_service';

const CONNECTOR_TYPE_ID = '.mcp';
let connectorTypeModel: ConnectorTypeModel;

beforeAll(async () => {
  const connectorTypeRegistry = new TypeRegistry<ConnectorTypeModel>();
  ExperimentalFeaturesService.init({ experimentalFeatures: experimentalFeaturesMock });
  registerConnectorTypes({ connectorTypeRegistry, services: registrationServicesMock });
  const getResult = connectorTypeRegistry.get(CONNECTOR_TYPE_ID);
  if (getResult !== null) {
    connectorTypeModel = getResult;
  }
});

describe('connectorTypeRegistry.get() works', () => {
  test('connector type static data is as expected', () => {
    expect(connectorTypeModel.id).toEqual(CONNECTOR_TYPE_ID);
    expect(connectorTypeModel.iconClass).toEqual('logoWebhook');
  });
});

describe('mcp action params validation', () => {
  test('if action params validation succeeds when action params is valid', async () => {
    const actionParams = {
      method: 'tools/list',
      params: {},
    };

    expect(await connectorTypeModel.validateParams(actionParams)).toEqual({
      errors: { method: [], params: [] },
    });
  });

  test('params validation fails when method is not provided', async () => {
    const actionParams = {
      method: '',
    };

    const result = await connectorTypeModel.validateParams(actionParams);
    expect((result.errors as { method: string[] }).method.length).toBeGreaterThan(0);
  });

  test('params validation fails when method is invalid', async () => {
    const actionParams = {
      method: 'invalid-method',
    };

    const result = await connectorTypeModel.validateParams(actionParams);
    expect((result.errors as { method: string[] }).method.length).toBeGreaterThan(0);
  });
});

