/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import axios from 'axios';
import https from 'https';
import { schema } from '@kbn/config-schema';
import type { IRouter, Logger } from '@kbn/core/server';
import { DEFAULT_NAMESPACE_STRING } from '@kbn/core-saved-objects-utils-server';
import { WORKPLACE_CONNECTOR_SAVED_OBJECT_TYPE } from '../saved_objects';
import type {
  CreateWorkplaceConnectorRequest,
  UpdateWorkplaceConnectorRequest,
  WorkplaceConnectorResponse,
  WorkplaceConnectorAttributes,
} from '../../common';
import { WORKPLACE_CONNECTOR_TYPES } from '../../common';
import {
  createConnectorRequestSchema,
  updateConnectorRequestSchema,
  connectorIdSchema,
} from './schemas';
import type { WorkflowCreatorService } from '../services/workflow_creator';

// Connector configuration - eventually this will come from an API
interface ConnectorConfig {
  defaultFeatures: string[];
  oauthConfig?: {
    provider: string;
    scopes: string[];
    initiatePath: string;
    fetchSecretsPath: string;
  };
}

const CONNECTOR_CONFIG: Record<string, ConnectorConfig> = {
  brave_search: {
    defaultFeatures: ['search_web'],
  },
  google_drive: {
    defaultFeatures: ['search_files'],
    oauthConfig: {
      provider: 'google',
      scopes: [
        'email',
        'profile',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.metadata.readonly',
      ],
      initiatePath: '/oauth/start/google',
      fetchSecretsPath: '/oauth/fetch_request_secrets',
    },
  },
};

// Helper function to build response from saved object
function buildConnectorResponse(
  savedObject: { id: string; attributes: WorkplaceConnectorAttributes }
): WorkplaceConnectorResponse {
  const attrs = savedObject.attributes;
  return {
    id: savedObject.id,
    name: attrs.name,
    type: attrs.type,
    config: attrs.config,
    createdAt: attrs.createdAt,
    updatedAt: attrs.updatedAt,
    workflowId: attrs.workflowId,
    workflowIds: attrs.workflowIds,
    toolIds: attrs.toolIds,
    features: attrs.features,
    hasSecrets: !!attrs.secrets,
  };
}

// Helper function to create workflows for a connector
async function createWorkflowsForConnector(
  connectorId: string,
  connectorType: string,
  features: string[],
  savedObjectsClient: any,
  workflowCreator: WorkflowCreatorService,
  request: any,
  logger: Logger
): Promise<{ workflowId?: string; workflowIds: string[]; toolIds: string[] }> {
  const workflowIds: string[] = [];
  const toolIds: string[] = [];

  try {
    const spaceId = savedObjectsClient.getCurrentNamespace() ?? DEFAULT_NAMESPACE_STRING;

    for (const feature of features) {
      const createdWorkflowId = await workflowCreator.createWorkflowForConnector(
        connectorId,
        connectorType,
        spaceId,
        request,
        feature
      );
      workflowIds.push(createdWorkflowId);
      toolIds.push(`${connectorType}.${feature}`.slice(0, 64));
    }

    const workflowId = workflowIds[0];

    await savedObjectsClient.update(WORKPLACE_CONNECTOR_SAVED_OBJECT_TYPE, connectorId, {
      workflowId,
      workflowIds,
      toolIds,
    });

    return { workflowId, workflowIds, toolIds };
  } catch (workflowError) {
    logger.error(
      `Failed to create workflow for connector ${connectorId}: ${
        (workflowError as Error).message
      }`
    );
    return { workflowIds, toolIds };
  }
}

// Helper function to get default features for a connector type
function getDefaultFeatures(connectorType: string): string[] {
  return CONNECTOR_CONFIG[connectorType]?.defaultFeatures || [];
}

