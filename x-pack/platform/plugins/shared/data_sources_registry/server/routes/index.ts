/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { IRouter } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import type { DataCatalog } from '../data_catalog';

export function registerRoutes(router: IRouter, dataCatalog: DataCatalog) {
  // GET /api/data_sources_registry/types
  router.get(
    {
      path: '/api/data_sources_registry/types',
      validate: {},
      security: {
        authz: {
          enabled: false,
          reason: 'Not needed right now',
        },
      },
    },
    async (context, request, response) => {
      const types = dataCatalog.list();
      return response.ok({ body: types });
    }
  );

  // GET /api/data_sources_registry/types/{id}
  router.get(
    {
      path: '/api/data_sources_registry/types/{id}',
      validate: {
        params: schema.object({
          id: schema.string(),
        }),
      },
      security: {
        authz: {
          enabled: false,
          reason: 'Not needed right now',
        },
      },
    },
    async (context, request, response) => {
      try {
        const type = dataCatalog.get(request.params.id);
        if (!type) {
          return response.notFound({ body: `Type ${request.params.id} not found` });
        }
        const workflowInfos = type.generateWorkflows();
        const workflows = workflowInfos.map((workflowInfo) => ({
          content: workflowInfo.getContent('<fake-stack-connector-id>'),
          shouldGenerateABTool: workflowInfo.shouldGenerateABTool,
        }));
        return response.ok({
          body: {
            ...type,
            workflows,
          },
        });
      } catch (err) {
        return response.notFound({ body: err.message });
      }
    }
  );
}
