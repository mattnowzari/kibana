/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useEffect } from 'react';
import { EuiSelect, EuiFormRow } from '@elastic/eui';
import type { ActionParamsProps } from '@kbn/alerts-ui-shared';
import { SUB_ACTION } from '../../../common/github/constants';
import type { GitHubExecuteActionParams } from './types';

const GitHubParamsFields: React.FunctionComponent<ActionParamsProps<GitHubExecuteActionParams>> = ({
  actionConnector,
  actionParams,
  editAction,
  index,
  executionMode,
  errors,
}) => {
  const { subAction, subActionParams } = actionParams;

  // Set default subAction to LIST_REPOSITORIES
  useEffect(() => {
    if (!subAction) {
      editAction('subAction', SUB_ACTION.LIST_REPOSITORIES, index);
    }
  }, [editAction, index, subAction]);

  return (
    <>
      <EuiFormRow
        fullWidth
        label="Repository Type"
        helpText="Filter repositories by type"
        error={errors['subActionParams.type'] as string[]}
        isInvalid={errors['subActionParams.type']?.length > 0}
      >
        <EuiSelect
          fullWidth
          name="type"
          value={subActionParams?.type || 'all'}
          options={[
            { value: 'all', text: 'All' },
            { value: 'owner', text: 'Owner' },
            { value: 'member', text: 'Member' },
          ]}
          onChange={(e) => {
            editAction(
              'subActionParams',
              { ...subActionParams, type: e.target.value as 'all' | 'owner' | 'member' },
              index
            );
          }}
          data-test-subj="github-typeInput"
        />
      </EuiFormRow>
    </>
  );
};

// eslint-disable-next-line import/no-default-export
export { GitHubParamsFields as default };

