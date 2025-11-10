/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { McpToolDefinition } from '@kbn/onechat-common/tools/types/mcp';
import { ToolType } from '@kbn/onechat-common';
import { omit } from 'lodash';
import type { CreateToolPayload, UpdateToolPayload } from '../../../common/http_api/tools';
import type { McpToolFormData } from '../components/tools/form/types/tool_form_types';

export const transformMcpToolToFormData = (tool: McpToolDefinition): McpToolFormData => {
  if (!tool) {
    throw new Error('Tool is required');
  }

  if (!tool.id) {
    throw new Error('Tool ID is required');
  }

  const config = tool.configuration || {};
  return {
    toolId: tool.id,
    description: tool.description || '',
    connector_id: config.connector_id || '',
    selected_capabilities: Array.isArray(config.selected_capabilities)
      ? config.selected_capabilities
      : [],
    labels: Array.isArray(tool.tags) ? tool.tags : [],
    type: ToolType.mcp,
  };
};

export const transformFormDataToMcpTool = (data: McpToolFormData): McpToolDefinition => {
  return {
    id: data.toolId,
    description: data.description,
    readonly: false,
    configuration: {
      connector_id: data.connector_id,
      selected_capabilities: data.selected_capabilities,
    },
    type: ToolType.mcp,
    tags: data.labels,
  };
};

export const transformMcpFormDataForCreate = (data: McpToolFormData): CreateToolPayload => {
  return omit(transformFormDataToMcpTool(data), ['readonly']);
};

export const transformMcpFormDataForUpdate = (data: McpToolFormData): UpdateToolPayload => {
  return omit(transformFormDataToMcpTool(data), ['id', 'type', 'readonly']);
};

