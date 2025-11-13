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
  EuiBasicTable,
  EuiFieldSearch,
  EuiSwitch,
  EuiLoadingSpinner,
  EuiCallOut,
  EuiText,
  EuiFormRow,
} from '@elastic/eui';
import {
  UseField,
  useFormContext,
  FIELD_TYPES,
} from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [tableMaxHeight, setTableMaxHeight] = useState<number>(360);
  const tableContainerRef = React.useRef<HTMLDivElement | null>(null);

  // Initialize selectedToolIds from form data
  useEffect(() => {
    const currentSelectedTools =
      ((getFormData() as unknown as { config?: { selected_tools?: string[] } })?.config
        ?.selected_tools as string[]) || [];
    const createdToolIds =
      ((getFormData() as unknown as { config?: { created_tool_ids?: string[] } })?.config
        ?.created_tool_ids as string[]) || [];
    const createdToolNames = createdToolIds
      .map((id) => {
        const parts = id.split('.');
        return parts[parts.length - 1];
      })
      .filter(Boolean);
    const initial: Record<string, boolean> = {};
    [...currentSelectedTools, ...createdToolNames].forEach((toolName) => {
      initial[toolName] = true;
    });
    setSelectedToolIds(initial);
  }, [getFormData]);

  // After tools are discovered, reconcile selection with saved config (selected_tools + created_tool_ids)
  useEffect(() => {
    if (!isConnected || availableTools.length === 0) return;

    const toolNames = new Set(availableTools.map((t) => t.name));
    const currentSelectedTools =
      ((getFormData() as unknown as { config?: { selected_tools?: string[] } })?.config
        ?.selected_tools as string[]) || [];
    const createdToolIds =
      ((getFormData() as unknown as { config?: { created_tool_ids?: string[] } })?.config
        ?.created_tool_ids as string[]) || [];
    const createdToolNames = createdToolIds
      .map((id) => {
        const parts = id.split('.');
        return parts[parts.length - 1];
      })
      .filter(Boolean);
    const merged = [...currentSelectedTools, ...createdToolNames].filter((n) => toolNames.has(n));
    if (merged.length > 0) {
      const next: Record<string, boolean> = {};
      merged.forEach((name) => (next[name] = true));
      setSelectedToolIds(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, availableTools.length]);

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

  // Auto-connect when editing and URL is present
  useEffect(() => {
    const formUrl =
      ((getFormData() as unknown as { config?: { url?: string } })?.config?.url as
        | string
        | undefined) ?? '';
    if (isEdit && formUrl && !isConnected && !isConnecting) {
      handleConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, getFormData, isConnected, isConnecting]);

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

  const getFirstSentence = (text?: string) => {
    if (!text) return '';
    const match = text.match(/[^.?!]*[.?!]/);
    return match ? match[0].trim() : text.trim();
  };

  const filteredTools = availableTools.filter((tool) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const nameMatches = tool.name.toLowerCase().includes(q);
    const descriptionMatches = (tool.description ?? '').toLowerCase().includes(q);
    return nameMatches || descriptionMatches;
  });

  const sortedTools = filteredTools.slice().sort((a, b) => {
    const aActive = !!selectedToolIds[a.name];
    const bActive = !!selectedToolIds[b.name];
    if (aActive !== bActive) {
      // Active tools always first
      return aActive ? -1 : 1;
    }
    // Within each group, sort by name asc/desc
    const compare = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    return sortDirection === 'asc' ? compare : -compare;
  });

  const columns = [
    {
      field: 'name',
      name: i18n.TOOL_COLUMN_LABEL,
      sortable: true,
      render: (_: string, tool: McpTool) => (
        <div>
          <EuiText size="s" style={{ fontWeight: 'bold' }}>
            {tool.name}
          </EuiText>
          {tool.description ? (
            <EuiText size="xs" color="subdued">
              {getFirstSentence(tool.description)}
            </EuiText>
          ) : null}
        </div>
      ),
    },
    {
      name: i18n.ACTIVE_COLUMN_LABEL,
      align: 'right' as const,
      width: '96px',
      render: (tool: McpTool) => (
        <EuiSwitch
          checked={!!selectedToolIds[tool.name]}
          onChange={() => handleToolSelectionChange(tool.name)}
          disabled={readOnly}
          data-test-subj={`mcpToolToggle-${tool.name}`}
          label=""
          showLabel={false}
          compressed
        />
      ),
    },
  ];

  // Dynamically size the tools table to avoid making the flyout scroll while keeping action buttons visible
  const recalculateTableMaxHeight = useCallback(() => {
    const container = tableContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    // Reserve space for bottom buttons and padding
    const reservedBottomSpacePx = 160;
    const available = window.innerHeight - rect.top - reservedBottomSpacePx;
    const clamped = Math.max(220, available);
    setTableMaxHeight(clamped);
  }, []);

  useEffect(() => {
    recalculateTableMaxHeight();
    window.addEventListener('resize', recalculateTableMaxHeight);
    return () => {
      window.removeEventListener('resize', recalculateTableMaxHeight);
    };
  }, [recalculateTableMaxHeight, isConnected, availableTools.length]);

  useEffect(() => {
    // Recalculate after the next paint to account for layout shifts when tools arrive
    requestAnimationFrame(() => recalculateTableMaxHeight());
  }, [recalculateTableMaxHeight, isConnected, availableTools.length]);

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
                color={isConnected ? 'success' : undefined}
                iconType={isConnected ? 'checkCircle' : undefined}
              >
                {isConnecting ? i18n.CONNECTING : isConnected ? i18n.CONNECTED : i18n.CONNECT}
              </EuiButton>
            ),
          },
        }}
      />
      <EuiSpacer size="m" />

      {/* Show currently active MCP tools if any were created previously */}
      {isEdit && (
        <>
          {(() => {
            const createdToolIds =
              ((getFormData() as unknown as { config?: { created_tool_ids?: string[] } })?.config
                ?.created_tool_ids as string[]) || [];
            const createdToolNames = createdToolIds
              .map((id) => {
                const parts = id.split('.');
                return parts[parts.length - 1];
              })
              .filter(Boolean);
            if (createdToolNames.length === 0) return null;
            return (
              <>
                <EuiText size="s" color="subdued">
                  {i18n.ACTIVE_TOOLS_LABEL}
                </EuiText>
                <EuiSpacer size="xs" />
                <EuiText size="s">{createdToolNames.sort().join(', ')}</EuiText>
                <EuiSpacer size="m" />
              </>
            );
          })()}
        </>
      )}

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

      {/* Selection label should match form field label styling and appear only once */}
      {!isConnected && (
        <EuiFormRow label={i18n.SELECT_TOOLS_LABEL}>
          <EuiText size="xs" color="subdued">
            {i18n.CONNECT_TO_SELECT_TOOLS_HELP}
          </EuiText>
        </EuiFormRow>
      )}

      {isConnected && availableTools.length > 0 && (
        <>
          <UseField
            path="config.selected_tools"
            config={{
              // Hidden field for storing selection + validations; no label to avoid duplicate
              label: '',
              type: FIELD_TYPES.HIDDEN,
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
          <EuiFormRow label={i18n.SELECT_TOOLS_LABEL}>
            <EuiFieldSearch
              fullWidth
              data-test-subj="mcpToolsSearch"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              isClearable
              incremental
              placeholder={i18n.SEARCH_TOOLS_PLACEHOLDER}
            />
          </EuiFormRow>
          <EuiSpacer size="xs" />
          <div ref={tableContainerRef} style={{ maxHeight: tableMaxHeight, overflowY: 'auto' }}>
            <EuiBasicTable
              data-test-subj="mcpToolsTable"
              items={sortedTools}
              itemId="name"
              columns={columns}
              sorting={{
                sort: { field: 'name', direction: sortDirection },
              }}
              onChange={({ sort }: any) => {
                if (sort?.direction === 'asc' || sort?.direction === 'desc') {
                  setSortDirection(sort.direction);
                }
              }}
              noItemsMessage={
                <EuiText size="s" color="subdued">
                  {i18n.NO_TOOLS_FOUND_MESSAGE}
                </EuiText>
              }
              tableLayout="auto"
              responsive
              compressed
            />
          </div>
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
