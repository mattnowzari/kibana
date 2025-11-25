/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { z } from '@kbn/zod';

// GitHub connector parameter schemas for different sub-actions
export const GitHubListRepositoriesActionParamsSchema = z.object({
  owner: z.string(),
  type: z.enum(['all', 'owner', 'member']).optional().default('all'),
  sort: z.enum(['created', 'updated', 'pushed', 'full_name']).optional().default('full_name'),
  direction: z.enum(['asc', 'desc']).optional().default('asc'),
  perPage: z.coerce.number().min(1).max(100).optional().default(30),
  page: z.coerce.number().min(1).optional().default(1),
});

// GitHub connector response schema
export const GitHubListRepositoriesActionResponseSchema = z.object({
  repositories: z.array(
    z.object({
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
    })
  ),
  total_count: z.number().optional(),
});

// GitHub searchIssues sub-action parameter schema
export const GitHubSearchIssuesActionParamsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  state: z.enum(['open', 'closed', 'all']).optional().default('open'),
  query: z.string().optional(),
});

// GitHub searchIssues sub-action response schema
export const GitHubSearchIssuesActionResponseSchema = z.object({
  issues: z.array(
    z.object({
      id: z.number(),
      number: z.number(),
      title: z.string(),
      body: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
      closed_at: z.string().nullable(),
    })
  ),
  total_count: z.number(),
});

// GitHub getDocs sub-action parameter schema
export const GitHubGetDocsActionParamsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  ref: z.string().optional().default('main'),
});

// GitHub getDocs sub-action response schema
export const GitHubGetDocsActionResponseSchema = z.array(
  z.object({
    name: z.string(),
    path: z.string(),
    content: z.string(), // Decoded content (UTF-8 string, trimmed)
    html_url: z.string(),
  }).strict()
);

