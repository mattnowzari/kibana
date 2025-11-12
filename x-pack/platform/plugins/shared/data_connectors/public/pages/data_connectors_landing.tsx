/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButton,
  EuiCard,
  EuiConfirmModal,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFieldSearch,
  EuiFilterButton,
  EuiFilterGroup,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiSpacer,
  EuiText,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import React, { useMemo, useState } from 'react';
import { WORKPLACE_CONNECTOR_TYPES } from '../../common';
import { DATA_CONNECTORS_FULL_TITLE } from '../../common/constants';
import { ConnectorFlyout } from '../components/connector_flyout';
import { GoogleDriveConnectorFlyout } from '../components/google_drive_connector_flyout';
import { useConnectors } from '../hooks/use_connectors';

interface ConnectorTileData {
  connectorType: string;
  title: string;
  description: string;
  icon: string; // Image URL or path
  defaultFeatures: string[];
  flyoutComponent?: React.ComponentType<{
    connectorType: string;
    connectorName: string;
    onClose: () => void;
    onSave: (data: any) => Promise<void>;
    isEditing: boolean;
  }>;
  customFlyoutComponent?: React.ComponentType<{
    onClose: () => void;
    isEditing: boolean;
    onConnectionSuccess: () => void;
  }>;
}

interface ConnectorSaveConfig {
  secretsMapping?: Record<string, string>; // Maps input field names to secret field names
  config?: Record<string, any>; // Static config values
  featuresField?: string; // Field name in input data that contains features array
}

// Hardcoded save configuration - eventually this will come from an API
const CONNECTOR_SAVE_CONFIG: Record<string, ConnectorSaveConfig> = {
  [WORKPLACE_CONNECTOR_TYPES.BRAVE_SEARCH]: {
    secretsMapping: {
      apiKey: 'api_key', // Maps input.apiKey to secrets.api_key
    },
    config: {},
    featuresField: 'features',
  },
  [WORKPLACE_CONNECTOR_TYPES.GOOGLE_DRIVE]: {
    secretsMapping: {},
    config: {},
    featuresField: 'features',
  },
};

// Hardcoded data - eventually this will come from an API
const CONNECTOR_TILES_DATA: ConnectorTileData[] = [
  {
    connectorType: WORKPLACE_CONNECTOR_TYPES.BRAVE_SEARCH,
    title: 'Brave Search',
    description: 'Connect to Brave Search API for web search capabilities.',
    icon: '/plugins/dataConnectors/assets/brave_logo.svg', // Replace with actual image path
    defaultFeatures: ['search_web'],
    flyoutComponent: ConnectorFlyout,
  },
  {
    connectorType: WORKPLACE_CONNECTOR_TYPES.GOOGLE_DRIVE,
    title: 'Google Drive',
    description: 'Connect to Google Drive to search and access files using OAuth.',
    icon: '/plugins/dataConnectors/assets/google_drive_logo.svg', // Replace with actual image path
    defaultFeatures: ['search_files'],
    customFlyoutComponent: GoogleDriveConnectorFlyout,
  },
];

