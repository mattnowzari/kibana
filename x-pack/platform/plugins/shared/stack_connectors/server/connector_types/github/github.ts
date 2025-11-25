/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ServiceParams } from '@kbn/actions-plugin/server';
import { SubActionConnector } from '@kbn/actions-plugin/server';
import type { ConnectorUsageCollector } from '@kbn/actions-plugin/server/types';
import type { AxiosError } from 'axios';
import { z } from '@kbn/zod';
import { SUB_ACTION } from '../../../common/github/constants';
import {
  ListRepositoriesActionParamsSchema,
  ListRepositoriesActionResponseSchema,
  SearchIssuesActionParamsSchema,
  SearchIssuesActionResponseSchema,
  GitHubIssueSchema,
  GetDocsActionParamsSchema,
  GetDocsActionResponseSchema,
} from '../../../common/github/schema';
import type {
  Config,
  Secrets,
  ListRepositoriesActionParams,
  ListRepositoriesActionResponse,
  SearchIssuesActionParams,
  SearchIssuesActionResponse,
  GetDocsActionParams,
  GetDocsActionResponse,
} from '../../../common/github/types';

export class GitHubConnector extends SubActionConnector<Config, Secrets> {
  private apiUrl: string;

  constructor(params: ServiceParams<Config, Secrets>) {
    super(params);

    this.apiUrl = this.config.apiUrl || 'https://api.github.com';
    this.registerSubActions();
  }

  private registerSubActions() {
    this.registerSubAction({
      name: SUB_ACTION.LIST_REPOSITORIES,
      method: 'listRepositories',
      schema: ListRepositoriesActionParamsSchema,
    });
    this.registerSubAction({
      name: SUB_ACTION.SEARCH_ISSUES,
      method: 'searchIssues',
      schema: SearchIssuesActionParamsSchema,
    });
    this.registerSubAction({
      name: SUB_ACTION.GET_DOCS,
      method: 'getDocs',
      schema: GetDocsActionParamsSchema,
    });
  }

  protected getResponseErrorMessage(error: AxiosError<{ message?: string }>): string {
    if (!error.response?.status) {
      return `Unexpected API Error: ${error.code ?? ''} - ${error.message ?? 'Unknown error'}`;
    }
    if (error.response.status === 401) {
      return `Unauthorized API Error${
        error.response?.data?.message ? `: ${error.response.data.message}` : ''
      }. Please check your personal access token.`;
    }
    if (error.response.status === 403) {
      const errorMessage = error.response?.data?.message || '';
      
      if (errorMessage.includes('SAML enforcement') || errorMessage.includes('organization SAML')) {
        return `Forbidden API Error: ${errorMessage} To authorize your OAuth token for this organization, visit https://github.com/settings/tokens and authorize the token for the organization.`;
      }
      return `Forbidden API Error${
        errorMessage ? `: ${errorMessage}` : ''
      }. Your token may not have the required permissions.`;
    }
    return `API Error: ${error.response?.statusText}${
      error.response?.data?.message ? ` - ${error.response.data.message}` : ''
    }`;
  }

