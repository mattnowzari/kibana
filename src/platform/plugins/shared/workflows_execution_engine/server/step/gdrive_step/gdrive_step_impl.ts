/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from 'axios';
import type { GDriveGraphNode } from '@kbn/workflows/graph';
import type { FileMetadata, ListFilesOptions } from './google_drive_client';
import { GoogleDriveClient } from './google_drive_client';
import type { StepExecutionRuntime } from '../../workflow_context_manager/step_execution_runtime';
import type { WorkflowExecutionRuntimeManager } from '../../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../../workflow_event_logger/workflow_event_logger';
import type { BaseStep, RunStepResult } from '../node_implementation';
import { BaseAtomicNodeImplementation } from '../node_implementation';

export interface GDriveStep extends BaseStep {
  with: {
    service_credential?: Record<string, unknown>;
    accessToken?: string; // OAuth access token (preferred, from SavedObject)
    operation?: 'list' | 'get' | 'ping' | 'download' | 'search';
    fileId?: string;
    fileName?: string;
    fileContent?: string;
    fileIds?: string[];
    folderId?: string;
    mimeType?: string;
    subject?: string;
    query?: string; // For search operation
    doc_limit?: number;
  };
}

interface GDriveOperationInput {
  service_credential?: Record<string, unknown>;
  accessToken?: string; // OAuth access token (preferred, from SavedObject)
  operation?: 'list' | 'get' | 'ping' | 'download' | 'search';
  fileId?: string;
  fileName?: string;
  fileContent?: string;
  fileIds?: string[];
  folderId?: string;
  mimeType?: string;
  subject?: string;
  query?: string; // For search operation
  doc_limit?: number;
}

interface ListFilesOutput {
  files: FileMetadata[];
  count: number;
  pages: number;
  incompleteSearch: boolean;
}

interface DownloadFileOutput {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  content: string;
  contentEncoding: 'base64' | 'utf8';
  metadata: {
    createdTime?: string;
    modifiedTime?: string;
    parents?: string[];
    webViewLink?: string;
  };
}

type GDriveOperationOutput =
  | { kind: string; connected: boolean } // ping
  | ListFilesOutput // list
  | FileMetadata // get
  | DownloadFileOutput; // download

export class GDriveStepImpl extends BaseAtomicNodeImplementation<GDriveStep> {
  private driveClient: GoogleDriveClient | null = null;

  constructor(
    node: GDriveGraphNode,
    stepExecutionRuntime: StepExecutionRuntime,
    private workflowLogger: IWorkflowEventLogger,
    workflowRuntime: WorkflowExecutionRuntimeManager
  ) {
    const gdriveStep: GDriveStep = {
      name: node.configuration.name,
      type: node.type,
      spaceId: '', // TODO: get from context or node
      with: node.configuration.with,
    };
    super(
      gdriveStep,
      stepExecutionRuntime,
      undefined, // no connector executor needed for GDrive
      workflowRuntime
    );
  }

  public getInput() {
    const {
      service_credential,
      accessToken,
      operation,
      fileId,
      fileIds,
      folderId,
      subject,
      query,
      doc_limit,
    } = this.step.with;

    return this.stepExecutionRuntime.contextManager.renderValueAccordingToContext({
      service_credential,
      accessToken,
      operation: operation || 'list',
      fileId,
      fileIds,
      folderId,
      subject,
      query,
      doc_limit,
    });
  }

  protected async _run(input: GDriveOperationInput): Promise<RunStepResult> {
    try {
      return await this.executeGDriveOperation(input);
    } catch (error) {
      return this.handleFailure(input, error);
    }
  }

