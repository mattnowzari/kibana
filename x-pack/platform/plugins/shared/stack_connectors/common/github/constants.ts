/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const GITHUB_TITLE = i18n.translate(
  'xpack.stackConnectors.components.github.connectorTypeTitle',
  {
    defaultMessage: 'GitHub',
  }
);
export const GITHUB_CONNECTOR_ID = '.github';

export enum SUB_ACTION {
  SEARCH_ISSUES = 'searchIssues',
}

export const DEFAULT_GITHUB_URL = 'https://api.github.com' as const;

