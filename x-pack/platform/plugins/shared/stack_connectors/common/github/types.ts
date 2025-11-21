/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import {
  GithubConfigSchema,
  GithubSecretsSchema,
  GitHubRepositorySchema,
  SearchIssuesActionParamsSchema,
  SearchIssuesActionResponseSchema,
} from './schema';

export type Config = z.infer<typeof GithubConfigSchema>;
export type Secrets = z.infer<typeof GithubSecretsSchema>;
export type SearchIssuesActionParams = z.infer<typeof SearchIssuesActionParamsSchema>;
export type SearchIssuesActionResponse = z.infer<typeof SearchIssuesActionResponseSchema>;
export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>;

