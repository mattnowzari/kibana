/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// TODO: Remove eslint exceptions comments and fix the issues
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { RerankGraphNode } from '@kbn/workflows/graph';
import type { BaseStep, RunStepResult } from '../node_implementation';
import { BaseAtomicNodeImplementation } from '../node_implementation';
import type { StepExecutionRuntime } from '../../workflow_context_manager/step_execution_runtime';
import type { WorkflowExecutionRuntimeManager } from '../../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../../workflow_event_logger/workflow_event_logger';

interface FieldMapping {
  path: string[];
  type: 'text_field' | 'filter_field' | 'date_field' | 'numeric_field';
  alias: string;
}

export interface RerankStep extends BaseStep {
  with: {
    api_query: string;
    user_question: string;
    data: any[] | string; // Can be array or Liquid template string
    data_mapping: FieldMapping[];
    language_code: string;
    recognized_entities?: string[];
    key_terms?: string[]; // Extracted key terms from the query
    key_terms_rephrased?: string[]; // Rephrased variations of key terms
    recency_biased: boolean;
    date_range_filter?: [string, string] | null;
    max_results?: number;
    rerank_horizon?: number; // How many results to retrieve before final RERANK (default: 20)
    use_semantic_search?: boolean; // Enable semantic_text indexing and semantic search (default: true)
    use_rerank?: boolean; // Enable cross-encoder RERANK operation (default: true)
  };
}

export class RerankStepImpl extends BaseAtomicNodeImplementation<RerankStep> {
  // Recency boosting configuration
  private static readonly RECENCY_MAX_BOOST = 2.0; // Maximum boost multiplier for documents at NOW
  private static readonly RECENCY_MIN_BOOST = 1.0; // Minimum boost multiplier (no boost) at horizon
  private static readonly RECENCY_HORIZON_DAYS = 30; // Days until boost decays to minimum
  // Decay rate calculated so that the exponential component decays to ~0.01 at the horizon
  // Formula: boost = MIN + (MAX - MIN) * e^(-lambda * days)
  // At horizon: e^(-lambda * HORIZON) ≈ 0.01, so lambda = -ln(0.01) / HORIZON ≈ 4.6 / HORIZON
  private static readonly RECENCY_DECAY_RATE = 4.6 / RerankStepImpl.RECENCY_HORIZON_DAYS;

  constructor(
    node: RerankGraphNode,
    stepExecutionRuntime: StepExecutionRuntime,
    private workflowLogger: IWorkflowEventLogger,
    workflowRuntime: WorkflowExecutionRuntimeManager
  ) {
    const rerankStep: RerankStep = {
      name: node.configuration.name,
      type: node.type,
      spaceId: '',
      with: node.configuration.with,
    };
    super(rerankStep, stepExecutionRuntime, undefined, workflowRuntime);
  }

  public getInput() {
    // Use the standard rendering approach - ${{}} syntax will preserve object types
    const rendered =
      this.stepExecutionRuntime.contextManager.renderValueAccordingToContext(this.step.with);

    return rendered;
  }

