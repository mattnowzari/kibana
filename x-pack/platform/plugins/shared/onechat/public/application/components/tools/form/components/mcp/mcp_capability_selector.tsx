/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useEffect, useState } from 'react';
import {
  EuiCheckboxGroup,
  EuiButton,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiCallOut,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useController, useFormContext } from 'react-hook-form';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { McpToolFormData } from '../../types/tool_form_types';

interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface McpCapabilitySelectorProps {
  onToolsAvailableChange?: (hasTools: boolean) => void;
}

export const McpCapabilitySelector: React.FC<McpCapabilitySelectorProps> = ({
  onToolsAvailableChange,
}) => {
  const { control, trigger, watch, setValue, clearErrors, setError } = useFormContext<McpToolFormData>();
  const connectorId = watch('connector_id');

  const {
    field: { value, onChange, onBlur, name },
  } = useController({
    name: 'selected_capabilities',
    control,
  });

  const { http } = useKibana().services;
  const [availableTools, setAvailableTools] = useState<McpToolDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // Notify parent when tools availability changes and manage validation
  useEffect(() => {
    if (onToolsAvailableChange) {
      onToolsAvailableChange(availableTools.length > 0);
    }

    // Only validate after tools have been discovered (not while loading)
    if (connectorId && !isLoading) {
      if (availableTools.length === 0) {
        // No tools available - clear any validation errors
        // User can save the tool even if no tools are found
        clearErrors('selected_capabilities' as any);
      } else if (availableTools.length > 0 && (value || []).length === 0) {
        // Tools available but none selected - set validation error
        setError('selected_capabilities' as any, {
          type: 'manual',
          message: 'At least one capability must be selected',
        });
      } else if (availableTools.length > 0 && (value || []).length > 0) {
        // Tools available and some selected - clear error
        clearErrors('selected_capabilities' as any);
      }
    }
  }, [availableTools.length, connectorId, value, isLoading, onToolsAvailableChange, clearErrors, setError]);

  const discoverTools = async () => {
    if (!connectorId) {
      setDiscoveryError(i18n.translate('xpack.onechat.tools.mcp.capabilitySelector.noConnectorError', {
        defaultMessage: 'Please select an MCP connector first',
      }));
      return;
    }

    if (!http) {
      setDiscoveryError(
        i18n.translate('xpack.onechat.tools.mcp.capabilitySelector.httpError', {
          defaultMessage: 'HTTP service is not available',
        })
      );
      return;
    }

    try {
      setIsLoading(true);
      setDiscoveryError(null);
      const response = await http.post<{ status: string; data?: { tools: McpToolDefinition[] } }>(
        `/api/actions/connector/${connectorId}/_execute`,
        {
          body: JSON.stringify({
            params: {
              method: 'tools/list',
            },
          }),
        }
      );

      if (response.status === 'error') {
        throw new Error('Failed to discover tools');
      }

      const tools = (response.data as any)?.tools || [];
      setAvailableTools(tools);

      // If no tools found, clear selected capabilities and ensure no validation error
      if (tools.length === 0) {
        setValue('selected_capabilities', []);
        clearErrors('selected_capabilities' as any);
      } else {
        // Tools found - validate that at least one is selected
        // The useEffect will handle setting the error if needed
        await trigger('selected_capabilities');
      }
    } catch (err: any) {
      setDiscoveryError(
        err.message ||
          i18n.translate('xpack.onechat.tools.mcp.capabilitySelector.discoveryError', {
            defaultMessage: 'Failed to discover tools from MCP server',
          })
      );
      setAvailableTools([]);
      // Clear selected capabilities on error and clear validation error
      setValue('selected_capabilities', []);
      clearErrors('selected_capabilities' as any);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (connectorId) {
      // Reset selected capabilities when connector changes
      setValue('selected_capabilities', []);
      // Clear validation errors immediately when connector is selected
      // We'll validate after tools are discovered
      clearErrors('selected_capabilities' as any);
      discoverTools();
    } else {
      setAvailableTools([]);
      setDiscoveryError(null);
      // Clear selected capabilities when connector is cleared
      setValue('selected_capabilities', []);
      clearErrors('selected_capabilities' as any);
    }
  }, [connectorId, setValue, clearErrors]);

  const checkboxOptions = useMemo(() => {
    return availableTools.map((tool) => ({
      id: tool.name,
      label: tool.description || tool.name,
    }));
  }, [availableTools]);

  const selectedMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    (value || []).forEach((capability) => {
      map[capability] = true;
    });
    return map;
  }, [value]);

  const handleChange = async (optionId: string) => {
    const newSelected = selectedMap[optionId]
      ? (value || []).filter((c) => c !== optionId)
      : [...(value || []), optionId];
    onChange(newSelected);

    // Only validate if tools are available
    if (availableTools.length > 0) {
      await trigger(name);
    } else {
      clearErrors('selected_capabilities' as any);
    }
  };

  if (!connectorId) {
    return (
      <EuiText color="subdued" size="s">
        {i18n.translate('xpack.onechat.tools.mcp.capabilitySelector.selectConnectorFirst', {
          defaultMessage: 'Please select an MCP connector to discover available tools',
        })}
      </EuiText>
    );
  }

  return (
    <>
      <EuiButton
        onClick={discoverTools}
        isLoading={isLoading}
        iconType="refresh"
        size="s"
        data-test-subj="onechatMcpDiscoverToolsButton"
      >
        {i18n.translate('xpack.onechat.tools.mcp.capabilitySelector.discoverButton', {
          defaultMessage: 'Discover Tools',
        })}
      </EuiButton>
      <EuiSpacer size="m" />
      {discoveryError && (
        <>
          <EuiCallOut color="danger" size="s" title={discoveryError} />
          <EuiSpacer size="m" />
        </>
      )}
      {isLoading && availableTools.length === 0 ? (
        <EuiLoadingSpinner size="m" />
      ) : availableTools.length === 0 ? (
        <EuiText color="subdued" size="s">
          {i18n.translate('xpack.onechat.tools.mcp.capabilitySelector.noToolsFound', {
            defaultMessage: 'No tools found. Click "Discover Tools" to refresh.',
          })}
        </EuiText>
      ) : (
        <EuiCheckboxGroup
          options={checkboxOptions}
          idToSelectedMap={selectedMap}
          onChange={handleChange}
          onBlur={onBlur}
          legend={{
            children: i18n.translate('xpack.onechat.tools.mcp.capabilitySelector.legend', {
              defaultMessage: 'Select MCP capabilities to import',
            }),
          }}
          data-test-subj="onechatMcpCapabilitySelector"
        />
      )}
    </>
  );
};