  /**
   * Lists repositories for a specific owner (user or organization)
   * @param params Parameters for listing repositories
   * @param connectorUsageCollector Usage collector for tracking
   * @returns List of repositories
   */
  public async listRepositories(
    {
      owner,
      type = 'all',
      sort = 'full_name',
      direction = 'asc',
      perPage = 30,
      page = 1,
    }: ListRepositoriesActionParams,
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<ListRepositoriesActionResponse> {
    const response = await this.request<z.infer<typeof ListRepositoriesActionResponseSchema>>(
      {
        url: `${this.apiUrl}/users/${owner}/repos`,
        method: 'get',
        params: {
          type,
          sort,
          direction,
          per_page: perPage,
          page,
        },
        headers: {
          Authorization: `Bearer ${this.secrets.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
        responseSchema: ListRepositoriesActionResponseSchema,
      },
      connectorUsageCollector
    );

    return response.data;
  }

  /**
   * Searches for issues in a GitHub repository
   * @param params Parameters for searching issues
   * @param connectorUsageCollector Usage collector for tracking
   * @returns List of issues
   */
  public async searchIssues(
    {
      owner,
      repo,
      state,
      query,
    }: SearchIssuesActionParams,
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<SearchIssuesActionResponse> {
    // GitHub Search API returns an object with items array, total_count, and incomplete_results
    const githubSearchResponseSchema = z.object({
      total_count: z.number(),
      incomplete_results: z.boolean(),
      items: z.array(GitHubIssueSchema),
    });

    // Build the search query - include state in the query string if not 'all'
    let searchQuery = `repo:${owner}/${repo} is:issue`;
    if (state && state !== 'all') {
      searchQuery += ` state:${state}`;
    }
    if (query) {
      searchQuery += ` ${query}`;
    }

    const response = await this.request<z.infer<typeof githubSearchResponseSchema>>(
      {
        url: `${this.apiUrl}/search/issues`,
        method: 'get',
        params: {
          q: searchQuery,
        },
        headers: {
          Authorization: `Bearer ${this.secrets.token}`,
        },
        responseSchema: githubSearchResponseSchema,
      },
      connectorUsageCollector
    );

    // Transform the GitHub API response to match our response schema
    const transformedResponse: SearchIssuesActionResponse = {
      issues: response.data.items,
      total_count: response.data.total_count,
    };

    // Validate the transformed response
    return SearchIssuesActionResponseSchema.parse(transformedResponse);
  }

  /**
   * Gets all markdown files from a GitHub repository
   * Searches the repository tree for all files ending with .md
   * @param params Parameters for getting the markdown files
   * @param connectorUsageCollector Usage collector for tracking
   * @returns Array of markdown file content and metadata
   */
  public async getDocs(
    {
      owner,
      repo,
      ref = 'main',
    }: GetDocsActionParams,
    connectorUsageCollector: ConnectorUsageCollector
  ): Promise<GetDocsActionResponse> {
    // First, get the commit SHA for the ref
    const commitResponse = await this.request<{ sha: string }>(
      {
        url: `${this.apiUrl}/repos/${owner}/${repo}/commits/${ref}`,
        method: 'get',
        headers: {
          Authorization: `Bearer ${this.secrets.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
        responseSchema: z.object({ sha: z.string() }).passthrough(),
      },
      connectorUsageCollector
    );

    const commitSha = commitResponse.data.sha;

    const treeResponseSchema = z.object({
      sha: z.string(),
      url: z.string(),
      tree: z.array(
        z.object({
          path: z.string(),
          mode: z.string(),
          type: z.string(),
          sha: z.string(),
          size: z.number().optional(),
          url: z.string(),
        })
      ),
      truncated: z.boolean().optional(),
    });

    const treeResponse = await this.request<z.infer<typeof treeResponseSchema>>(
      {
        url: `${this.apiUrl}/repos/${owner}/${repo}/git/trees/${commitSha}`,
        method: 'get',
        params: { recursive: '1' },
        headers: {
          Authorization: `Bearer ${this.secrets.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
        responseSchema: treeResponseSchema,
      },
      connectorUsageCollector
    );

    const markdownFiles = treeResponse.data.tree.filter(
      (item) => item.type === 'blob' && item.path.toLowerCase().endsWith('.md')
    );

    if (markdownFiles.length === 0) {
      throw new Error(`No .md files found in repository ${owner}/${repo} at ref ${ref}`);
    }

    const apiResponseSchema = z.object({
      name: z.string(),
      path: z.string(),
      sha: z.string(),
      size: z.number(),
      url: z.string(),
      html_url: z.string(),
      git_url: z.string(),
      download_url: z.string(),
      type: z.string(),
      content: z.string(), // Base64-encoded content from API
      encoding: z.string(),
      _links: z.object({
        self: z.string().optional(),
        git: z.string().optional(),
        html: z.string().optional(),
      }).optional(),
    }).passthrough();

    const markdownFilesWithContent = await Promise.all(
      markdownFiles.map(async (file) => {
        const response = await this.request<z.infer<typeof apiResponseSchema>>(
          {
            url: `${this.apiUrl}/repos/${owner}/${repo}/contents/${file.path}`,
            method: 'get',
            params: { ref },
            headers: {
              Authorization: `Bearer ${this.secrets.token}`,
              Accept: 'application/vnd.github.v3+json'
            },
            responseSchema: apiResponseSchema,
          },
          connectorUsageCollector
        );

        // Decode base64 content to UTF-8 string and trim whitespace
        const decodedContent = Buffer.from(response.data.content, 'base64').toString('utf-8').trim();

        return {
          name: response.data.name,
          path: response.data.path,
          content: decodedContent,
          html_url: response.data.html_url,
        };
      })
    );

    return GetDocsActionResponseSchema.parse(markdownFilesWithContent);
  }
}