  protected async _run(input: any): Promise<RunStepResult> {

    try {
      this.workflowLogger.logInfo('Starting automatic relevance reranking', {
        event: { action: 'rerank-start', outcome: 'unknown' },
        tags: ['rerank', 'elasticsearch'],
      });

      const {
        api_query,
        user_question,
        data,
        data_mapping,
        language_code,
        recognized_entities = [],
        key_terms = [],
        key_terms_rephrased = [],
        recency_biased,
        date_range_filter,
        max_results = 10,
        rerank_horizon = 20,
        use_semantic_search = true,
        use_rerank = true,
      } = input;


      this.workflowLogger.logInfo(`Rerank step input received: data.length=${data?.length}, user_question=${user_question}`, {
        event: { action: 'rerank-input', outcome: 'unknown' },
        tags: ['rerank', 'debug'],
      });

      // Print all inputs clearly
      console.log('========================================');
      console.log('🔧 RERANK STEP: INPUT PARAMETERS');
      console.log('========================================');
      console.log(`📊 Data length: ${data?.length || 0}`);
      console.log(`🔍 User question: "${user_question}"`);
      console.log(`🏷️  Recognized entities: ${recognized_entities.length > 0 ? JSON.stringify(recognized_entities) : '(none)'}`);
      console.log(`🔑 Key terms: ${key_terms.length > 0 ? JSON.stringify(key_terms) : '(none)'}`);
      console.log(`🔄 Key terms rephrased: ${key_terms_rephrased.length > 0 ? JSON.stringify(key_terms_rephrased) : '(none)'}`);
      console.log(`📅 Recency biased: ${recency_biased}`);
      console.log(`📆 Date range filter: ${date_range_filter ? JSON.stringify(date_range_filter) : '(none)'}`);
      console.log(`🎯 Max results: ${max_results}`);
      console.log(`📏 Rerank horizon: ${rerank_horizon}`);
      console.log(`🧠 Use semantic search: ${use_semantic_search}`);
      console.log(`🔄 Use rerank: ${use_rerank}`);
      console.log(`🌐 Language code: ${language_code}`);
      console.log(`🗺️  Field mappings: ${data_mapping.length} fields`);
      data_mapping.forEach((field: FieldMapping, idx: number) => {
        console.log(`   ${idx + 1}. ${field.alias} (${field.type}) <- ${JSON.stringify(field.path)}`);
      });
      console.log('========================================\n');

      // Step 1: Create dynamic index
      const startCreateIndex = Date.now();
      console.log(`[RERANK] Creating dynamic index (semantic: ${use_semantic_search})...`);
      const indexName = await this.createDynamicIndex(data_mapping, language_code, use_semantic_search);
      const createIndexTime = Date.now() - startCreateIndex;
      console.log(`[RERANK] Index created: ${indexName} (took ${createIndexTime}ms)`);

      // Step 2: Index documents
      const startIndexDocs = Date.now();
      console.log(`[RERANK] Indexing ${data.length} documents...`);
      const docIdMap = await this.indexDocuments(data, data_mapping, indexName, use_semantic_search);
      const indexDocsTime = Date.now() - startIndexDocs;
      console.log(`[RERANK] Documents indexed: ${data.length} docs (took ${indexDocsTime}ms)`);

      // Step 3: Execute multi-strategy search using Retriever DSL
      const startSearch = Date.now();
      console.log(`[RERANK] Executing multi-strategy search (semantic: ${use_semantic_search}, rerank: ${use_rerank})...`);
      const rerankedData = await this.executeMultiStrategySearch(
        indexName,
        user_question,
        data_mapping,
        recognized_entities,
        recency_biased,
        date_range_filter,
        data,
        docIdMap,
        max_results,
        rerank_horizon,
        use_semantic_search,
        use_rerank,
        key_terms,
        key_terms_rephrased
      );
      const searchTime = Date.now() - startSearch;
      console.log(`[RERANK] Search completed: returned ${rerankedData.length} results (took ${searchTime}ms)`);

      // Log before/after comparison
      this.logBeforeAfterComparison(data, rerankedData, data_mapping);

      // Step 4: Cleanup index
      const startCleanup = Date.now();
      console.log(`[RERANK] Cleaning up index: ${indexName}`);
      await this.cleanupIndex(indexName);
      const cleanupTime = Date.now() - startCleanup;
      console.log(`[RERANK] Index cleanup completed (took ${cleanupTime}ms)`);

      this.workflowLogger.logInfo('Automatic relevance reranking completed', {
        event: { action: 'rerank-complete', outcome: 'success' },
        tags: ['rerank', 'elasticsearch'],
      });


      return {
        input,
        output: rerankedData,
        error: undefined,
      };
    } catch (error) {
      this.workflowLogger.logError('Reranking failed', error as Error, {
        event: { action: 'rerank-failed', outcome: 'failure' },
        tags: ['rerank', 'elasticsearch', 'error'],
      });
      return this.handleFailure(input, error);
    }
  }

