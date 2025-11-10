/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const URL_LABEL = i18n.translate('xpack.stackConnectors.components.mcp.urlTextFieldLabel', {
  defaultMessage: 'MCP Server URL',
});

export const URL_INVALID = i18n.translate(
  'xpack.stackConnectors.components.mcp.error.invalidUrlTextField',
  {
    defaultMessage: 'URL is invalid.',
  }
);

export const API_KEY_LABEL = i18n.translate(
  'xpack.stackConnectors.components.mcp.apiKeyTextFieldLabel',
  {
    defaultMessage: 'API Key',
  }
);

export const API_KEY_HELP_TEXT = i18n.translate(
  'xpack.stackConnectors.components.mcp.apiKeyHelpText',
  {
    defaultMessage: 'Optional API key for authenticating with the MCP server.',
  }
);

export const METHOD_LABEL = i18n.translate(
  'xpack.stackConnectors.components.mcp.methodTextFieldLabel',
  {
    defaultMessage: 'Method',
  }
);

export const METHOD_REQUIRED = i18n.translate(
  'xpack.stackConnectors.components.mcp.error.requiredMethodText',
  {
    defaultMessage: 'Method is required.',
  }
);

export const PARAMS_LABEL = i18n.translate(
  'xpack.stackConnectors.components.mcp.paramsTextFieldLabel',
  {
    defaultMessage: 'Parameters',
  }
);

