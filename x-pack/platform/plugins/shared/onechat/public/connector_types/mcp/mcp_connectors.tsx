/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { UseField } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { Field } from '@kbn/es-ui-shared-plugin/static/forms/components';
import { fieldValidators } from '@kbn/es-ui-shared-plugin/static/forms/helpers';
import type { ActionConnectorFieldsProps } from '@kbn/triggers-actions-ui-plugin/public';
import * as i18n from './translations';

const { urlField } = fieldValidators;

const McpActionConnectorFields: React.FunctionComponent<ActionConnectorFieldsProps> = ({
  readOnly,
}) => {
  return (
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
        },
      }}
    />
  );
};

// eslint-disable-next-line import/no-default-export
export { McpActionConnectorFields as default };