  private async createDynamicIndex(
    fieldMappings: FieldMapping[],
    languageCode: string,
    useSemanticSearch: boolean
  ): Promise<string> {
    const esClient = this.stepExecutionRuntime.contextManager.getEsClientAsUser();

    // Build index name: temp-index-{step_name}-{workflow_id}-{timestamp}
    const stepName = this.step.name;
    const workflowExecution = (this.stepExecutionRuntime as any).workflowExecution;
    const workflowId = workflowExecution?.workflowId || 'unknown';
    const timestamp = Date.now();

    const indexName = `temp-index-${stepName}-${workflowId}-${timestamp}`;

    this.workflowLogger.logInfo(`Creating dynamic index: ${indexName}`, {
      event: { action: 'create-index', outcome: 'unknown' },
      tags: ['rerank', 'elasticsearch', 'index'],
    });

    // Clean up any leftover temporary indices matching the pattern
    const tempIndexPattern = `temp-index-${stepName}-${workflowId}-*`;
    console.log(`[RERANK] Checking for leftover temp indices matching: ${tempIndexPattern}`);
    try {
      const existingIndices = await esClient.cat.indices({
        index: tempIndexPattern,
        format: 'json',
      });

      if (existingIndices && Array.isArray(existingIndices) && existingIndices.length > 0) {
        const indexNames = existingIndices.map((idx: any) => idx.index);
        console.log(`[RERANK] Found ${indexNames.length} leftover temp indices: ${indexNames.join(', ')}`);

        for (const oldIndex of indexNames) {
          try {
            await esClient.indices.delete({ index: oldIndex });
            console.log(`[RERANK] Deleted leftover temp index: ${oldIndex}`);
          } catch (deleteError) {
            console.log(`[RERANK] Failed to delete temp index ${oldIndex}:`, deleteError);
          }
        }
      } else {
        console.log(`[RERANK] No leftover temp indices found`);
      }
    } catch (error) {
      // Index pattern doesn't exist or other error - that's fine, continue
      console.log(`[RERANK] No temp indices to clean up (pattern not found)`);
    }

    // Build analyzer settings based on language
    const startBuildSettings = Date.now();
    const analyzerSettings = this.buildAnalyzerSettings(languageCode);
    console.log(`[RERANK] Built analyzer settings (took ${Date.now() - startBuildSettings}ms)`);

    // Build dynamic mappings
    const startBuildMappings = Date.now();
    const properties: any = {};
    for (const field of fieldMappings) {
      properties[field.alias] = this.buildFieldMapping(field.type, languageCode);

      // Add n-gram and semantic variants for text fields
      if (field.type === 'text_field') {
        properties[`${field.alias}_bigram`] = {
          type: 'text',
          analyzer: 'lang_bigram_analyzer',
        };
        properties[`${field.alias}_trigram`] = {
          type: 'text',
          analyzer: 'lang_trigram_analyzer',
        };
        // Only add semantic_text field if semantic search is enabled
        if (useSemanticSearch) {
          properties[`${field.alias}_semantic`] = {
            type: 'semantic_text',
          };
        }
      }
    }
    console.log(`[RERANK] Built field mappings (took ${Date.now() - startBuildMappings}ms)`);

    const startCreateIndexCall = Date.now();
    console.log('[RERANK] Calling ES indices.create API...');
    await esClient.indices.create({
      index: indexName,
      settings: {
        analysis: analyzerSettings,
      },
      mappings: {
        properties,
      },
    });
    console.log(`[RERANK] ES indices.create completed (took ${Date.now() - startCreateIndexCall}ms)`);

    this.workflowLogger.logInfo(`Index created successfully: ${indexName}`, {
      event: { action: 'create-index', outcome: 'success' },
      tags: ['rerank', 'elasticsearch', 'index'],
    });

    return indexName;
  }

