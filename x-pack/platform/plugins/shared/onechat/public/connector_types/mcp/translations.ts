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

export const CONNECT = i18n.translate('xpack.stackConnectors.components.mcp.connectButton', {
  defaultMessage: 'Connect',
});

export const CONNECTING = i18n.translate('xpack.stackConnectors.components.mcp.connectingButton', {
  defaultMessage: 'Connecting...',
});

export const CONNECTED = i18n.translate('xpack.stackConnectors.components.mcp.connectedButton', {
  defaultMessage: 'Connected',
});

export const CONNECTING_TOOLS = i18n.translate(
  'xpack.stackConnectors.components.mcp.connectingTools',
  {
    defaultMessage: 'Connecting to MCP server and discovering tools...',
  }
);

export const CONNECT_ERROR_TITLE = i18n.translate(
  'xpack.stackConnectors.components.mcp.connectErrorTitle',
  {
    defaultMessage: 'Connection failed',
  }
);

export const CONNECT_ERROR_DEFAULT = i18n.translate(
  'xpack.stackConnectors.components.mcp.connectErrorDefault',
  {
    defaultMessage: 'Failed to connect to MCP server. Please check the URL and try again.',
  }
);

export const URL_REQUIRED_FOR_CONNECT = i18n.translate(
  'xpack.stackConnectors.components.mcp.urlRequiredForConnect',
  {
    defaultMessage: 'Please enter a URL before connecting.',
  }
);

export const TOOLS_FOUND = (count: number) =>
  i18n.translate('xpack.stackConnectors.components.mcp.toolsFound', {
    defaultMessage: '{count} {count, plural, one {tool} other {tools}} found',
    values: { count },
  });

export const SELECT_TOOLS_LABEL = i18n.translate(
  'xpack.stackConnectors.components.mcp.selectToolsLabel',
  {
    defaultMessage: 'Select MCP Tools',
  }
);

export const SELECT_TOOLS_REQUIRED = i18n.translate(
  'xpack.stackConnectors.components.mcp.selectToolsRequired',
  {
    defaultMessage: 'At least one MCP tool must be selected.',
  }
);

export const NO_TOOLS_FOUND_TITLE = i18n.translate(
  'xpack.stackConnectors.components.mcp.noToolsFoundTitle',
  {
    defaultMessage: 'No tools found',
  }
);

export const NO_TOOLS_FOUND_MESSAGE = i18n.translate(
  'xpack.stackConnectors.components.mcp.noToolsFoundMessage',
  {
    defaultMessage: 'The MCP server did not return any available tools.',
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
