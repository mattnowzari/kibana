/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useEffect, useState } from 'react';
import { EuiComboBox, type EuiComboBoxOptionOption } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useController, useFormContext } from 'react-hook-form';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { ActionConnector } from '@kbn/triggers-actions-ui-plugin/public';
import type { McpToolFormData } from '../../types/tool_form_types';
import { loadAllActions } from '@kbn/triggers-actions-ui-plugin/public/common/constants';

export const McpConnectorPicker: React.FC = () => {
  const { control, trigger, clearErrors } = useFormContext<McpToolFormData>();
  const {
    field: { value, onChange, onBlur, name },
    fieldState,
  } = useController({
    name: 'connector_id',
    control,
  });

  const { http } = useKibana().services;
  const [connectors, setConnectors] = useState<ActionConnector[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!http) {
      return;
    }

    const fetchConnectors = async () => {
      try {
        setIsLoading(true);
        // Use the same function that other components use to fetch connectors
        // This properly handles the API response transformation
        const allConnectors = await loadAllActions({ http, includeSystemActions: true });

        // Filter to only MCP connectors
        const mcpConnectors = allConnectors.filter(
          (connector) => connector.actionTypeId === '.mcp'
        );

        setConnectors(mcpConnectors);
      } catch (error: any) {
        setConnectors([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConnectors();
  }, [http]);

  const options: Array<EuiComboBoxOptionOption<string>> = useMemo(() => {
    return connectors.map((connector) => ({
      label: connector.name,
      value: connector.id,
    }));
  }, [connectors]);

  const selectedOptions: Array<EuiComboBoxOptionOption<string>> = useMemo(() => {
    if (!value || typeof value !== 'string') return [];
    const selectedConnector = connectors.find((c) => c.id === value);
    if (!selectedConnector) return [];
    return [
      {
        label: selectedConnector.name,
        value: selectedConnector.id,
      },
    ];
  }, [value, connectors]);

  const handleSelectionChange = async (
    newSelectedOptions: Array<EuiComboBoxOptionOption<string>>
  ) => {
    const selectedConnectorId = newSelectedOptions.length > 0 && newSelectedOptions[0].value
      ? String(newSelectedOptions[0].value)
      : '';
    onChange(selectedConnectorId);
    // Clear capability validation errors when a connector is selected
    // The capability selector will handle validation after tools are discovered
    clearErrors('selected_capabilities' as any);
    await trigger(name);
  };

  return (
    <EuiComboBox
      placeholder={i18n.translate('xpack.onechat.tools.mcp.connectorPicker.placeholder', {
        defaultMessage: 'Select an MCP connector',
      })}
      options={options}
      selectedOptions={selectedOptions}
      onChange={handleSelectionChange}
      onBlur={onBlur}
      singleSelection={{ asPlainText: false }}
      isLoading={isLoading}
      isInvalid={fieldState.invalid}
      data-test-subj="onechatMcpConnectorPicker"
      aria-label={i18n.translate('xpack.onechat.tools.mcp.connectorPicker.ariaLabel', {
        defaultMessage: 'MCP connector selection',
      })}
    />
  );
};

