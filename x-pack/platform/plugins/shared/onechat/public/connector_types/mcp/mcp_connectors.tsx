/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useCallback, useEffect } from 'react';

import {
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiCheckboxGroup,
  EuiLoadingSpinner,
  EuiCallOut,
  EuiText,
} from '@elastic/eui';
import { UseField, useFormContext } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { Field } from '@kbn/es-ui-shared-plugin/static/forms/components';
import { fieldValidators } from '@kbn/es-ui-shared-plugin/static/forms/helpers';
import type { ActionConnectorFieldsProps } from '@kbn/triggers-actions-ui-plugin/public';
import { useKibana } from '@kbn/kibana-react-plugin/public';

import * as i18n from './translations';

const { urlField } = fieldValidators;

interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

const McpActionConnectorFields: React.FunctionComponent<ActionConnectorFieldsProps> = ({
  readOnly,
  isEdit,
  registerPreSubmitValidator,
}) => {
  const { http } = useKibana().services;
  const { getFormData, setFieldValue } = useFormContext();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [availableTools, setAvailableTools] = useState<McpTool[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [selectedToolIds, setSelectedToolIds] = useState<Record<string, boolean>>({});

  // Initialize selectedToolIds from form data
  useEffect(() => {
    const currentSelectedTools =
      ((getFormData() as unknown as { config?: { selected_tools?: string[] } })?.config
        ?.selected_tools as string[]) || [];
    const initial: Record<string, boolean> = {};
    currentSelectedTools.forEach((toolName) => {
      initial[toolName] = true;
    });
    setSelectedToolIds(initial);
  }, [getFormData]);

  // Update form when selection changes
  useEffect(() => {
    const selected = Object.entries(selectedToolIds)
      .filter(([_, isSelected]) => isSelected)
      .map(([toolName]) => toolName);
    setFieldValue('config.selected_tools', selected);
  }, [selectedToolIds, setFieldValue]);

  // Register pre-submit validator
  useEffect(() => {
    if (registerPreSubmitValidator) {
      registerPreSubmitValidator(async () => {
        const selected = Object.values(selectedToolIds).some((v) => v);
        if (!selected) {
          return {
            message: i18n.SELECT_TOOLS_REQUIRED,
          };
        }
      });
    }
  }, [registerPreSubmitValidator, selectedToolIds]);

  const handleConnect = useCallback(async () => {
    const formUrl =
      ((getFormData() as unknown as { config?: { url?: string } })?.config?.url as
        | string
        | undefined) ?? '';
    if (!formUrl) {
      setConnectionError(i18n.URL_REQUIRED_FOR_CONNECT);
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);
    setIsConnected(false);

    try {
      const response = await http!.post<{ tools: McpTool[] }>(
        '/internal/agent_builder/mcp/_discover',
        {
          body: JSON.stringify({ url: formUrl }),
        }
      );

      setAvailableTools(response.tools || []);
      setIsConnected(true);
      setIsConnecting(false);

      if (!response.tools || response.tools.length === 0) {
        setSelectedToolIds({});
      }
    } catch (error: any) {
      setIsConnecting(false);
      setIsConnected(false);
      const message = error.body?.error || error.message || i18n.CONNECT_ERROR_DEFAULT;
      setConnectionError(message);
    }
  }, [getFormData, http]);

  const handleToolSelectionChange = useCallback((toolId: string) => {
    setSelectedToolIds((prev) => ({
      ...prev,
      [toolId]: !prev[toolId],
    }));
  }, []);

  const checkboxOptions = availableTools.map((tool) => ({
    id: tool.name,
    label: (
      <div>
        <EuiText size="s" style={{ fontWeight: 'bold' }}>
          {tool.name}
        </EuiText>
        {tool.description && (
          <EuiText size="xs" color="subdued">
            {tool.description}
          </EuiText>
        )}
      </div>
    ),
  }));

  return (
    <>
      <UseField
        path="config.url"
        config={{
          label: i18n.URL_LABEL,
          validations: [
            {
              validator: urlField(i18n.URL_INVALID),
            },
          ],
        }}
        component={Field}
        componentProps={{
          euiFieldProps: {
            readOnly,
            'data-test-subj': 'mcpUrlText',
            fullWidth: true,
            append: (
              <EuiButton
                onClick={handleConnect}
                isLoading={isConnecting}
                isDisabled={
                  readOnly ||
                  isConnecting ||
                  !((getFormData() as unknown as { config?: { url?: string } })?.config?.url ?? '')
                }
                size="s"
                data-test-subj="mcpConnectButton"
              >
                {isConnecting ? i18n.CONNECTING : isConnected ? i18n.CONNECTED : i18n.CONNECT}
              </EuiButton>
            ),
          },
        }}
      />
      <EuiSpacer size="m" />

      {connectionError && (
        <>
          <EuiCallOut
            announceOnMount
            title={i18n.CONNECT_ERROR_TITLE}
            color="danger"
            iconType="error"
            data-test-subj="mcpConnectError"
          >
            <p>{connectionError}</p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      {isConnecting && (
        <>
          <EuiFlexGroup justifyContent="center">
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="m" />
              <EuiSpacer size="s" />
              <EuiText size="s" color="subdued">
                {i18n.CONNECTING_TOOLS}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="m" />
        </>
      )}

      {isConnected && availableTools.length > 0 && (
        <>
          <EuiText size="s" color="subdued">
            {i18n.TOOLS_FOUND(availableTools.length)}
          </EuiText>
          <EuiSpacer size="s" />
          <UseField
            path="config.selected_tools"
            config={{
              label: i18n.SELECT_TOOLS_LABEL,
              validations: [
                {
                  validator: ({ value }) => {
                    if (!value || (Array.isArray(value) && value.length === 0)) {
                      return { message: i18n.SELECT_TOOLS_REQUIRED };
                    }
                  },
                },
              ],
            }}
            component={Field}
            componentProps={{
              euiFieldProps: {
                style: { display: 'none' },
              },
            }}
          />
          <EuiCheckboxGroup
            options={checkboxOptions}
            idToSelectedMap={selectedToolIds}
            onChange={handleToolSelectionChange}
            disabled={readOnly}
            data-test-subj="mcpToolsCheckboxGroup"
          />
        </>
      )}

      {isConnected && availableTools.length === 0 && (
        <>
          <EuiCallOut
            announceOnMount
            title={i18n.NO_TOOLS_FOUND_TITLE}
            color="warning"
            iconType="warning"
            data-test-subj="mcpNoToolsFound"
          >
            <p>{i18n.NO_TOOLS_FOUND_MESSAGE}</p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}
    </>
  );
};

// eslint-disable-next-line import/no-default-export
export { McpActionConnectorFields as default };
