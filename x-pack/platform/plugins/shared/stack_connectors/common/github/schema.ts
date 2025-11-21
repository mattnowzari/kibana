/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import { DEFAULT_GITHUB_URL } from './constants';

// Connector schema
export const GithubConfigSchema = z
  .object({
    apiUrl: z.string().optional(),
  })
  .strict();

  export const GithubSecretsSchema = z.object({ token: z.string().optional() }).strict();

export const SearchIssuesActionParamsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  state: z.enum(['open', 'closed', 'all']).optional().default('open'),
  query: z.string().optional(),
}).strict();

export const GitHubIssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
});

export const SearchIssuesActionResponseSchema = z.object({
  issues: z.array(GitHubIssueSchema),
  total_count: z.number(),
}).strict();

export const GitHubRepositorySchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  description: z.string().nullable(),
  private: z.boolean(),
  html_url: z.string(),
  clone_url: z.string(),
  default_branch: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  pushed_at: z.string().nullable(),
  stargazers_count: z.number(),
  watchers_count: z.number(),
  language: z.string().nullable(),
  archived: z.boolean(),
  disabled: z.boolean(),
});

export const ListRepositoriesActionResponseSchema = z.array(GitHubRepositorySchema);

