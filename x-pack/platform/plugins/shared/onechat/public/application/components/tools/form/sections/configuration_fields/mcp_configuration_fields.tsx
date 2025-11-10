/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { EuiFormRow, EuiSpacer } from '@elastic/eui';
import { useFormContext } from 'react-hook-form';
import { McpConnectorPicker } from '../../components/mcp/mcp_connector_picker';
import { McpCapabilitySelector } from '../../components/mcp/mcp_capability_selector';
import type { McpToolFormData } from '../../types/tool_form_types';
import { i18nMessages } from '../../i18n';

export const McpConfiguration = () => {
  const {
    formState: { errors },
  } = useFormContext<McpToolFormData>();
  const [hasToolsAvailable, setHasToolsAvailable] = useState(false);

  // Only show validation error if tools are available but none are selected
  const shouldShowCapabilityError =
    hasToolsAvailable && !!errors.selected_capabilities;

  return (
    <>
      <EuiFormRow
        label={i18nMessages.configuration.form.mcp.connectorLabel}
        isInvalid={!!errors.connector_id}
        error={errors.connector_id?.message}
      >
        <McpConnectorPicker />
      </EuiFormRow>
      <EuiSpacer size="m" />
      <EuiFormRow
        label={i18nMessages.configuration.form.mcp.capabilitiesLabel}
        isInvalid={shouldShowCapabilityError}
        error={shouldShowCapabilityError ? errors.selected_capabilities?.message : undefined}
        helpText={i18nMessages.configuration.form.mcp.capabilitiesHelpText}
      >
        <McpCapabilitySelector onToolsAvailableChange={setHasToolsAvailable} />
      </EuiFormRow>
    </>
  );
};

