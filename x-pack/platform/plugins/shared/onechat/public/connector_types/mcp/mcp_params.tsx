/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useCallback } from 'react';
import { i18n } from '@kbn/i18n';
import type { ActionParamsProps } from '@kbn/triggers-actions-ui-plugin/public';
import { JsonEditorWithMessageVariables } from '@kbn/triggers-actions-ui-plugin/public';
import { EuiFormRow, EuiFieldText } from '@elastic/eui';
import * as i18nTranslations from './translations';

interface McpActionParams {
  subAction: string;
  subActionParams: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

const McpParamsFields: React.FunctionComponent<ActionParamsProps<McpActionParams>> = ({
  actionParams,
  editAction,
  index,
  messageVariables,
  errors,
}) => {
  const { subAction, subActionParams } = actionParams;

  useEffect(() => {
    if (!subAction) {
      editAction('subAction', 'callTool', index);
    }
  }, [editAction, index, subAction]);

  useEffect(() => {
    if (!subActionParams) {
      editAction('subActionParams', { name: '', arguments: {} }, index);
    }
  }, [editAction, index, subActionParams]);

  const editSubActionParams = useCallback(
    (params: Partial<McpActionParams['subActionParams']>) => {
      const next = { ...(subActionParams || {}), ...params } as unknown as any;
      editAction('subActionParams', next, index);
    },
    [editAction, index, subActionParams]
  );

  useEffect(() => {
    if (subAction !== 'callTool') {
      editAction('subAction', 'callTool', index);
    }
  }, [editAction, index, subAction]);

  const { name, arguments: toolArguments } = subActionParams || {};
  const subActionParamsErrors = errors.subActionParams as
    | { name?: string[]; arguments?: string[] }
    | undefined;

  return (
    <>
      <EuiFormRow
        fullWidth
        label={i18nTranslations.TOOL_NAME_LABEL}
        isInvalid={Boolean(subActionParamsErrors?.name)}
        error={subActionParamsErrors?.name}
        helpText={i18nTranslations.TOOL_NAME_HELP_TEXT}
      >
        <EuiFieldText
          fullWidth
          data-test-subj="mcpToolNameInput"
          isInvalid={Boolean(subActionParamsErrors?.name)}
          value={name || ''}
          onChange={(e) => {
            editSubActionParams({ name: e.target.value });
          }}
          placeholder={i18nTranslations.TOOL_NAME_PLACEHOLDER}
        />
      </EuiFormRow>
      <JsonEditorWithMessageVariables
        messageVariables={messageVariables}
        paramsProperty={'arguments'}
        inputTargetValue={toolArguments ? JSON.stringify(toolArguments, null, 2) : '{}'}
        label={i18nTranslations.TOOL_ARGUMENTS_LABEL}
        ariaLabel={i18n.translate(
          'xpack.stackConnectors.components.mcp.toolArgumentsCodeEditorAriaLabel',
          {
            defaultMessage: 'Tool arguments code editor',
          }
        )}
        errors={subActionParamsErrors?.arguments}
        onDocumentsChange={(json: string) => {
          try {
            const parsed = JSON.parse(json);
            editSubActionParams({ arguments: parsed });
          } catch {
            editSubActionParams({
              arguments: json as unknown as Record<string, unknown>,
            });
          }
        }}
        onBlur={() => {
          if (!toolArguments) {
            editSubActionParams({ arguments: {} });
          }
        }}
        dataTestSubj="mcpToolArgumentsJsonEditor"
      />
    </>
  );
};

// eslint-disable-next-line import/no-default-export
export { McpParamsFields as default };