  private buildAnalyzerSettings(languageCode: string): any {
    const commonFilters = {
      bigram_filter: {
        type: 'shingle',
        min_shingle_size: 2,
        max_shingle_size: 2,
        output_unigrams: false,
      },
      trigram_filter: {
        type: 'shingle',
        min_shingle_size: 3,
        max_shingle_size: 3,
        output_unigrams: false,
      },
    };

    const languageFilters: any = { ...commonFilters };
    const baseAnalyzerFilters: string[] = ['lowercase'];

    if (languageCode === 'en') {
      languageFilters.english_stop = { type: 'stop', stopwords: '_english_' };
      languageFilters.english_stemmer = { type: 'stemmer', language: 'english' };
      languageFilters.english_possessive_stemmer = {
        type: 'stemmer',
        language: 'possessive_english',
      };
      baseAnalyzerFilters.push(
        'english_possessive_stemmer',
        'english_stop',
        'english_stemmer'
      );
    } else if (languageCode === 'es') {
      languageFilters.spanish_stop = { type: 'stop', stopwords: '_spanish_' };
      languageFilters.spanish_stemmer = { type: 'stemmer', language: 'spanish' };
      baseAnalyzerFilters.push('spanish_stop', 'spanish_stemmer');
    } else if (languageCode === 'fr') {
      languageFilters.french_stop = { type: 'stop', stopwords: '_french_' };
      languageFilters.french_stemmer = { type: 'stemmer', language: 'french' };
      languageFilters.french_elision = {
        type: 'elision',
        articles_case: true,
        articles: ['l', 'm', 't', 'qu', 'n', 's', 'j', 'd', 'c'],
      };
      baseAnalyzerFilters.push('french_elision', 'french_stop', 'french_stemmer');
    }

    return {
      filter: languageFilters,
      analyzer: {
        lang_bigram_analyzer: {
          type: 'custom',
          tokenizer: 'standard',
          filter: [...baseAnalyzerFilters, 'bigram_filter'],
        },
        lang_trigram_analyzer: {
          type: 'custom',
          tokenizer: 'standard',
          filter: [...baseAnalyzerFilters, 'trigram_filter'],
        },
      },
    };
  }

  private buildFieldMapping(fieldType: string, languageCode: string): any {
    switch (fieldType) {
      case 'text_field':
        // Map language codes to Elasticsearch built-in analyzer names
        const analyzerMap: Record<string, string> = {
          en: 'english',
          es: 'spanish',
          fr: 'french',
          default: 'standard',
        };
        return {
          type: 'text',
          analyzer: analyzerMap[languageCode] || 'standard',
          // Use ignore_above to prevent indexing terms longer than 32766 bytes in the .keyword field
          fields: { keyword: { type: 'keyword', ignore_above: 32766 } },
        };
      case 'filter_field':
        return { type: 'keyword' };
      case 'date_field':
        // Support multiple date formats: epoch_second, epoch_millis, and ISO 8601
        return { type: 'date', format: 'epoch_second||epoch_millis||strict_date_optional_time||yyyy-MM-dd HH:mm:ss' };
      case 'numeric_field':
        return { type: 'float' };
      default:
        return { type: 'keyword' };
    }
  }

  private async indexDocuments(
    data: any[],
    fieldMappings: FieldMapping[],
    indexName: string,
    useSemanticSearch: boolean
  ): Promise<Map<string, number>> {
    const esClient = this.stepExecutionRuntime.contextManager.getEsClientAsUser();

    this.workflowLogger.logInfo(`Indexing ${data.length} documents to ${indexName}`, {
      event: { action: 'bulk-index', outcome: 'unknown' },
      tags: ['rerank', 'elasticsearch', 'bulk'],
    });

    // Map to track document ID -> original array index
    const docIdToOriginalIndex = new Map<string, number>();

    // Build bulk index operations
    const startBuildBulk = Date.now();
    const bulkOperations: any[] = [];
    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      // Use array index as the document ID so we can map back later
      const docId = `doc-${i}`;
      bulkOperations.push({ index: { _index: indexName, _id: docId } });
      docIdToOriginalIndex.set(docId, i);

      // Build document dynamically based on field mappings
      const doc: any = {};
      for (const field of fieldMappings) {
        const value = this.extractFieldValue(record, field.path);
        doc[field.alias] = value;

        // Add n-gram and semantic variants for text fields (only if value is a string)
        if (field.type === 'text_field' && typeof value === 'string') {
          doc[`${field.alias}_bigram`] = value;
          doc[`${field.alias}_trigram`] = value;
          // Only add semantic field if semantic search is enabled
          if (useSemanticSearch) {
            doc[`${field.alias}_semantic`] = value;
          }
        }
      }

      bulkOperations.push(doc);
    }
    console.log(`[RERANK] Built bulk operations (took ${Date.now() - startBuildBulk}ms)`);

