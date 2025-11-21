/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Creates a workflow template for Brave Search
 * @param connectorId - The ID of the workplace connector containing the API key
 * @param feature - Optional capability/feature (e.g., 'search_web')
 * @returns Workflow YAML template with secret reference
 */
export function createBraveSearchWorkflowTemplate(connectorId: string, feature?: string): string {
  const workflowName = feature ? `brave_search.${feature}` : 'brave_search';
  return `version: '1'
name: '${workflowName}'
description: 'Search using Brave Search API'
enabled: true
triggers:
  - type: 'manual'
inputs:
  - name: query
    type: string
    description: The query to search for
steps:
  - name: 'Search Brave'
    type: 'http'
    with:
      url: "https://api.search.brave.com/res/v1/web/search?q={{ inputs.query | url_encode }}"
      method: 'GET'
      headers:
        Accept: application/json
        Accept-Encoding: gzip
        X-Subscription-Token: \${workplace_connector:${connectorId}:api_key}
`;
}
