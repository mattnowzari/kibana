/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import type { ActionParamsProps } from '@kbn/triggers-actions-ui-plugin/public';
import { SelectField } from '@kbn/es-ui-shared-plugin/static/forms/components';
import { UseField } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { fieldValidators } from '@kbn/es-ui-shared-plugin/static/forms/helpers';
import { JsonEditorWithMessageVariables } from '@kbn/triggers-actions-ui-plugin/public';
import type { ActionParamsType } from '@kbn/connector-schemas/mcp';
import * as i18nTranslations from './translations';

const { emptyField } = fieldValidators;

const MCP_METHODS = [
  { value: 'initialize', text: 'Initialize' },
  { value: 'tools/list', text: 'List Tools' },
  { value: 'tools/call', text: 'Call Tool' },
];

const McpParamsFields: React.FunctionComponent<ActionParamsProps<ActionParamsType>> = ({
  actionParams,
  editAction,
  index,
  messageVariables,
  errors,
}) => {
  const { method, params } = actionParams;

  return (
    <>
      <UseField
        path={`params.${index}.method`}
        component={SelectField}
        config={{
          label: i18nTranslations.METHOD_LABEL,
          defaultValue: 'tools/list',
          validations: [
            {
              validator: emptyField(i18nTranslations.METHOD_REQUIRED),
            },
          ],
        }}
        componentProps={{
          euiFieldProps: {
            'data-test-subj': 'mcpMethodSelect',
            options: MCP_METHODS,
            fullWidth: true,
            value: method || 'tools/list',
            onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
              editAction('method', e.target.value, index);
            },
          },
        }}
      />
      <JsonEditorWithMessageVariables
        messageVariables={messageVariables}
        paramsProperty={'params'}
        inputTargetValue={params ? JSON.stringify(params, null, 2) : ''}
        label={i18nTranslations.PARAMS_LABEL}
        ariaLabel={i18n.translate('xpack.stackConnectors.components.mcp.paramsCodeEditorAriaLabel', {
          defaultMessage: 'Parameters code editor',
        })}
        errors={errors.params as string[]}
        onDocumentsChange={(json: string) => {
          try {
            const parsed = JSON.parse(json);
            editAction('params', parsed, index);
          } catch {
            // Invalid JSON, will be caught by validation
            editAction('params', json, index);
          }
        }}
        onBlur={() => {
          if (!params) {
            editAction('params', {}, index);
          }
        }}
        dataTestSubj="mcpParamsJsonEditor"
      />
    </>
  );
};

// eslint-disable-next-line import/no-default-export
export { McpParamsFields as default };

