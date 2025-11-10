/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import { ToolType } from '@kbn/onechat-common/tools';
import type { ToolsService } from '../../../../../services/tools/tools_service';
import { sharedValidationSchemas } from './shared_tool_validation';
import type { McpToolFormData } from '../types/tool_form_types';

export const createMcpToolFormValidationSchema = (toolsService: ToolsService) => {
  return z.object({
    toolId: sharedValidationSchemas.toolId,
    description: sharedValidationSchemas.description,
    labels: sharedValidationSchemas.labels,
    type: z.literal(ToolType.mcp),
    connector_id: z
      .string({ required_error: 'MCP connector is required' })
      .min(1, 'MCP connector is required'),
    // Capabilities validation is handled manually in the component
    // based on tool availability, so we don't validate it here
    selected_capabilities: z.array(z.string()),
  }) as z.ZodType<McpToolFormData>;
};

