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
  state: z.enum(['open', 'closed', 'all']).default('open'),
  query: z.string().optional(),
}).strict();

export const GitHubIssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(), // GitHub API can return null for issues without a body
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
}).passthrough(); // Allow extra fields from GitHub API response

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

export const ListRepositoriesActionParamsSchema = z.object({
  owner: z.string(),
  type: z.enum(['all', 'owner', 'member']).optional().default('all'),
  sort: z.enum(['created', 'updated', 'pushed', 'full_name']).optional().default('full_name'),
  direction: z.enum(['asc', 'desc']).optional().default('asc'),
  perPage: z.coerce.number().min(1).max(100).optional().default(30),
  page: z.coerce.number().min(1).optional().default(1),
}).strict();

export const ListRepositoriesActionResponseSchema = z.array(GitHubRepositorySchema);

export const GetDocsActionParamsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  ref: z.string().optional(),
}).strict();

export const GetDocsActionResponseSchema = z.array(
  z.object({
    name: z.string(),
    path: z.string(),
    content: z.string(), // Decoded content (UTF-8 string, trimmed)
    html_url: z.string(),
  }).strict()
);

