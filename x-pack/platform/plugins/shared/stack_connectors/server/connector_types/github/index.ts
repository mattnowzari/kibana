/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SubActionConnectorType } from '@kbn/actions-plugin/server/sub_action_framework/types';
import { ValidatorType } from '@kbn/actions-plugin/server/sub_action_framework/types';
import { FederatedConnectorFeatureId } from '@kbn/actions-plugin/common/connector_feature_config';
import { urlAllowListValidator } from '@kbn/actions-plugin/server';
import { GITHUB_CONNECTOR_ID, GITHUB_TITLE } from '../../../common/github/constants';
import { GithubConfigSchema, GithubSecretsSchema } from '../../../common/github/schema';
import type { Config, Secrets } from '../../../common/github/types';
import { GitHubConnector } from './github';

export const getConnectorType = (): SubActionConnectorType<Config, Secrets> => ({
  id: GITHUB_CONNECTOR_ID,
  name: GITHUB_TITLE,
  getService: (params) => new GitHubConnector(params),
  schema: {
    config: GithubConfigSchema,
    secrets: GithubSecretsSchema,
  },
  validators: [{ type: ValidatorType.CONFIG, validator: urlAllowListValidator('apiUrl') }],
  supportedFeatureIds: [FederatedConnectorFeatureId],
  minimumLicenseRequired: 'gold' as const,
});

