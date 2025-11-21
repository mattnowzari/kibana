/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const URL_LABEL = i18n.translate('xpack.stackConnectors.github.urlTextFieldLabel', {
  defaultMessage: 'GitHub API URL',
});

export const TOKEN_LABEL = i18n.translate('xpack.stackConnectors.github.tokenTextFieldLabel', {
  defaultMessage: 'Personal Access Token',
});

export const TOKEN_HELP_TEXT = i18n.translate(
  'xpack.stackConnectors.github.tokenHelpText',
  {
    defaultMessage:
      'A GitHub personal access token with repo scope. Create one at https://github.com/settings/tokens',
  }
);

