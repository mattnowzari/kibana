/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useCallback } from 'react';
import { EuiButton, EuiCallOut, EuiSpacer, EuiFormRow, EuiText } from '@elastic/eui';
import { useFormContext } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import type {
  ActionConnectorFieldsProps,
  ConfigFieldSchema,
  SecretsFieldSchema,
} from '@kbn/triggers-actions-ui-plugin/public';
import { SimpleConnectorForm, useKibana } from '@kbn/triggers-actions-ui-plugin/public';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiLink } from '@elastic/eui';
import { DEFAULT_GITHUB_URL } from '../../../common/github/constants';
import * as i18n from './translations';

const configFormSchema: ConfigFieldSchema[] = [
  {
    id: 'apiUrl',
    label: i18n.URL_LABEL,
    isUrlField: true,
    defaultValue: DEFAULT_GITHUB_URL,
    helpText: (
      <FormattedMessage
        defaultMessage="The GitHub API endpoint URL. Defaults to {defaultUrl}."
        id="xpack.stackConnectors.github.apiUrlHelpText"
        values={{
          defaultUrl: <strong>{DEFAULT_GITHUB_URL}</strong>,
        }}
      />
    ),
  },
];

const secretsFormSchema: SecretsFieldSchema[] = [
  {
    id: 'token',
    label: i18n.TOKEN_LABEL,
    isPasswordField: true,
    helpText: (
      <FormattedMessage
        defaultMessage="A GitHub personal access token with repo scope. Create one at {link}."
        id="xpack.stackConnectors.github.tokenHelpText"
        values={{
          link: (
            <EuiLink
              data-test-subj="github-token-doc"
              href="https://github.com/settings/tokens"
              target="_blank"
            >
              https://github.com/settings/tokens
            </EuiLink>
          ),
        }}
      />
    ),
  },
];

const GitHubActionConnectorFields: React.FC<ActionConnectorFieldsProps> = ({
  readOnly,
  isEdit,
}) => {
  const { http } = useKibana().services;
  const { setFieldValue } = useFormContext();
  const [isConnecting, setIsConnecting] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [accessToken, setAccessToken] = useState<string>('');
  const [requestId, setRequestId] = useState<string>('');

  const startOAuthFlow = useCallback(async () => {
    setIsConnecting(true);
    setOauthStatus('pending');
    setErrorMessage('');

    try {
      const response = await http!.post<{ auth_url: string; request_id: string }>(
        '/internal/stack_connectors/github/oauth/start',
        {
          body: JSON.stringify({ scope: ['repo'] }),
        }
      );

      const { auth_url: authUrl, request_id: newRequestId } = response;
      setRequestId(newRequestId);

      // Open OAuth popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      window.open(
        authUrl,
        'GitHub OAuth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // Fetch secrets from Kibana proxy endpoint
      try {
        const maxRetries = 5;
        const retryDelay = 2000;
        let token = '';

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          const secretsData = await http!.get<{ access_token: string }>(
            '/internal/stack_connectors/github/oauth/secrets',
            {
              query: { request_id: newRequestId },
            }
          );

          token = secretsData.access_token;

          if (token) {
            break;
          }

          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }

        // Save the OAuth token to connector secrets using form context
        setFieldValue('secrets.token', token);

        setAccessToken(token);
        setOauthStatus('success');
        setIsConnecting(false);
      } catch (error) {
        setOauthStatus('error');
        setErrorMessage('OAuth flow was cancelled or failed');
        setIsConnecting(false);
      }
    } catch (error) {
      setOauthStatus('error');
      setErrorMessage((error as Error).message || 'Failed to initiate OAuth');
      setIsConnecting(false);
    }
  }, [http, setFieldValue]);

  return (
    <>
      <SimpleConnectorForm
        isEdit={isEdit}
        readOnly={readOnly}
        configFormSchema={configFormSchema}
        secretsFormSchema={secretsFormSchema}
      />
      <EuiSpacer size="m" />
      <EuiFormRow
        fullWidth
        label="Authentication Method"
        helpText="Connect to GitHub using OAuth for secure authentication"
      >
        <>
          {oauthStatus === 'idle' && (
            <EuiButton
              onClick={startOAuthFlow}
              isLoading={isConnecting}
              disabled={readOnly}
              iconType="logoGithub"
              fill
            >
              Connect with GitHub
            </EuiButton>
          )}

          {oauthStatus === 'pending' && (
            <EuiCallOut
              announceOnMount
              title="Waiting for authorization"
              color="primary"
              iconType="iInCircle"
            >
              <p>Please complete the authorization in the popup window.</p>
            </EuiCallOut>
          )}

          {oauthStatus === 'success' && (
            <EuiCallOut
              announceOnMount
              title="Successfully connected!"
              color="success"
              iconType="check"
            >
              <EuiText size="s">
                <p>Your GitHub account has been connected.</p>
                <p>
                  Request ID: <strong>{requestId}</strong>
                </p>
                <p style={{ wordBreak: 'break-all' }}>
                  Access Token: <strong>{accessToken.substring(0, 8)}...</strong>
                </p>
              </EuiText>
            </EuiCallOut>
          )}

          {oauthStatus === 'error' && (
            <>
              <EuiCallOut
                announceOnMount
                title="Connection failed"
                color="danger"
                iconType="warning"
              >
                <p>{errorMessage}</p>
              </EuiCallOut>
              <EuiSpacer size="s" />
              <EuiButton onClick={startOAuthFlow} disabled={readOnly} iconType="refresh">
                Try Again
              </EuiButton>
            </>
          )}
        </>
      </EuiFormRow>
    </>
  );
};

// eslint-disable-next-line import/no-default-export
export { GitHubActionConnectorFields as default };