    const startBulkCall = Date.now();
    console.log(`[RERANK] Calling ES bulk API with ${bulkOperations.length / 2} documents... (timeout: 5m)`);
    try {
      const bulkResponse = await esClient.bulk({
        refresh: true,
        operations: bulkOperations,
        timeout: '5m',
      }, {
        requestTimeout: 300000, // 5 minute client-level timeout (default is 30s)
      });
      console.log(`[RERANK] ES bulk call completed (took ${Date.now() - startBulkCall}ms)`);
      console.log(`[RERANK] Bulk response errors: ${bulkResponse.errors}, items: ${bulkResponse.items?.length || 0}`);

      if (bulkResponse.errors) {
        const errorItems = bulkResponse.items?.filter((item: any) => item.index?.error || item.create?.error);
        console.log(`[RERANK] Bulk errors found: ${JSON.stringify(errorItems?.slice(0, 3), null, 2)}`);
      }
    } catch (error) {
      console.log(`[RERANK] ES bulk call FAILED after ${Date.now() - startBulkCall}ms`);
      console.log(`[RERANK] Bulk error:`, error);
      throw error;
    }

    this.workflowLogger.logInfo(`Successfully indexed ${data.length} documents`, {
      event: { action: 'bulk-index', outcome: 'success' },
      tags: ['rerank', 'elasticsearch', 'bulk'],
    });

