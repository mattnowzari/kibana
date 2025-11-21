/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

function generateGithubSearchIssuesWorkflow(stackConnectorId: string): string {
  return `version: '1'
name: 'Github search issues'
description: 'Search for issues in a GitHub repository'
enabled: true
triggers:
  - type: 'manual'
inputs:
  - name: owner
    type: string
  - name: repo
    type: string
  - name: state
    type: choice
    options:
      - "open"
      - "closed"
      - "all"
    default: "open"
  - name: query
    type: string
steps:
  - name: search-issues
    type: github.searchIssues
    connector-id: ${stackConnectorId}
    with:
      owner: "\${{inputs.owner}}"
      repo: "\${{inputs.repo}}"
      state: "\${{inputs.state}}"
      query: "\${{inputs.query}}"
`;
}

/**
 * Creates a workflow template for GitHub
 * @param stackConnectorId - The ID of the stack connector connected via OAuth
 * @returns Workflow YAML template with secret reference
 */
export function createGithubSearchWorkflowTemplates(
  stackConnectorId: string,
): string[] {
  return [
    generateGithubSearchIssuesWorkflow(stackConnectorId)
  ];
}