export const DataConnectorsLandingPage = () => {
  const { services } = useKibana();
  const httpClient = services.http;

  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);
  const [selectedConnectorType, setSelectedConnectorType] = useState<string | null>(null);

  const { euiTheme } = useEuiTheme();
  const { isLoading, createConnector, deleteConnector, isConnected, connectors, refreshConnectors } =
    useConnectors(httpClient);

  // Create a map of connector types to their connector instances
  const connectorsByType = useMemo(() => {
    const map = new Map<string, typeof connectors[0]>();
    connectors.forEach((connector) => {
      map.set(connector.type, connector);
    });
    return map;
  }, [connectors]);

  // Create a map of connector types to menu open states
  const [menuOpenStates, setMenuOpenStates] = useState<Record<string, boolean>>({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [connectorToDelete, setConnectorToDelete] = useState<string | null>(null);

  const handleSelectConnector = (connectorType: string) => {
    setSelectedConnectorType(connectorType);
    setIsFlyoutOpen(true);
  };

  const handleSaveConnector = async (tileData: ConnectorTileData, data: any) => {
    if (!selectedConnectorType) return;

    const saveConfig = CONNECTOR_SAVE_CONFIG[selectedConnectorType];
    if (!saveConfig) return;

    // Build secrets from mapping
    const secrets: Record<string, any> = {};
    if (saveConfig.secretsMapping) {
      Object.entries(saveConfig.secretsMapping).forEach(([inputField, secretField]) => {
        if (data[inputField] !== undefined) {
          secrets[secretField] = data[inputField];
        }
      });
    }

    // Get features from data or use defaults
    const features =
      saveConfig.featuresField && data[saveConfig.featuresField]?.length
        ? data[saveConfig.featuresField]
        : tileData.defaultFeatures;

    const connectorData = {
      name: tileData.title,
      type: selectedConnectorType,
      secrets,
      config: saveConfig.config || {},
      features,
    };

    await createConnector(connectorData);
  };

  const handleCloseFlyout = () => {
    setIsFlyoutOpen(false);
    setSelectedConnectorType(null);
  };

  const toggleMenu = (connectorType: string) => {
    setMenuOpenStates((prev) => ({
      ...prev,
      [connectorType]: !prev[connectorType],
    }));
  };

  const closeMenu = (connectorType: string) => {
    setMenuOpenStates((prev) => ({
      ...prev,
      [connectorType]: false,
    }));
  };

  const onConfigure = (connectorType: string) => {
    setSelectedConnectorType(connectorType);
    setIsFlyoutOpen(true);
    closeMenu(connectorType);
  };

  const onDelete = (connectorId: string | undefined, connectorType: string) => {
    setConnectorToDelete(connectorId || null);
    setShowDeleteModal(true);
    closeMenu(connectorType);
  };

  const renderConnectorTile = (tileData: ConnectorTileData) => {
    const connector = connectorsByType.get(tileData.connectorType);
    const connectorId = connector?.id;
    const connected = isConnected(tileData.connectorType);
    const isMenuOpen = menuOpenStates[tileData.connectorType] || false;

    return (
      <EuiFlexItem key={tileData.connectorType}>
        <div style={{ position: 'relative' }}>
          <EuiCard
            icon={<img src={tileData.icon} alt={`${tileData.title} logo`} width={48} height={48} />}
            title={tileData.title}
            description={tileData.description}
            footer={
              <EuiFlexGroup justifyContent="center" gutterSize="xs" responsive={false}>
                {connected ? (
                  <EuiFlexItem grow={false}>
                    <EuiPopover
                      button={
                        <EuiButton
                          size="s"
                          iconType="arrowDown"
                          iconSide="right"
                          onClick={() => toggleMenu(tileData.connectorType)}
                          color="success"
                          fill
                          style={{
                            backgroundColor: '#008A5E',
                            borderColor: '#008A5E',
                            color: '#FFFFFF',
                            opacity: 1,
                          }}
                        >
                          Connected
                        </EuiButton>
                      }
                      isOpen={isMenuOpen}
                      closePopover={() => closeMenu(tileData.connectorType)}
                      panelPaddingSize="none"
                      anchorPosition="downLeft"
                    >
                      <EuiContextMenuPanel
                        items={[
                          <EuiContextMenuItem
                            key="configure"
                            icon="gear"
                            onClick={() => onConfigure(tileData.connectorType)}
                          >
                            Configure
                          </EuiContextMenuItem>,
                          <EuiContextMenuItem
                            key="delete"
                            icon="trash"
                            css={css`
                              color: ${euiTheme.colors.textDanger};
                            `}
                            onClick={() => onDelete(connectorId, tileData.connectorType)}
                          >
                            <span className="euiTextColor-danger">Delete</span>
                          </EuiContextMenuItem>,
                        ]}
                      />
                    </EuiPopover>
                  </EuiFlexItem>
                ) : (
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      size="s"
                      onClick={() => handleSelectConnector(tileData.connectorType)}
                      isLoading={isLoading}
                      color="primary"
                      fill
                    >
                      Connect
                    </EuiButton>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            }
          />
        </div>
      </EuiFlexItem>
    );
  };

  const modalTitleId = useGeneratedHtmlId();

  return (
    <KibanaPageTemplate>
      <KibanaPageTemplate.Header
        pageTitle={DATA_CONNECTORS_FULL_TITLE}
        css={css`
          background-color: ${euiTheme.colors.backgroundBasePlain};
        `}
      >
        <EuiText>
          {i18n.translate('xpack.dataConnectors.landingPage.description', {
            defaultMessage: 'Connect to external data sources to power your agents and indices.',
          })}
        </EuiText>
      </KibanaPageTemplate.Header>
      <KibanaPageTemplate.Section>
        <EuiFlexGroup gutterSize="m" alignItems="center">
          <EuiFlexItem>
            <EuiFieldSearch fullWidth placeholder="Search" aria-label="Search connectors" />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFilterGroup>
              <EuiFilterButton hasActiveFilters={false} numFilters={1} iconType="arrowDown">
                Categories
              </EuiFilterButton>
            </EuiFilterGroup>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="xl" />

        <EuiFlexGrid columns={4} gutterSize="m">
          {CONNECTOR_TILES_DATA.map((tileData) => renderConnectorTile(tileData))}
        </EuiFlexGrid>
      </KibanaPageTemplate.Section>

      {isFlyoutOpen &&
        selectedConnectorType &&
        (() => {
          const tileData = CONNECTOR_TILES_DATA.find(
            (tile) => tile.connectorType === selectedConnectorType
          );
          if (!tileData) return null;

          const connector = connectorsByType.get(selectedConnectorType);
          const isEditing = Boolean(connector);

          if (tileData.customFlyoutComponent) {
            const CustomFlyout = tileData.customFlyoutComponent;
            return (
              <CustomFlyout
                onClose={handleCloseFlyout}
                isEditing={isEditing}
                onConnectionSuccess={refreshConnectors}
              />
            );
          }

          if (tileData.flyoutComponent) {
            const Flyout = tileData.flyoutComponent;
            return (
              <Flyout
                connectorType={selectedConnectorType}
                connectorName={tileData.title}
                onClose={handleCloseFlyout}
                onSave={(data: any) => handleSaveConnector(tileData, data)}
                isEditing={isEditing}
              />
            );
          }

          return null;
        })()}

      {showDeleteModal && (
        <EuiConfirmModal
          title="Delete connector?"
          aria-labelledby={modalTitleId}
          titleProps={{ id: modalTitleId }}
          onCancel={() => {
            setShowDeleteModal(false);
            setConnectorToDelete(null);
          }}
          onConfirm={async () => {
            if (connectorToDelete) {
              await deleteConnector(connectorToDelete);
            }
            setShowDeleteModal(false);
            setConnectorToDelete(null);
          }}
          cancelButtonText="Cancel"
          confirmButtonText="Delete"
          buttonColor="danger"
        />
      )}
    </KibanaPageTemplate>
  );
};