  private async executeGDriveOperation(input: GDriveOperationInput): Promise<RunStepResult> {
    // Resolve secrets in input (e.g., ${workplace_connector:id:secret_key})
    const resolvedInput =
      await this.stepExecutionRuntime.contextManager.resolveSecretsInValue<GDriveOperationInput>(
        input
      );
    const { operation = 'list', fileId, fileIds, folderId, subject, query, doc_limit, service_credential, accessToken } = resolvedInput;

    if (!service_credential && !accessToken) {
      throw new Error(
        `Either service_credential or accessToken is required for Google Drive operations`
      );
    }

    // Initialize client if not already done
    if (!this.driveClient) {
      this.driveClient = new GoogleDriveClient({
        service_credential,
        accessToken,
        subject,
      });
    }

    this.workflowLogger.logInfo(`Executing Google Drive operation: ${operation}`, {
      workflow: { step_id: this.step.name },
      event: { action: 'gdrive_operation', outcome: 'unknown' },
      tags: ['gdrive', operation],
    });

    let output: GDriveOperationOutput;

    switch (operation) {
      case 'search':
        if (!query) {
          throw new Error('query is required for search operation');
        }
        output = await this.handleSearch(query, doc_limit);
        break;

      case 'ping':
        output = await this.handlePing();
        break;

      case 'list':
        output = await this.handleList(folderId, doc_limit);
        break;

      case 'get':
        if (!fileId) {
          throw new Error('fileId is required for get operation');
        }
        output = await this.handleGet(fileId);
        break;

      case 'download':
        if (!fileId && !fileIds) {
          throw new Error('fileId or fileIds is required for download operation');
        }
        if (fileIds && fileIds.length > 0) {
          // Batch download multiple files
          output = await this.handleBatchDownload(fileIds);
        } else if (fileId) {
          // Single file download
          output = await this.handleDownload(fileId);
        } else {
          throw new Error('fileId or fileIds is required for download operation');
        }
        break;

      default:
        throw new Error(`Unsupported Google Drive operation: ${operation}`);
    }

    this.workflowLogger.logInfo(`Google Drive operation completed successfully: ${operation}`, {
      workflow: { step_id: this.step.name },
      event: { action: 'gdrive_operation', outcome: 'success' },
      tags: ['gdrive', operation],
    });

    return {
      input,
      output,
      error: undefined,
    };
  }

  private async handlePing(): Promise<{ kind: string; connected: boolean }> {
    if (!this.driveClient) {
      throw new Error('Google Drive client not initialized');
    }

    const result = await this.driveClient.ping();
    return {
      ...result,
      connected: true,
    };
  }

  /**
   * Performs paginated search with a given query and returns all matching files.
   * @param query - The Google Drive API query string
   * @param limit - Optional limit on number of results
   * @param logContext - Optional context for logging (e.g., "OR operator" for fallback)
   * @param logTags - Optional additional tags for logging
   * @returns Object containing files, count, pages, and incompleteSearch flag
   */
  private async performPaginatedSearch(
    query: string,
    limit?: number,
    logContext?: string,
    logTags: string[] = []
  ): Promise<{ files: FileMetadata[]; pages: number; incompleteSearch: boolean }> {
    if (!this.driveClient) {
      throw new Error('Google Drive client not initialized');
    }

    const allFiles: FileMetadata[] = [];
    let pageToken: string | undefined;
    let resultCount = 0;
    let pageCount = 0;
    let incompleteSearch = false;
    const baseTags = ['gdrive', 'list', 'pagination', ...logTags];

    do {
      const options: ListFilesOptions = {
        q: this.normalizeQuery(query),
        pageSize: 100,
        pageToken,
      };

      const contextSuffix = logContext ? ` ${logContext}` : '';
      this.workflowLogger.logInfo(
        `Fetching Google Drive files page ${pageCount + 1}${contextSuffix}${
          pageToken ? ` (continuing from previous page)` : ''
        }`,
        {
          workflow: { step_id: this.step.name },
          event: { action: 'gdrive_list_pagination', outcome: 'unknown' },
          tags: baseTags,
        }
      );

      const result = await this.driveClient.listFiles(options);

      if (result.files && result.files.length > 0) {
        allFiles.push(...result.files);
      }

      pageToken = result.nextPageToken;
      incompleteSearch = result.incompleteSearch || false;
      resultCount += result.files.length;
      pageCount++;

      if (limit && resultCount > limit) {
        break;
      }

      // Log progress
      if (pageToken) {
        this.workflowLogger.logInfo(
          `Fetched ${allFiles.length} files so far, more pages available`,
          {
            workflow: { step_id: this.step.name },
            event: { action: 'gdrive_list_pagination', outcome: 'success' },
            tags: baseTags,
          }
        );
      }
    } while (pageToken);

    return {
      files: allFiles,
      pages: pageCount,
      incompleteSearch,
    };
  }