    return docIdToOriginalIndex;
  }

  private extractFieldValue(record: any, path: string[]): any {
    let value = record;
    for (const part of path) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return null;
      }
    }
    return value;
  }

  private async executeMultiStrategySearch(
    indexName: string,
    userQuestion: string,
    fieldMappings: FieldMapping[],
    recognizedEntities: string[],
    recencyBiased: boolean,
    dateRangeFilter: [string, string] | null | undefined,
    originalData: any[],
    docIdMap: Map<string, number>,
    maxResults: number,
    rerankHorizon: number,
    useSemanticSearch: boolean,
    useRerank: boolean,
    keyTerms?: string[],
    keyTermsRephrased?: string[]
  ): Promise<any[]> {
    const esClient = this.stepExecutionRuntime.contextManager.getEsClientAsUser();

    this.workflowLogger.logInfo(`Executing multi-strategy search with Retriever DSL on ${indexName}`, {
      event: { action: 'multi-strategy-search', outcome: 'unknown' },
      tags: ['rerank', 'elasticsearch', 'retriever'],
    });

    // Find all text fields
    const textFields = fieldMappings
      .filter((f) => f.type === 'text_field')
      .map((f) => f.alias);

    if (textFields.length === 0) {
      throw new Error('No text field found in data_mapping for search');
    }

    // Find date field for recency bias
    const dateField = fieldMappings.find((f) => f.type === 'date_field')?.alias;

    // Helper function to wrap a query with date filter and/or recency boost
    const wrapQueryWithFiltersAndBoost = (baseQuery: any): any => {
      let wrappedQuery = baseQuery;

      // Apply date range filter if provided
      if (dateRangeFilter && dateRangeFilter.length === 2 && dateField) {
        wrappedQuery = {
          bool: {
            must: baseQuery,
            filter: {
              range: {
                [dateField]: {
                  gte: dateRangeFilter[0],
                  lte: dateRangeFilter[1],
                },
              },
            },
          },
        };
      }

      // Apply recency boost if enabled
      if (recencyBiased && dateField) {
        const maxBoost = RerankStepImpl.RECENCY_MAX_BOOST;

        wrappedQuery = {
          function_score: {
            query: wrappedQuery,
            functions: [
              {
                exp: {
                  [dateField]: {
                    origin: 'now',
                    scale: `${RerankStepImpl.RECENCY_HORIZON_DAYS}d`,
                    decay: 0.5, // At scale distance, function value decays to 0.5
                  },
                },
                weight: maxBoost,
              },
            ],
            score_mode: 'multiply',
            boost_mode: 'multiply',
          },
        };
      }

      return wrappedQuery;
    };

    // Build retriever configuration
    const retrievers: any[] = [];

    // 1. Standard retriever for base text search (weight 1.0)
    // Search across all text fields using multi_match
    const textQuery = {
      multi_match: {
        query: userQuestion,
        fields: textFields,
      },
    };
    retrievers.push({
      retriever: {
        standard: {
          query: wrapQueryWithFiltersAndBoost(textQuery),
        },
      },
    });

    // 2. Standard retriever for bigram search (weight 1.0)
    const bigramFields = textFields.map(f => `${f}_bigram`);
    const bigramQuery = {
      multi_match: {
        query: userQuestion,
        fields: bigramFields,
      },
    };
    retrievers.push({
      retriever: {
        standard: {
          query: wrapQueryWithFiltersAndBoost(bigramQuery),
        },
      },
    });

    // 3. Standard retriever for trigram search (weight 1.0)
    const trigramFields = textFields.map(f => `${f}_trigram`);
    const trigramQuery = {
      multi_match: {
        query: userQuestion,
        fields: trigramFields,
      },
    };
    retrievers.push({
      retriever: {
        standard: {
          query: wrapQueryWithFiltersAndBoost(trigramQuery),
        },
      },
    });

    // 4. Semantic search via standard retriever with semantic_text fields (weight 1.0) - only if enabled
    // Note: semantic_text fields must be queried with bool query containing match clauses, not multi_match
    if (useSemanticSearch) {
      const semanticFields = textFields.map(f => `${f}_semantic`);

      // Build bool query with should clauses for each semantic field
      const semanticQuery = {
        bool: {
          should: semanticFields.map(field => ({
            match: {
              [field]: userQuestion,
            },
          })),
          minimum_should_match: 1,
        },
      };

      retrievers.push({
        retriever: {
          standard: {
            query: wrapQueryWithFiltersAndBoost(semanticQuery),
          },
        },
      });
    }

    // 5. Key terms search - search for extracted key terms across text fields (weight 1.0)
    if (keyTerms && keyTerms.length > 0) {
      for (const keyTerm of keyTerms) {
        const keyTermQuery = {
          multi_match: {
            query: keyTerm,
            fields: textFields,
            type: 'best_fields', // Use best_fields to find documents where term appears strongly
          },
        };

        retrievers.push({
          retriever: {
            standard: {
              query: wrapQueryWithFiltersAndBoost(keyTermQuery),
            },
          },
        });
      }
    }

    // 6. Rephrased key terms search - search for rephrased variations of key terms (weight 1.0)
    if (keyTermsRephrased && keyTermsRephrased.length > 0) {
      for (const rephrasedTerm of keyTermsRephrased) {
        const rephrasedQuery = {
          multi_match: {
            query: rephrasedTerm,
            fields: textFields,
            type: 'best_fields',
          },
        };

        retrievers.push({
          retriever: {
            standard: {
              query: wrapQueryWithFiltersAndBoost(rephrasedQuery),
            },
          },
        });
      }
    }

    // Track the number of main search strategy retrievers (before entity retrievers)
    const numMainRetrievers = retrievers.length;

    // 7. Entity retrievers (weight 0.5 each)
    if (recognizedEntities.length > 0) {
      const keywordFields = fieldMappings
        .filter((f) => f.type === 'filter_field')
        .map((f) => f.alias);

      for (const entity of recognizedEntities) {
        // Build bool query that searches across both text and keyword fields
        const shouldClauses: any[] = [];

        // Text field matches
        textFields.forEach(f => {
          shouldClauses.push({
            match: {
              [f]: entity,
            },
          });
        });

        // Keyword field matches
        keywordFields.forEach(f => {
          shouldClauses.push({
            term: {
              [f]: entity,
            },
          });
        });

        const entityQuery = {
          constant_score: {
            filter: {
              bool: {
                should: shouldClauses,
                minimum_should_match: 1,
              },
            },
            boost: 1.0,
          },
        };

        retrievers.push({
          retriever: {
            standard: {
              query: wrapQueryWithFiltersAndBoost(entityQuery),
            },
          },
        });
      }
    }

    // Build retrievers with weights embedded in each retriever object
    // Main strategies get weight 1.0, entity retrievers get weight 0.5
    const weightedRetrievers = retrievers.map((ret, idx) => {
      const isEntityRetriever = idx >= numMainRetrievers;
      return {
        ...ret,
        weight: isEntityRetriever ? 0.5 : 1.0,
      };
    });

    // Build the retriever query using linear combiner
    // Note: Date range filtering and recency boosting are applied within each retriever's query
    let retrieverQuery: any = {
      retriever: {
        linear: {
          retrievers: weightedRetrievers,
          rank_window_size: rerankHorizon,
        },
      },
      size: rerankHorizon,
    };

    // Apply text_similarity_reranker if rerank is enabled
    if (useRerank) {
      // text_similarity_reranker only supports a single field
      // Select the text field with the longest maximum content across all documents
      const textFieldsForRerank = fieldMappings.filter((f) => f.type === 'text_field');

      let selectedRerankField = textFieldsForRerank[0]?.alias;
      let maxFieldLength = 0;

      // Analyze all documents to find which text field has the longest max content
      for (const field of textFieldsForRerank) {
        let maxLengthForField = 0;

        for (const doc of originalData) {
          const value = this.extractFieldValue(doc, field.path);
          if (typeof value === 'string') {
            maxLengthForField = Math.max(maxLengthForField, value.length);
          }
        }

        if (maxLengthForField > maxFieldLength) {
          maxFieldLength = maxLengthForField;
          selectedRerankField = field.alias;
        }
      }

      console.log(`[RERANK] Selected field for reranking: ${selectedRerankField} (max length: ${maxFieldLength} chars)`);

      retrieverQuery.retriever = {
        text_similarity_reranker: {
          retriever: retrieverQuery.retriever,
          field: selectedRerankField, // Single field name
          inference_text: userQuestion,
          rank_window_size: rerankHorizon,
          // Use chunk_rescorer to handle long documents by chunking them before reranking
          chunk_rescorer: {
            size: 1, // Number of best-scoring chunks to pass to reranker per document
            // Use default optimal chunking settings for Elastic Rerank
          },
        },
      };
    }

    // Print retriever DSL query to console for debugging
    console.log('========================================');
    console.log('🔍 RERANK STEP: RETRIEVER DSL QUERY');
    console.log('========================================');
    console.log(JSON.stringify(retrieverQuery, null, 2));
    console.log('========================================');

    this.workflowLogger.logInfo(`Executing Retriever DSL query:\n${JSON.stringify(retrieverQuery, null, 2)}`, {
      event: { action: 'multi-strategy-search-retriever', outcome: 'unknown' },
      tags: ['rerank', 'elasticsearch', 'retriever', 'query'],
    });

    // Execute the search
    let response;
    const queryStartTime = Date.now();
    console.log('[RERANK] Executing Retriever DSL search... (timeout: 5m)');
    try {
      response = await esClient.search({
        index: indexName,
        ...retrieverQuery,
      }, {
        requestTimeout: 300000, // 5 minute timeout for rerank operations
      });
      const queryEndTime = Date.now();
      const queryTime = queryEndTime - queryStartTime;

      console.log(`[RERANK] Retriever DSL search completed (took ${queryTime}ms)`);
      console.log('========================================');
      console.log('🔍 RERANK STEP: RETRIEVER DSL RESPONSE');
      console.log('========================================');
      console.log(JSON.stringify(response, null, 2));
      console.log('========================================');
    } catch (error) {
      console.log('========================================');
      console.log('❌ RERANK STEP: RETRIEVER DSL ERROR');
      console.log('========================================');
      console.log('Error object:', error);
      console.log('Error JSON:', JSON.stringify(error, null, 2));
      if (error && typeof error === 'object') {
        console.log('Error keys:', Object.keys(error));
        const err = error as any;
        if (err.meta) {
          console.log('Error meta:', JSON.stringify(err.meta, null, 2));
        }
        if (err.body) {
          console.log('Error body:', JSON.stringify(err.body, null, 2));
        }
        if (err.message) {
          console.log('Error message:', err.message);
        }
        if (err.stack) {
          console.log('Error stack:', err.stack);
        }
      }
      console.log('========================================');

      this.workflowLogger.logError(`Retriever DSL search failed`, error as Error, {
        event: { action: 'multi-strategy-search-retriever', outcome: 'failure' },
        tags: ['rerank', 'elasticsearch', 'retriever', 'error'],
      });
      throw error;
    }

    this.workflowLogger.logInfo('Multi-strategy search with Retriever DSL completed', {
      event: { action: 'multi-strategy-search-retriever', outcome: 'success' },
      tags: ['rerank', 'elasticsearch', 'retriever'],
    });

    // Map search results back to original data objects
    const hits = (response as any).hits?.hits || [];

    // Track which indices were used
    const usedIndices = new Set<number>();
    const esResults = hits
      .map((hit: any) => {
        const docId = hit._id;
        const originalIndex = docIdMap.get(docId);

        if (originalIndex !== undefined) {
          usedIndices.add(originalIndex);
          return originalData[originalIndex];
        }
        return null;
      })
      .filter((item: any) => item !== null);

    console.log(`[RERANK] Retriever DSL returned ${esResults.length} results, need ${maxResults} total`);

    // If we got fewer results than max_results, backfill with unused items from original data
    let finalResults = [...esResults];

    if (finalResults.length < maxResults) {
      console.log(`[RERANK] Backfilling ${maxResults - finalResults.length} items from original data`);

      // Get items that weren't in the search results (in original order)
      const unusedItems = originalData.filter((_item, index) => !usedIndices.has(index));

      // Add unused items until we reach max_results
      const itemsNeeded = maxResults - finalResults.length;
      const backfillItems = unusedItems.slice(0, itemsNeeded);

      console.log(`[RERANK] Adding ${backfillItems.length} backfill items`);
      finalResults = [...finalResults, ...backfillItems];
    }

    // Ensure we don't exceed max_results
    finalResults = finalResults.slice(0, maxResults);

    this.workflowLogger.logInfo(`Final result: ${finalResults.length} documents (${esResults.length} from search, ${finalResults.length - esResults.length} backfilled)`, {
      event: { action: 'multi-strategy-search-retriever', outcome: 'success' },
      tags: ['rerank', 'elasticsearch', 'retriever'],
    });

    return finalResults;
  }


  private logBeforeAfterComparison(
    originalData: any[],
    rerankedData: any[],
    fieldMappings: FieldMapping[]
  ): void {
    console.log('========================================');
    console.log('📊 RERANK COMPARISON: TOP 3 BEFORE vs AFTER');
    console.log('========================================');

    // Find text fields to display
    const textFields = fieldMappings
      .filter((f) => f.type === 'text_field')
      .map((f) => f.alias);

    // Show top 3 from original data
    console.log('\n🔵 BEFORE RERANKING (Original Order):');
    const top3Before = originalData.slice(0, 3);
    top3Before.forEach((item, idx) => {
      console.log(`\n  ${idx + 1}.`);
      textFields.forEach((field) => {
        const value = this.extractFieldValue(item, fieldMappings.find(f => f.alias === field)?.path || []);
        const preview = typeof value === 'string' && value.length > 100
          ? value.substring(0, 100) + '...'
          : value;
        console.log(`     ${field}: ${preview}`);
      });
    });

    // Show top 3 from reranked data
    console.log(`\n\n🟢 AFTER RERANKING (Retriever DSL):`);
    const top3After = rerankedData.slice(0, 3);
    top3After.forEach((item, idx) => {
      console.log(`\n  ${idx + 1}.`);
      textFields.forEach((field) => {
        const value = this.extractFieldValue(item, fieldMappings.find(f => f.alias === field)?.path || []);
        const preview = typeof value === 'string' && value.length > 100
          ? value.substring(0, 100) + '...'
          : value;
        console.log(`     ${field}: ${preview}`);
      });
    });

    console.log('\n========================================\n');
  }

  private async cleanupIndex(indexName: string): Promise<void> {
    const esClient = this.stepExecutionRuntime.contextManager.getEsClientAsUser();

    this.workflowLogger.logInfo(`Cleaning up index: ${indexName}`, {
      event: { action: 'cleanup-index', outcome: 'unknown' },
      tags: ['rerank', 'elasticsearch', 'cleanup'],
    });

    try {
      const startDeleteCall = Date.now();
      console.log('[RERANK] Calling ES indices.delete API...');
      await esClient.indices.delete({ index: indexName });
      console.log(`[RERANK] ES indices.delete completed (took ${Date.now() - startDeleteCall}ms)`);
      this.workflowLogger.logInfo(`Index deleted successfully: ${indexName}`, {
        event: { action: 'cleanup-index', outcome: 'success' },
        tags: ['rerank', 'elasticsearch', 'cleanup'],
      });
    } catch (error) {
      this.workflowLogger.logError(`Failed to delete index: ${indexName}`, error as Error, {
        event: { action: 'cleanup-index', outcome: 'failure' },
        tags: ['rerank', 'elasticsearch', 'cleanup', 'error'],
      });
      // Don't fail the whole step if cleanup fails
    }
  }
}
