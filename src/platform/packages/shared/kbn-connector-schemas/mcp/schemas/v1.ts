/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { z } from '@kbn/zod';

export const ConfigSchema = z
  .object({
    url: z.string().url(),
  })
  .strict();

export const SecretsSchema = z.object({}).strict();

export const ParamsSchema = z
  .object({
    method: z.enum(['initialize', 'tools/list', 'tools/call']),
    params: z.record(z.any()).optional(),
  })
  .strict();

