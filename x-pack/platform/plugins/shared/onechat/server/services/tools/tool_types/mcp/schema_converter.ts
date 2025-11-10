/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';

/**
 * Converts MCP tool input schema (JSON Schema) to Zod schema
 */
export function convertMcpSchemaToZod(inputSchema: {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
}): z.ZodObject<any> {
  if (inputSchema.type !== 'object') {
    // If not an object, wrap it
    return z.object({});
  }

  const shape: Record<string, z.ZodTypeAny> = {};

  if (inputSchema.properties) {
    for (const [key, prop] of Object.entries(inputSchema.properties)) {
      let field: z.ZodTypeAny;

      switch (prop.type) {
        case 'string':
          field = z.string();
          if (prop.description) {
            field = field.describe(prop.description);
          }
          break;
        case 'number':
        case 'integer':
          field = z.number();
          if (prop.description) {
            field = field.describe(prop.description);
          }
          break;
        case 'boolean':
          field = z.boolean();
          if (prop.description) {
            field = field.describe(prop.description);
          }
          break;
        case 'array':
          const itemsType = prop.items?.type;
          if (itemsType === 'string') {
            field = z.array(z.string());
          } else if (itemsType === 'number' || itemsType === 'integer') {
            field = z.array(z.number());
          } else if (itemsType === 'boolean') {
            field = z.array(z.boolean());
          } else {
            field = z.array(z.any());
          }
          if (prop.description) {
            field = field.describe(prop.description);
          }
          break;
        case 'object':
          field = z.record(z.any());
          if (prop.description) {
            field = field.describe(prop.description);
          }
          break;
        default:
          field = z.any();
          if (prop.description) {
            field = field.describe(prop.description);
          }
      }

      const isRequired = inputSchema.required?.includes(key);
      if (!isRequired) {
        field = field.optional();
      }

      shape[key] = field;
    }
  }

  return z.object(shape);
}

