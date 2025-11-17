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

export const TOOL_NAME_LABEL = i18n.translate(
  'xpack.stackConnectors.components.mcp.toolNameLabel',
  {
    defaultMessage: 'Tool Name',
  }
);

export const TOOL_NAME_HELP_TEXT = i18n.translate(
  'xpack.stackConnectors.components.mcp.toolNameHelpText',
  {
    defaultMessage: 'The name of the MCP tool to call',
  }
);

export const TOOL_NAME_PLACEHOLDER = i18n.translate(
  'xpack.stackConnectors.components.mcp.toolNamePlaceholder',
  {
    defaultMessage: 'e.g., search_repositories',
  }
);

export const TOOL_ARGUMENTS_LABEL = i18n.translate(
  'xpack.stackConnectors.components.mcp.toolArgumentsLabel',
  {
    defaultMessage: 'Tool Arguments',
  }
);
