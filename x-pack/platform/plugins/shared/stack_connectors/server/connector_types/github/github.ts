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
  SearchIssuesActionParamsSchema,
  SearchIssuesActionResponseSchema,
  GitHubIssueSchema,
} from '../../../common/github/schema';
import type {
  Config,
  Secrets,
  SearchIssuesActionParams,
  SearchIssuesActionResponse,
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
      name: SUB_ACTION.SEARCH_ISSUES,
      method: 'searchIssues',
      schema: SearchIssuesActionParamsSchema,
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
      return `Forbidden API Error${
        error.response?.data?.message ? `: ${error.response.data.message}` : ''
      }. Your token may not have the required permissions.`;
    }
    return `API Error: ${error.response?.statusText}${
      error.response?.data?.message ? ` - ${error.response.data.message}` : ''
    }`;
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
    // GitHub API returns an array directly, so we validate it as an array first
    // then transform it to match our response schema
    const arrayResponseSchema = z.array(GitHubIssueSchema);
    const response = await this.request<z.infer<typeof arrayResponseSchema>>(
      {
        url: `${this.apiUrl}/search/issues`, // Note the /search/issues change
        method: 'get',
        params: {
          q: `repo:${owner}/${repo} ${query} is:issue`, // Proper search query format
          state, // This might not be applicable in the search endpoint
        },
        headers: {
          Authorization: `Bearer ${this.secrets.token}`,
        },
        responseSchema: arrayResponseSchema,
      },
      connectorUsageCollector
    );

    // Transform the array response to match our response schema
    const issues = response.data;
    const transformedResponse: SearchIssuesActionResponse = {
      issues,
      total_count: issues.length,
    };

    // Validate the transformed response
    return SearchIssuesActionResponseSchema.parse(transformedResponse);
  }
}