  private async handleSearch(query?: string, limit?: number, fallbackToOrQuery: boolean = false): Promise<ListFilesOutput> {
    if (!this.driveClient) {
      throw new Error('Google Drive client not initialized');
    }

    if (!query) {
      throw new Error('query is required for search operation');
    }

    // Check if the original query is already a valid Google Drive query
    const isOriginalQueryValid = this.isLikelyValidGDriveQuery(query);

    // Normalize the query - convert plain text to valid Google Drive query if needed
    let normalizedQuery = this.normalizeQuery(query, false);

    // Perform initial search with AND operator (or original query if it was already valid)
    let searchResult = await this.performPaginatedSearch(normalizedQuery, limit);

    // If we got 0 results and the query was normalized (not a valid GDrive query),
    // retry with OR operator as a fallback
    if (searchResult.files.length === 0 && !isOriginalQueryValid && normalizedQuery !== query && fallbackToOrQuery) {
      this.workflowLogger.logInfo(
        `No results found with AND operator, retrying with OR operator: "${query}"`,
        {
          workflow: { step_id: this.step.name },
          event: { action: 'gdrive_query_fallback', outcome: 'unknown' },
          tags: ['gdrive', 'search', 'query', 'fallback'],
        }
      );

      // Retry with OR operator
      normalizedQuery = this.normalizeQuery(query, true);
      searchResult = await this.performPaginatedSearch(normalizedQuery, limit, '(OR operator)', [
        'or_fallback',
      ]);

      this.workflowLogger.logInfo(
        `OR operator fallback completed: found ${searchResult.files.length} files`,
        {
          workflow: { step_id: this.step.name },
          event: { action: 'gdrive_query_fallback', outcome: 'success' },
          tags: ['gdrive', 'search', 'query', 'fallback'],
        }
      );
    }

    // Trim results to the specified limit
    const limitedFiles =
      limit && searchResult.files.length > limit
        ? searchResult.files.slice(0, limit)
        : searchResult.files;

    this.workflowLogger.logInfo(
      `Completed fetching all Google Drive files: ${limitedFiles.length} files across ${searchResult.pages} page(s)`,
      {
        workflow: { step_id: this.step.name },
        event: { action: 'gdrive_list_complete', outcome: 'success' },
        tags: ['gdrive', 'list'],
      }
    );

    return {
      files: limitedFiles,
      count: limitedFiles.length,
      pages: searchResult.pages,
      incompleteSearch: searchResult.incompleteSearch,
    };
  }