export function registerConnectorRoutes(
  router: IRouter,
  workflowCreator: WorkflowCreatorService,
  logger: Logger
) {
  // Initiate Google Drive OAuth
  router.post(
    {
      path: '/api/workplace_connectors/google/initiate',
      validate: {},
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
    },
    async (context, request, response) => {
      const coreContext = await context.core;
      const connectorType = WORKPLACE_CONNECTOR_TYPES.GOOGLE_DRIVE;
      const connectorConfig = CONNECTOR_CONFIG[connectorType];

      if (!connectorConfig?.oauthConfig) {
        return response.customError({
          statusCode: 400,
          body: {
            message: `OAuth not configured for connector type: ${connectorType}`,
          },
        });
      }

      try {
        const savedObjectsClient = coreContext.savedObjects.client;
        const now = new Date().toISOString();

        const savedObject = await savedObjectsClient.create(WORKPLACE_CONNECTOR_SAVED_OBJECT_TYPE, {
          name: 'Google Drive',
          type: connectorType,
          config: { status: 'pending_oauth' },
          secrets: {},
          features: connectorConfig.defaultFeatures,
          createdAt: now,
          updatedAt: now,
        });

        const oauthUrl = `https://localhost:8052${connectorConfig.oauthConfig.initiatePath}`;
        const authresponse = await axios.post(
          oauthUrl,
          {
            scope: connectorConfig.oauthConfig.scopes,
          },
          {
            httpsAgent: new https.Agent({
              rejectUnauthorized: false,
            }),
          }
        );

        const googleUrl = authresponse.data['auth_url'];
        const requestId = authresponse.data['request_id'];

        logger.info(`Google URL: ${googleUrl}`);

        return response.ok({
          body: {
            connectorId: savedObject.id,
            requestId,
            googleUrl,
          },
        });
      } catch (error) {
        logger.error(`Failed to initiate OAuth: ${(error as Error).message}`);
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to initiate OAuth: ${(error as Error).message}`,
          },
        });
      }
    }
  );

  // Handle OAuth callback - fetches secrets and updates connector
  router.get(
    {
      path: '/api/workplace_connectors/oauth/complete',
      validate: {
        query: schema.object({
          request_id: schema.string(),
          connector_id: schema.string(),
        }),
      },
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
    },
    async (context, request, response) => {
      const coreContext = await context.core;

      try {
        const { request_id, connector_id } = request.query;
        const savedObjectsClient = coreContext.savedObjects.client;

        // Get connector to determine type and config
        const connector = await savedObjectsClient.get(
          WORKPLACE_CONNECTOR_SAVED_OBJECT_TYPE,
          connector_id
        );
        const connectorType = (connector.attributes as WorkplaceConnectorAttributes).type;
        const connectorConfig = CONNECTOR_CONFIG[connectorType];

        if (!connectorConfig?.oauthConfig) {
          return response.customError({
            statusCode: 400,
            body: {
              message: `OAuth not configured for connector type: ${connectorType}`,
            },
          });
        }

        // Fetch secrets from OAuth service
        const secretsUrl = `https://localhost:8052${connectorConfig.oauthConfig.fetchSecretsPath}?request_id=${request_id}`;
        const maxRetries = 5;
        const retryDelay = 2000;
        let secretsresponse;
        let access_token: string | undefined;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            secretsresponse = await axios.get(secretsUrl, {
              headers: {
                'Content-Type': 'application/json',
              },
              httpsAgent: new https.Agent({
                rejectUnauthorized: false,
              }),
            });

            access_token = secretsresponse.data['access_token'];

            if (access_token) {
              logger.info(`Access token found on attempt ${attempt}`);
              break;
            }

            if (attempt < maxRetries) {
              logger.info(`No access token found on attempt ${attempt}, retrying...`);
              await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
          } catch (err) {
            if (attempt < maxRetries) {
              logger.warn(`Error fetching secrets on attempt ${attempt}, retrying...`, err);
              await new Promise((resolve) => setTimeout(resolve, retryDelay));
            } else {
              throw err;
            }
          }
        }

        if (!access_token) {
          throw new Error('Access token not found after 5 attempts');
        }

        const refresh_token = secretsresponse!.data['refresh_token'];
        const expires_in = secretsresponse!.data['expires_in'];

        logger.info(`Secrets fetched for connector ${connector_id}`);

        // Update connector with OAuth tokens
        await savedObjectsClient.update(WORKPLACE_CONNECTOR_SAVED_OBJECT_TYPE, connector_id, {
          secrets: {
            access_token,
            refresh_token: refresh_token || '',
            expires_in: expires_in || '3600',
          },
          config: { status: 'connected' },
          updatedAt: new Date().toISOString(),
        });

        // Create workflows for the connector
        const features = connectorConfig.defaultFeatures;
        await createWorkflowsForConnector(
          connector_id,
          connectorType,
          features,
          savedObjectsClient,
          workflowCreator,
          request,
          logger
        );

        return response.ok({
          body: {
            success: true,
            connector_id,
          },
        });
      } catch (error) {
        logger.error(`OAuth complete error: ${(error as Error).message}`);
        return response.customError({
          statusCode: 500,
          body: {
            message: (error as Error).message || 'Failed to complete OAuth',
          },
        });
      }
    }
  );

  // Create connector
  router.post(
    {
      path: '/api/workplace_connectors',
      validate: {
        body: createConnectorRequestSchema,
      },
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
    },
    async (context, request, response) => {
      const coreContext = await context.core;
      const {
        name,
        type,
        config = {},
        secrets,
        features = [],
      } = request.body as CreateWorkplaceConnectorRequest;

      try {
        const savedObjectsClient = coreContext.savedObjects.client;
        const now = new Date().toISOString();

        // Use provided features or default features for connector type
        const featuresToUse = features.length > 0 ? features : getDefaultFeatures(type);

        const savedObject = await savedObjectsClient.create(WORKPLACE_CONNECTOR_SAVED_OBJECT_TYPE, {
          name,
          type,
          config,
          secrets,
          features: featuresToUse,
          createdAt: now,
          updatedAt: now,
        });

        // Create workflows for the connector
        const { workflowId, workflowIds, toolIds } = await createWorkflowsForConnector(
          savedObject.id,
          type,
          featuresToUse,
          savedObjectsClient,
          workflowCreator,
          request,
          logger
        );

        const responseData = buildConnectorResponse(savedObject);
        responseData.workflowId = workflowId;
        responseData.workflowIds = workflowIds;
        responseData.toolIds = toolIds;

        return response.ok({
          body: responseData,
        });
      } catch (error) {
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to create connector: ${(error as Error).message}`,
          },
        });
      }
    }
  );

  // Get connector by ID
  router.get(
    {
      path: '/api/workplace_connectors/{id}',
      validate: {
        params: connectorIdSchema,
      },
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
    },
    async (context, request, response) => {
      const coreContext = await context.core;
      const { id } = request.params;

      try {
        const savedObjectsClient = coreContext.savedObjects.client;
        const savedObject = await savedObjectsClient.get(WORKPLACE_CONNECTOR_SAVED_OBJECT_TYPE, id);

        const responseData = buildConnectorResponse(savedObject);

        return response.ok({
          body: responseData,
        });
      } catch (error) {
        if ((error as any).output?.statusCode === 404) {
          return response.notFound({
            body: {
              message: `Connector with ID ${id} not found`,
            },
          });
        }
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to get connector: ${(error as Error).message}`,
          },
        });
      }
    }
  );

  // List all connectors
  router.get(
    {
      path: '/api/workplace_connectors',
      validate: {},
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
    },
    async (context, request, response) => {
      const coreContext = await context.core;

      try {
        const savedObjectsClient = coreContext.savedObjects.client;
        const findResult = await savedObjectsClient.find({
          type: WORKPLACE_CONNECTOR_SAVED_OBJECT_TYPE,
          perPage: 100,
        });

        const connectors: WorkplaceConnectorResponse[] = findResult.saved_objects.map(
          (savedObject) => buildConnectorResponse(savedObject)
        );

        return response.ok({
          body: {
            connectors,
            total: findResult.total,
          },
        });
      } catch (error) {
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to list connectors: ${(error as Error).message}`,
          },
        });
      }
    }
  );

  // Update connector
  router.put(
    {
      path: '/api/workplace_connectors/{id}',
      validate: {
        params: connectorIdSchema,
        body: updateConnectorRequestSchema,
      },
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
    },
    async (context, request, response) => {
      const coreContext = await context.core;
      const { id } = request.params;
      const updates = request.body as UpdateWorkplaceConnectorRequest;

      try {
        const savedObjectsClient = coreContext.savedObjects.client;
        const now = new Date().toISOString();

        const savedObject = await savedObjectsClient.update(
          WORKPLACE_CONNECTOR_SAVED_OBJECT_TYPE,
          id,
          {
            ...updates,
            updatedAt: now,
          }
        );

        const responseData = buildConnectorResponse(savedObject);

        return response.ok({
          body: responseData,
        });
      } catch (error) {
        if ((error as any).output?.statusCode === 404) {
          return response.notFound({
            body: {
              message: `Connector with ID ${id} not found`,
            },
          });
        }
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to update connector: ${(error as Error).message}`,
          },
        });
      }
    }
  );

  // Delete connector
  router.delete(
    {
      path: '/api/workplace_connectors/{id}',
      validate: {
        params: connectorIdSchema,
      },
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
    },
    async (context, request, response) => {
      const coreContext = await context.core;
      const { id } = request.params;

      try {
        const savedObjectsClient = coreContext.savedObjects.client;
        // Cascade delete related workflows/tools (best-effort)
        const workflowIds: string[] = [];
        let toolIds: string[] = [];
        try {
          const existing = await savedObjectsClient.get(WORKPLACE_CONNECTOR_SAVED_OBJECT_TYPE, id);
          const attrs = existing.attributes as unknown as {
            workflowId?: string;
            workflowIds?: string[];
            toolIds?: string[];
          };
          if (attrs.workflowId) workflowIds.push(attrs.workflowId);
          if (attrs.workflowIds?.length) workflowIds.push(...attrs.workflowIds);
          if (attrs.toolIds?.length) toolIds = attrs.toolIds;
        } catch (e) {
          // ignore if not found
        }

        const spaceId = savedObjectsClient.getCurrentNamespace() ?? DEFAULT_NAMESPACE_STRING;
        try {
          if (workflowIds.length > 0 && workflowCreator.deleteWorkflows) {
            await workflowCreator.deleteWorkflows(workflowIds, spaceId, request);
          }
        } catch {
          // ignore
        }
        try {
          if (toolIds.length > 0 && workflowCreator.deleteTools) {
            await workflowCreator.deleteTools(toolIds, request);
          }
        } catch {
          // ignore
        }

        await savedObjectsClient.delete(WORKPLACE_CONNECTOR_SAVED_OBJECT_TYPE, id);

        return response.ok({
          body: {
            success: true,
          },
        });
      } catch (error) {
        if (error.output?.statusCode === 404) {
          return response.notFound({
            body: {
              message: `Connector with ID ${id} not found`,
            },
          });
        }
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to delete connector: ${error.message}`,
          },
        });
      }
    }
  );
}
