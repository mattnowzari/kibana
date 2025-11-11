/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect } from 'react';
import { i18n } from '@kbn/i18n';
import type { ActionParamsProps } from '@kbn/triggers-actions-ui-plugin/public';
import { EuiFormRow, EuiSelect } from '@elastic/eui';
import { JsonEditorWithMessageVariables } from '@kbn/triggers-actions-ui-plugin/public';
import type { ActionParamsType } from '@kbn/connector-schemas/mcp';
import * as i18nTranslations from './translations';

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

  // Ensure a default method is selected if none provided
  useEffect(() => {
    if (!method) {
      editAction('method', 'tools/list', index);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  return (
    <>
      <EuiFormRow
        fullWidth
        label={i18nTranslations.METHOD_LABEL}
        isInvalid={Boolean(errors.method && errors.method.length)}
        error={errors.method as string[]}
      >
        <EuiSelect
          fullWidth
          data-test-subj="mcpMethodSelect"
          options={MCP_METHODS}
          isInvalid={Boolean(errors.method && errors.method.length)}
          value={method ?? 'tools/list'}
          onChange={(e) => {
            editAction('method', e.target.value, index);
          }}
        />
      </EuiFormRow>
      <JsonEditorWithMessageVariables
        messageVariables={messageVariables}
        paramsProperty={'params'}
        inputTargetValue={params ? JSON.stringify(params, null, 2) : ''}
        label={i18nTranslations.PARAMS_LABEL}
        ariaLabel={i18n.translate(
          'xpack.stackConnectors.components.mcp.paramsCodeEditorAriaLabel',
          {
            defaultMessage: 'Parameters code editor',
          }
        )}
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
