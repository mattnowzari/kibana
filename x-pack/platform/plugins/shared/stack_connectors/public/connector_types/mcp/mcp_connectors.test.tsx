/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { mountWithIntl, nextTick } from '@kbn/test-jest-helpers';
import { act, render } from '@testing-library/react';
import McpActionConnectorFields from './mcp_connectors';
import { ConnectorFormTestProvider } from '../lib/test_utils';
import userEvent from '@testing-library/user-event';

jest.mock('@kbn/triggers-actions-ui-plugin/public/common/lib/kibana');

describe('McpActionConnectorFields renders', () => {
  test('all connector fields is rendered', async () => {
    const actionConnector = {
      config: {
        url: 'http://test-mcp-server.com',
      },
      secrets: {
        apiKey: 'test-api-key',
      },
      id: 'test',
      actionTypeId: '.mcp',
      name: 'mcp',
      isDeprecated: false,
    };

    const wrapper = mountWithIntl(
      <ConnectorFormTestProvider connector={actionConnector}>
        <McpActionConnectorFields readOnly={false} isEdit={false} registerPreSubmitValidator={() => {}} />
      </ConnectorFormTestProvider>
    );

    await act(async () => {
      await nextTick();
      wrapper.update();
    });

    expect(wrapper.find('[data-test-subj="mcpUrlText"]').length > 0).toBeTruthy();
    expect(wrapper.find('[data-test-subj="mcpUrlText"]').first().prop('value')).toBe(
      'http://test-mcp-server.com'
    );
    expect(wrapper.find('[data-test-subj="mcpApiKeyText"]').length > 0).toBeTruthy();
  });

  describe('Validation', () => {
    const onSubmit = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('connector validation succeeds when connector config is valid', async () => {
      const actionConnector = {
        config: {
          url: 'http://test-mcp-server.com',
        },
        secrets: {
          apiKey: 'test-api-key',
        },
        id: 'test',
        actionTypeId: '.mcp',
        name: 'mcp',
        isDeprecated: false,
      };

      const { getByTestId } = render(
        <ConnectorFormTestProvider connector={actionConnector} onSubmit={onSubmit}>
          <McpActionConnectorFields
            readOnly={false}
            isEdit={false}
            registerPreSubmitValidator={() => {}}
          />
        </ConnectorFormTestProvider>
      );

      await act(async () => {
        await userEvent.click(getByTestId('form-test-provide-submit'));
      });

      expect(onSubmit).toBeCalledWith({
        data: {
          config: {
            url: 'http://test-mcp-server.com',
          },
          secrets: {
            apiKey: 'test-api-key',
          },
          id: 'test',
          actionTypeId: '.mcp',
          name: 'mcp',
          isDeprecated: false,
        },
        isValid: true,
      });
    });

    it('validates the URL field correctly', async () => {
      const actionConnector = {
        config: {
          url: 'http://test-mcp-server.com',
        },
        secrets: {
          apiKey: 'test-api-key',
        },
        id: 'test',
        actionTypeId: '.mcp',
        name: 'mcp',
        isDeprecated: false,
      };

      const { getByTestId } = render(
        <ConnectorFormTestProvider connector={actionConnector} onSubmit={onSubmit}>
          <McpActionConnectorFields
            readOnly={false}
            isEdit={false}
            registerPreSubmitValidator={() => {}}
          />
        </ConnectorFormTestProvider>
      );

      await userEvent.clear(getByTestId('mcpUrlText'));
      await userEvent.type(getByTestId('mcpUrlText'), 'not-a-valid-url', {
        delay: 10,
      });

      await userEvent.click(getByTestId('form-test-provide-submit'));

      expect(onSubmit).toHaveBeenCalledWith({ data: {}, isValid: false });
    });

    it('allows empty API key (optional field)', async () => {
      const actionConnector = {
        config: {
          url: 'http://test-mcp-server.com',
        },
        secrets: {},
        id: 'test',
        actionTypeId: '.mcp',
        name: 'mcp',
        isDeprecated: false,
      };

      const { getByTestId } = render(
        <ConnectorFormTestProvider connector={actionConnector} onSubmit={onSubmit}>
          <McpActionConnectorFields
            readOnly={false}
            isEdit={false}
            registerPreSubmitValidator={() => {}}
          />
        </ConnectorFormTestProvider>
      );

      await act(async () => {
        await userEvent.click(getByTestId('form-test-provide-submit'));
      });

      expect(onSubmit).toBeCalledWith({
        data: {
          config: {
            url: 'http://test-mcp-server.com',
          },
          secrets: {},
          id: 'test',
          actionTypeId: '.mcp',
          name: 'mcp',
          isDeprecated: false,
        },
        isValid: true,
      });
    });
  });
});