  /**
   * Normalizes a query string. If it's not a valid Google Drive API query,
   * treats it as plain text and searches both name and fullText fields to match
   * the behavior of Google Drive web search. For multi-word queries, searches
   * for each term in both fields to better match web search behavior.
   */
  private normalizeQuery(query: string, useOrOperator: boolean = false): string {
    if (this.isLikelyValidGDriveQuery(query)) {
      return query;
    }

    // Split query into individual terms (words) and create queries for each
    const termQueries = query
      .trim()
      .split(/\s+/)
      .filter((term) => term.length > 0)
      .map((term) => term.replace(/'/g, "\\'"))
      .map((term) => `(name contains '${term}' or fullText contains '${term}')`);

    // Combine all term queries with AND to require all terms match
    return termQueries.join(useOrOperator ? ' or ' : ' and ');
  }

  /**
   * Detects if a query string is likely a valid Google Drive API query.
   * Checks for common Google Drive API patterns like operators, field names, or boolean operators.
   */
  private isLikelyValidGDriveQuery(query: string): boolean {
    // Check for common Google Drive API indicators using a single regex
    return /contains|=|in\s+parents|name\s|mimetype|fulltext|\s+and\s+|\s+or\s+/i.test(query);
  }

  private async handleList(folderId?: string, limit?: number): Promise<ListFilesOutput> {
    if (!this.driveClient) {
      throw new Error('Google Drive client not initialized');
    }

    const allFiles: FileMetadata[] = [];
    let pageToken: string | undefined;
    let resultCount = 0;
    let pageCount = 0;
    let incompleteSearch = false;

    do {
      const options: ListFilesOptions = {
        folderId,
        pageSize: 100,
        pageToken,
      };

      this.workflowLogger.logInfo(
        `Fetching Google Drive files page ${pageCount + 1}${pageToken ? ` (continuing from previous page)` : ''}`,
        {
          workflow: { step_id: this.step.name },
          event: { action: 'gdrive_list_pagination', outcome: 'unknown' },
          tags: ['gdrive', 'list', 'pagination'],
        }
      );

      const result = await this.driveClient.listFiles(options);

      if (result.files && result.files.length > 0) {
        allFiles.push(...result.files);
      }

      pageToken = result.nextPageToken;
      incompleteSearch = result.incompleteSearch || false;
      resultCount += result.files.length;
      pageCount++;

      if (limit && resultCount > limit) {
        break;
      }

      // Log progress
      if (pageToken) {
        this.workflowLogger.logInfo(
          `Fetched ${allFiles.length} files so far, more pages available`,
          {
            workflow: { step_id: this.step.name },
            event: { action: 'gdrive_list_pagination', outcome: 'success' },
            tags: ['gdrive', 'list', 'pagination'],
          }
        );
      }
    } while (pageToken);

    // Trim results to the specified limit
    const limitedFiles = limit && allFiles.length > limit ? allFiles.slice(0, limit) : allFiles;

    this.workflowLogger.logInfo(
      `Completed fetching all Google Drive files: ${limitedFiles.length} files across ${pageCount} page(s)`,
      {
        workflow: { step_id: this.step.name },
        event: { action: 'gdrive_list_complete', outcome: 'success' },
        tags: ['gdrive', 'list'],
      }
    );

    return {
      files: limitedFiles,
      count: limitedFiles.length,
      pages: pageCount,
      incompleteSearch,
    };
  }

  private async handleGet(fileId: string): Promise<FileMetadata> {
    if (!this.driveClient) {
      throw new Error('Google Drive client not initialized');
    }

    return this.driveClient.getFile(fileId);
  }

  private async handleDownload(fileId: string): Promise<DownloadFileOutput> {
    if (!this.driveClient) {
      throw new Error('Google Drive client not initialized');
    }

    this.workflowLogger.logInfo(`Downloading file content for fileId: ${fileId}`, {
      workflow: { step_id: this.step.name },
      event: { action: 'gdrive_download', outcome: 'unknown' },
      tags: ['gdrive', 'download'],
    });

    // First get file metadata to know the file name and type
    const fileMetadata = await this.driveClient.getFile(fileId);

    // Download the file content
    const downloadedFile = await this.driveClient.downloadFile(fileId);

    this.workflowLogger.logInfo(
      `Successfully downloaded file: ${fileMetadata.name} (${downloadedFile.length} bytes)`,
      {
        workflow: { step_id: this.step.name },
        event: { action: 'gdrive_download', outcome: 'success' },
        tags: ['gdrive', 'download'],
      }
    );

    const fileContent = await this.extractContent(downloadedFile, fileMetadata.name, fileMetadata.mimeType);

    return {
      fileId: fileMetadata.id,
      fileName: fileMetadata.name,
      mimeType: fileMetadata.mimeType,
      size: downloadedFile.length,
      content: fileContent,
      contentEncoding: 'utf8',
      metadata: {
        createdTime: fileMetadata.createdTime,
        modifiedTime: fileMetadata.modifiedTime,
        parents: fileMetadata.parents,
        webViewLink: fileMetadata.webViewLink,
      },
    };
  }

  private async handleBatchDownload(fileIds: string[]): Promise<any> {
    if (!this.driveClient) {
      throw new Error('Google Drive client not initialized');
    }

    this.workflowLogger.logInfo(`Batch downloading ${fileIds.length} files`, {
      workflow: { step_id: this.step.name },
      event: { action: 'gdrive_batch_download', outcome: 'unknown' },
      tags: ['gdrive', 'download', 'batch'],
    });

    const results = [];
    const errors = [];

    for (let i = 0; i < fileIds.length; i++) {
      const fileId = fileIds[i];
      try {
        this.workflowLogger.logInfo(`Downloading file ${i + 1}/${fileIds.length}: ${fileId}`, {
          workflow: { step_id: this.step.name },
          event: { action: 'gdrive_batch_download_file', outcome: 'unknown' },
          tags: ['gdrive', 'download', 'batch'],
        });

        const result = await this.handleDownload(fileId);
        results.push(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.workflowLogger.logError(
          `Failed to download file ${fileId}: ${errorMessage}`,
          error instanceof Error ? error : new Error(errorMessage),
          {
            workflow: { step_id: this.step.name },
            event: { action: 'gdrive_batch_download_file', outcome: 'failure' },
            tags: ['gdrive', 'download', 'batch', 'error'],
          }
        );
        errors.push({
          fileId,
          error: errorMessage,
        });
      }
    }

    this.workflowLogger.logInfo(
      `Batch download completed: ${results.length} succeeded, ${errors.length} failed`,
      {
        workflow: { step_id: this.step.name },
        event: { action: 'gdrive_batch_download', outcome: 'success' },
        tags: ['gdrive', 'download', 'batch'],
      }
    );

    return {
      files: results,
      successCount: results.length,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private async extractContent(
    buffer: Buffer,
    fileName: string,
    _contentType: string
  ): Promise<string> {
    console.log(`Downloading the file ${fileName} with content type ${_contentType}`);

    const extractedFileContentResponse = await axios.put(
      'http://localhost:8090/extract_text/',
      buffer,
      {
        headers: { 'Content-Type': 'application/octet-stream' },
      }
    );

    console.log(`Subextracted:`);
    console.log(extractedFileContentResponse);

    return extractedFileContentResponse.data.extracted_text;
  }

  protected async handleFailure(
    input: GDriveOperationInput,
    error: unknown
  ): Promise<RunStepResult> {
    let errorMessage: string;

    if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }

    this.workflowLogger.logError(
      `Google Drive operation failed: ${errorMessage}`,
      error instanceof Error ? error : new Error(errorMessage),
      {
        workflow: { step_id: this.step.name },
        event: { action: 'gdrive_operation', outcome: 'failure' },
        tags: ['gdrive', 'error'],
      }
    );

    return {
      input,
      output: undefined,
      error: errorMessage,
    };
  }
}
