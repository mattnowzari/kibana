/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from '@kbn/onechat-common';
import type { ToolDefinitionWithSchema } from '@kbn/onechat-common';
import { isMcpTool } from '@kbn/onechat-common/tools';

import { McpConfiguration } from '../../sections/configuration_fields/mcp_configuration_fields';

import {
  transformMcpFormDataForCreate,
  transformMcpFormDataForUpdate,
  transformMcpToolToFormData,
} from '../../../../../utils/transform_mcp_form_data';
import { createMcpToolFormValidationSchema } from '../../validation/mcp_tool_form_validation';

import { zodResolver } from '../../../../../utils/zod_resolver';
import { i18nMessages } from '../../i18n';
import type { ToolTypeRegistryEntry } from '../common';
import type { McpToolFormData } from '../../types/tool_form_types';
import { commonToolFormDefaultValues } from '../common';

export const mcpToolRegistryEntry: ToolTypeRegistryEntry<McpToolFormData> = {
  label: i18nMessages.configuration.form.type.mcpOption,
  getConfigurationComponent: () => McpConfiguration,
  defaultValues: {
    ...commonToolFormDefaultValues,
    type: ToolType.mcp,
    connector_id: '',
    selected_capabilities: [],
  },
  toolToFormData: (tool: ToolDefinitionWithSchema) => {
    if (!tool) {
      throw new Error('Tool is required');
    }
    if (!isMcpTool(tool)) {
      throw new Error(`Expected MCP tool, got tool type: ${tool.type}`);
    }
    try {
      return transformMcpToolToFormData(tool);
    } catch (error: any) {
      throw new Error(`Failed to transform MCP tool to form data: ${error.message || error}`);
    }
  },
  formDataToCreatePayload: transformMcpFormDataForCreate,
  formDataToUpdatePayload: transformMcpFormDataForUpdate,
  getValidationResolver: (services) => {
    if (!services?.toolsService) {
      throw new Error('toolsService is required for MCP validation');
    }
    return zodResolver(createMcpToolFormValidationSchema(services.toolsService));
  },
};

