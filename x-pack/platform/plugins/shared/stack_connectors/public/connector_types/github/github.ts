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
} from '@kbn/triggers-actions-ui-plugin/public';
import { GITHUB_CONNECTOR_ID, SUB_ACTION } from '../../../common/github/constants';
import type { Config, Secrets } from '../../../common/github/types';
import type { GitHubExecuteActionParams } from './types';

interface ValidationErrors {
  subAction: string[];
  subActionParams: string[];
}

export function getConnectorType(): ConnectorTypeModel<Config, Secrets, GitHubExecuteActionParams> {
  return {
    id: GITHUB_CONNECTOR_ID,
    actionTypeTitle: i18n.translate('xpack.stackConnectors.github.title', {
      defaultMessage: 'GitHub',
    }),
    iconClass: lazy(() => import('./logo')),
    selectMessage: i18n.translate('xpack.stackConnectors.github.config.selectMessageText', {
      defaultMessage: 'Extract information from GitHub',
    }),
    validateParams: async (
      actionParams: GitHubExecuteActionParams
    ): Promise<GenericValidationResult<ValidationErrors>> => {
      const errors: ValidationErrors = {
        subAction: [],
        subActionParams: [],
      };
      return { errors };
    },
    actionConnectorFields: lazy(() => import('./github_connector')),
    actionParamsFields: lazy(() => import('./params')),
  };
}

