/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { mountWithIntl } from '@kbn/test-jest-helpers';
import McpParamsFields from './mcp_params';
import type { ActionParamsType } from '@kbn/connector-schemas/mcp';

describe('McpParamsFields renders', () => {
  test('all params fields is rendered', () => {
    const actionParams: Partial<ActionParamsType> = {
      method: 'tools/list',
      params: {},
    };

    const wrapper = mountWithIntl(
      <McpParamsFields
        actionParams={actionParams}
        errors={{ method: [], params: [] }}
        editAction={() => {}}
        index={0}
        messageVariables={[]}
      />
    );
    expect(wrapper.find('[data-test-subj="mcpMethodSelect"]').length > 0).toBeTruthy();
    expect(wrapper.find('[data-test-subj="mcpMethodSelect"]').first().prop('value')).toStrictEqual(
      'tools/list'
    );
    expect(wrapper.find('[data-test-subj="mcpParamsJsonEditor"]').length > 0).toBeTruthy();
  });

  test('method field updates correctly', () => {
    const actionParams: Partial<ActionParamsType> = {
      method: 'tools/list',
      params: {},
    };

    const editAction = jest.fn();
    const wrapper = mountWithIntl(
      <McpParamsFields
        actionParams={actionParams}
        errors={{ method: [], params: [] }}
        editAction={editAction}
        index={0}
        messageVariables={[]}
      />
    );

    const select = wrapper.find('[data-test-subj="mcpMethodSelect"]').first();
    select.simulate('change', { target: { value: 'tools/call' } });

    expect(editAction).toHaveBeenCalledWith('method', 'tools/call', 0);
  });

  test('params field updates correctly with valid JSON', () => {
    const actionParams: Partial<ActionParamsType> = {
      method: 'tools/call',
      params: {},
    };

    const editAction = jest.fn();
    const wrapper = mountWithIntl(
      <McpParamsFields
        actionParams={actionParams}
        errors={{ method: [], params: [] }}
        editAction={editAction}
        index={0}
        messageVariables={[]}
      />
    );

    const jsonEditor = wrapper.find('[data-test-subj="mcpParamsJsonEditor"]').first();
    const validJson = '{"name": "test-tool", "arguments": {"key": "value"}}';
    const onDocumentsChange = jsonEditor.prop('onDocumentsChange') as (json: string) => void;
    onDocumentsChange(validJson);

    expect(editAction).toHaveBeenCalledWith('params', { name: 'test-tool', arguments: { key: 'value' } }, 0);
  });
});

