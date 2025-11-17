/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiBadge,
  EuiBadgeGroup,
  EuiConfirmModal,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSkeletonRectangle,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiFlyoutFooter,
  EuiHealth,
  EuiInMemoryTable,
  EuiScreenReaderOnly,
  EuiSwitch,
  EuiText,
  EuiTitle,
  useEuiTheme,
  useGeneratedHtmlId,
  type EuiBasicTableColumn,
  type EuiComboBoxOptionOption,
} from '@elastic/eui';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { CONNECTOR_ID as MCP_CONNECTOR_ID } from '@kbn/connector-schemas/mcp/constants';
import type { ActionConnector } from '@kbn/triggers-actions-ui-plugin/public';
import { useQueryClient } from '@kbn/react-query';
import { useBreadcrumb } from '../hooks/use_breadcrumbs';
import { appPaths } from '../utils/app_paths';
import { labels } from '../utils/i18n';
import { useFlyoutState } from '../hooks/use_flyout_state';
import { queryKeys } from '../query_keys';

interface McpToolInfo {
  name: string;
  description?: string;
}

interface McpServer {
  id: string;
  name: string;
  url: string;
  connected: boolean;
  availableToolCount: number;
  activeToolCount: number;
  activeToolIds?: string[];
  activeToolsLoading?: boolean;
}

interface McpServerDetails {
  connector: {
    id: string;
    name: string;
    url: string;
  };
  connected: boolean;
  availableTools: Array<{ name: string; description?: string }>;
  activeToolIds: string[];
}

export const OnechatMcpServersPage: React.FC = () => {
  useBreadcrumb([
    { text: labels.tools.title, path: appPaths.tools.list },
    {
      text: i18n.translate('xpack.onechat.tools.mcpServers.breadcrumbTitle', {
        defaultMessage: 'MCP Servers',
      }),
      path: appPaths.mcpServers,
    },
  ]);

  const { euiTheme } = useEuiTheme();
  const kibanaServices = useKibana().services as any;
  const http = kibanaServices.http;
  const triggersActionsUi =
    kibanaServices.triggersActionsUi ?? kibanaServices.plugins?.triggersActionsUi;
  const queryClient = useQueryClient();

  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [toolsFlyoutServer, setToolsFlyoutServer] = useState<{ id: string; name: string } | null>(
    null
  );
  const [selectedTools, setSelectedTools] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [availableTools, setAvailableTools] = useState<McpToolInfo[]>([]);
  // per-toggle update disabled; all changes saved via footer Save
  const [originalSelectedToolIds, setOriginalSelectedToolIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModalServer, setDeleteModalServer] = useState<McpServer | null>(null);
  const [isDeletingServer, setIsDeletingServer] = useState(false);
  const [addConnectorFlyoutOpen, setAddConnectorFlyoutOpen] = useState(false);
  const [editConnector, setEditConnector] = useState<ActionConnector | null>(null);
  const modalTitleId = useGeneratedHtmlId();
  const toolsFlyoutTitleId = useGeneratedHtmlId();
  const { isOpen, openFlyout, closeFlyout } = useFlyoutState();

  const truncateFirstSentence = useCallback((text?: string) => {
    if (!text) return '';
    const match = text.match(/.*?[.!?](?:\s|$)/);
    return match ? match[0].trim() : text;
  }, []);

  const loadServers = useCallback(async () => {
    if (!http) return;
    setLoading(true);
    try {
      const response = (await http.get('/internal/agent_builder/mcp/servers')) as {
        servers: McpServer[];
      };
      setServers((prev) => {
        const prevById = new Map(prev.map((p) => [p.id, p]));
        return response.servers.map((s) => {
          const prevS = prevById.get(s.id);
          return {
            ...s,
            activeToolIds: prevS?.activeToolIds,
            activeToolCount:
              typeof prevS?.activeToolCount === 'number'
                ? prevS!.activeToolCount
                : s.activeToolCount,
            activeToolsLoading: prevS?.activeToolIds ? false : true,
          } as McpServer;
        });
      });
      // Show row-level skeletons for active tools immediately while details load
      setLoading(false);
    } catch (error) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [http]);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const serverIdsKey = useMemo(
    () => servers.map((s) => `${s.id}:${s.url ?? ''}`).join('|'),
    [servers]
  );
  useEffect(() => {
    if (!http || loading || servers.length === 0) return;
    let cancelled = false;
    const current = [...servers];
    (async () => {
      try {
        const detailsList = await Promise.all(
          current.map(async (s) => {
            try {
              const details = (await http.get(
                `/internal/agent_builder/mcp/servers/${s.id}`
              )) as McpServerDetails;
              return {
                id: s.id,
                connected: details.connected,
                availableCount: details.availableTools.length,
                activeToolIds: details.activeToolIds,
              };
            } catch {
              return { id: s.id, connected: false, availableCount: 0 };
            }
          })
        );
        if (cancelled) return;
        setServers((prev) => {
          let changed = false;
          const updated = prev.map((s) => {
            const d = detailsList.find((x) => x.id === s.id);
            if (!d) return s;
            const nextConnected = d.connected;
            const nextAvailable = d.availableCount;
            const nextActiveIds = d.activeToolIds ?? [];
            const nextActiveCount = nextActiveIds.length;
            const prevIds = Array.isArray(s.activeToolIds) ? s.activeToolIds : null;
            const idsChanged = prevIds ? prevIds.join('|') !== nextActiveIds.join('|') : true;
            const shouldUpdate =
              s.connected !== nextConnected ||
              s.availableToolCount !== nextAvailable ||
              s.activeToolCount !== nextActiveCount ||
              idsChanged ||
              s.activeToolsLoading === true;
            if (!shouldUpdate) return s;
            changed = true;
            return {
              ...s,
              connected: nextConnected,
              availableToolCount: nextAvailable,
              activeToolIds: nextActiveIds,
              activeToolCount: nextActiveCount,
              activeToolsLoading: false,
            };
          });
          return changed ? updated : prev;
        });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [http, serverIdsKey, loading, servers]);

  const openToolsFlyoutForServer = useCallback(
    async (server: McpServer) => {
      if (!http) return;
      setToolsFlyoutServer({ id: server.id, name: server.name });
      try {
        const response = (await http.get(
          `/internal/agent_builder/mcp/servers/${server.id}`
        )) as McpServerDetails;
        setAvailableTools(response.availableTools);
        setOriginalSelectedToolIds(response.activeToolIds || []);
        const selected = response.activeToolIds.map((toolName: string) => ({
          label: toolName,
          value: toolName,
        }));
        setSelectedTools(selected);
      } catch {
        // ignore
      } finally {
        openFlyout();
      }
    },
    [http, openFlyout]
  );

  const toggleToolActive = useCallback(
    (toolName: string, makeActive: boolean) => {
      if (!toolsFlyoutServer) return;
      const current = selectedTools.map((t) => t.value!) as string[];
      const next = makeActive
        ? Array.from(new Set([...current, toolName]))
        : current.filter((t) => t !== toolName);
      setSelectedTools(next.map((n) => ({ label: n, value: n })));
    },
    [toolsFlyoutServer, selectedTools]
  );

  const handleDelete = useCallback(async (server: McpServer) => {
    setDeleteModalServer(server);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteModalServer) return;
    try {
      setIsDeletingServer(true);
      await http!.delete(`/internal/agent_builder/mcp/servers/${deleteModalServer.id}`);
      setDeleteModalServer(null);
      await loadServers();
      if (toolsFlyoutServer?.id === deleteModalServer.id) {
        closeFlyout();
        setToolsFlyoutServer(null);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.all });
    } catch {
      // ignore
    } finally {
      setIsDeletingServer(false);
    }
  }, [deleteModalServer, http, loadServers, toolsFlyoutServer, closeFlyout, queryClient]);

  const handleEditConnector = useCallback(
    async (serverId: string) => {
      try {
        const connectors = (await http!.get('/api/actions/connectors')) as ActionConnector[];
        const found = connectors.find((c) => c.id === serverId);
        if (found) {
          if (!(found as any).actionTypeId || (found as any).actionTypeId === '') {
            (found as any).actionTypeId = MCP_CONNECTOR_ID;
          }
          setEditConnector(found);
          return;
        }
        const connector = (await http!.get(
          `/api/actions/connector/${serverId}`
        )) as ActionConnector;
        if (!(connector as any).actionTypeId || (connector as any).actionTypeId === '') {
          (connector as any).actionTypeId = MCP_CONNECTOR_ID;
        }
        setEditConnector(connector);
      } catch {
        // ignore
      }
    },
    [http]
  );

  const activeToolNames = useMemo(
    () => new Set((selectedTools || []).map((t) => t.value)),
    [selectedTools]
  );

  const sortedTools = useMemo(() => {
    const active = (availableTools || []).filter((t) => activeToolNames.has(t.name));
    const inactive = (availableTools || []).filter((t) => !activeToolNames.has(t.name));
    return [...active, ...inactive];
  }, [availableTools, activeToolNames]);

  const hasChanges = useMemo(() => {
    const current = new Set((selectedTools || []).map((t) => t.value as string));
    const original = new Set(originalSelectedToolIds || []);
    if (current.size !== original.size) return true;
    for (const v of current) {
      if (!original.has(v || '')) return true;
    }
    return false;
  }, [selectedTools, originalSelectedToolIds]);

  const onCancelToolsFlyout = useCallback(() => {
    closeFlyout();
    setSelectedTools((originalSelectedToolIds || []).map((n) => ({ label: n, value: n })));
  }, [closeFlyout, originalSelectedToolIds]);

  const onSaveTools = useCallback(async () => {
    if (!http || !toolsFlyoutServer) return;
    try {
      setIsSaving(true);
      const next = (selectedTools || []).map((t) => t.value!) as string[];
      await http.post(`/internal/agent_builder/mcp/servers/${toolsFlyoutServer.id}/tools`, {
        body: JSON.stringify({ toolIds: next }),
      });
      await loadServers();
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.all });
      setOriginalSelectedToolIds(next);
      closeFlyout();
    } catch {
      // ignore
    } finally {
      setIsSaving(false);
    }
  }, [http, toolsFlyoutServer, selectedTools, loadServers, queryClient, closeFlyout]);

  // Derive a stable string status to avoid boolean filter identity issues
  const serversWithStatus = useMemo(
    () =>
      servers.map((s) => ({
        ...s,
        __status: s.connected ? 'online' : 'offline',
      })),
    [servers]
  );

  const BADGE_GAP_PX = 8;
  const ActiveToolsBadges: React.FC<{ tools: string[] }> = ({ tools }) => {
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const measureRef = React.useRef<HTMLDivElement | null>(null);
    const [visibleCount, setVisibleCount] = React.useState<number>(tools.length);
    const badgeWidthsRef = React.useRef<number[]>([]);
    const [containerWidth, setContainerWidth] = React.useState<number>(0);
    const plusWidthRef = React.useRef<number>(0);
    const [expanded, setExpanded] = React.useState<boolean>(false);

    const recompute = React.useCallback(() => {
      if (!containerRef.current || !measureRef.current) return;
      const nextContainerWidth = containerRef.current.clientWidth;
      setContainerWidth(nextContainerWidth);
      const children = Array.from(measureRef.current.children) as HTMLElement[];
      const widths = children
        .filter((el) => el.dataset.type === 'badge')
        .map((el) => el.offsetWidth);
      badgeWidthsRef.current = widths;
      const plusEl = children.find((el) => el.dataset.type === 'plus');
      plusWidthRef.current = plusEl ? (plusEl as HTMLElement).offsetWidth : 0;

      const n = tools.length;
      let best = 0;
      for (let k = 0; k <= n; k++) {
        let sum = 0;
        for (let i = 0; i < k; i++) {
          sum += badgeWidthsRef.current[i];
          if (i > 0) sum += BADGE_GAP_PX;
        }
        const remaining = n - k;
        if (remaining > 0) {
          if (k > 0) sum += BADGE_GAP_PX;
          sum += plusWidthRef.current;
        }
        if (sum <= nextContainerWidth) {
          best = k;
        } else {
          break;
        }
      }
      setVisibleCount(best);
    }, [tools.length]);

    // Resize observer
    useEffect(() => {
      if (!containerRef.current) return;
      const ro = new (window as any).ResizeObserver(() => {
        recompute();
      });
      ro.observe(containerRef.current);
      return () => {
        try {
          ro.disconnect();
        } catch {
          // ignore
        }
      };
    }, [recompute]);

    // Recompute when tools change
    useEffect(() => {
      recompute();
    }, [tools, recompute, containerWidth]);

    const effectiveVisibleCount = expanded ? tools.length : visibleCount;
    const visible = tools.slice(0, effectiveVisibleCount);
    const remaining = tools.length - effectiveVisibleCount;
    // remainingList not needed for click-to-expand approach

    return (
      <div style={{ width: '100%' }}>
        <div
          ref={containerRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
            flexWrap: expanded ? 'wrap' : 'nowrap',
            gap: `${BADGE_GAP_PX}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          <EuiBadgeGroup
            gutterSize="s"
            css={css`
              display: inline-flex;
              flex-wrap: ${expanded ? 'wrap' : 'nowrap'};
              max-width: 100%;
            `}
          >
            {visible.map((name) => (
              <EuiBadge key={name} color="hollow">
                {name}
              </EuiBadge>
            ))}
          </EuiBadgeGroup>
          {!expanded && remaining > 0 && (
            <EuiButtonEmpty size="xs" flush="left" onClick={() => setExpanded(true)}>
              {i18n.translate('xpack.onechat.tools.mcpServers.moreLink', {
                defaultMessage: '+{count} more',
                values: { count: remaining },
              })}
            </EuiButtonEmpty>
          )}
        </div>
        {expanded && (
          <div
            style={{
              marginTop: 4,
              display: 'flex',
            }}
          >
            <EuiButtonEmpty size="xs" flush="left" onClick={() => setExpanded(false)}>
              {i18n.translate('xpack.onechat.tools.mcpServers.collapseLink', {
                defaultMessage: 'Show less',
              })}
            </EuiButtonEmpty>
          </div>
        )}
        {/* Hidden measurer */}
        <div
          ref={measureRef}
          style={{
            position: 'absolute',
            visibility: 'hidden',
            height: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {tools.map((name) => (
            <span key={`m-${name}`} data-type="badge" style={{ marginRight: BADGE_GAP_PX }}>
              <EuiBadge color="hollow">{name}</EuiBadge>
            </span>
          ))}
          <span data-type="plus">
            <EuiButtonEmpty size="xs" flush="left" iconType="arrowDown">
              {i18n.translate('xpack.onechat.tools.mcpServers.moreLink', {
                defaultMessage: '+{count} more',
                values: { count: 88 },
              })}
            </EuiButtonEmpty>
          </span>
        </div>
      </div>
    );
  };
  const columns: Array<EuiBasicTableColumn<McpServer>> = [
    {
      field: 'name',
      name: i18n.translate('xpack.onechat.tools.mcpServers.nameColumn', {
        defaultMessage: 'Name',
      }),
      width: '20%',
      render: (name: string, server: McpServer) => (
        <EuiButtonEmpty
          size="s"
          flush="left"
          onClick={() => openToolsFlyoutForServer(server)}
          data-test-subj="mcpServersNameManageToolsLink"
        >
          {name}
        </EuiButtonEmpty>
      ),
      valign: 'top',
    },
    {
      field: 'connected',
      name: i18n.translate('xpack.onechat.tools.mcpServers.connectedColumn', {
        defaultMessage: 'Status',
      }),
      width: '15%',
      valign: 'top',
      render: (connected: boolean) => (
        <EuiHealth color={connected ? 'success' : 'danger'}>
          {connected
            ? i18n.translate('xpack.onechat.tools.mcpServers.connectedStatus', {
                defaultMessage: 'Online',
              })
            : i18n.translate('xpack.onechat.tools.mcpServers.disconnectedStatus', {
                defaultMessage: 'Offline',
              })}
        </EuiHealth>
      ),
    },
    {
      field: 'availableToolCount',
      name: i18n.translate('xpack.onechat.tools.mcpServers.availableToolsColumn', {
        defaultMessage: 'Available tools',
      }),
      width: '15%',
      valign: 'top',
    },
    {
      field: 'activeToolCount',
      name: i18n.translate('xpack.onechat.tools.mcpServers.activeToolsColumn', {
        defaultMessage: 'Active tools',
      }),
      width: '50%',
      valign: 'top',
      render: (_count: number, server: McpServer) => {
        if (server.activeToolsLoading) {
          return (
            <EuiSkeletonRectangle
              ariaWrapperProps={{ style: { width: '80%' } }}
              width="100%"
              height={16}
              borderRadius="s"
            />
          );
        }
        const activeList = Array.isArray(server.activeToolIds) ? server.activeToolIds! : [];
        if (activeList.length === 0) {
          return null;
        }
        return <ActiveToolsBadges tools={activeList} />;
      },
    },
    {
      name: (
        <EuiScreenReaderOnly>
          <span>
            {i18n.translate('xpack.onechat.tools.mcpServers.actionsColumn', {
              defaultMessage: 'Actions',
            })}
          </span>
        </EuiScreenReaderOnly>
      ),
      width: '10%',
      align: 'right',
      valign: 'top',
      render: (server: McpServer) => (
        <EuiFlexGroup
          justifyContent="flexEnd"
          gutterSize="s"
          responsive={false}
          alignItems="center"
        >
          <EuiFlexItem grow={false}>
            <EuiButtonIcon
              iconType="gear"
              aria-label={i18n.translate('xpack.onechat.tools.mcpServers.editServerAriaLabel', {
                defaultMessage: 'Edit server',
              })}
              onClick={() => handleEditConnector(server.id)}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonIcon
              iconType="trash"
              color="danger"
              aria-label={i18n.translate('xpack.onechat.tools.mcpServers.deleteServerAriaLabel', {
                defaultMessage: 'Delete server',
              })}
              onClick={() => handleDelete(server)}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
  ];

  const serversSearchConfig = useMemo(
    () => ({
      box: {
        incremental: true,
        placeholder: i18n.translate('xpack.onechat.tools.mcpServers.searchPlaceholder', {
          defaultMessage: 'Search MCP servers…',
        }),
      },
      filters: [
        {
          type: 'field_value_selection' as const,
          field: '__status',
          name: i18n.translate('xpack.onechat.tools.mcpServers.statusFilter', {
            defaultMessage: 'Status',
          }),
          multiSelect: 'or' as const,
          options: [
            {
              value: 'online',
              name: i18n.translate('xpack.onechat.tools.mcpServers.statusOnline', {
                defaultMessage: 'Online',
              }),
              view: (
                <EuiHealth color="success">
                  {i18n.translate('xpack.onechat.tools.mcpServers.statusOnline', {
                    defaultMessage: 'Online',
                  })}
                </EuiHealth>
              ),
            },
            {
              value: 'offline',
              name: i18n.translate('xpack.onechat.tools.mcpServers.statusOffline', {
                defaultMessage: 'Offline',
              }),
              view: (
                <EuiHealth color="danger">
                  {i18n.translate('xpack.onechat.tools.mcpServers.statusOffline', {
                    defaultMessage: 'Offline',
                  })}
                </EuiHealth>
              ),
            },
          ],
        },
      ],
    }),
    []
  );

  const emptyMessage = (
    <EuiEmptyPrompt
      iconType="plugs"
      title={
        <h2>
          {i18n.translate('xpack.onechat.tools.mcpServers.emptyTitle', {
            defaultMessage: 'No MCP servers',
          })}
        </h2>
      }
      body={
        <p>
          {i18n.translate('xpack.onechat.tools.mcpServers.emptyBody', {
            defaultMessage:
              'Add an external MCP server to enable additional tools for your agents.',
          })}
        </p>
      }
    />
  );

  const addConnectorFlyout = useMemo(() => {
    if (!triggersActionsUi) return null;
    return triggersActionsUi.getAddConnectorFlyout({
      onClose: () => {
        setAddConnectorFlyoutOpen(false);
        loadServers();
      },
      initialActionTypeId: MCP_CONNECTOR_ID,
    });
  }, [triggersActionsUi, loadServers]);

  const editConnectorFlyout = useMemo(() => {
    if (!triggersActionsUi || !editConnector) return null;
    return triggersActionsUi.getEditConnectorFlyout({
      onClose: () => {
        setEditConnector(null);
        loadServers();
      },
      connector: editConnector,
    });
  }, [triggersActionsUi, loadServers, editConnector]);

  return (
    <KibanaPageTemplate data-test-subj="agentBuilderMcpServersPage">
      <KibanaPageTemplate.Header
        pageTitle={i18n.translate('xpack.onechat.tools.mcpServers.pageTitle', {
          defaultMessage: 'MCP Servers',
        })}
        description={i18n.translate('xpack.onechat.tools.mcpServers.pageDescription', {
          defaultMessage:
            'Manage connections to external apps and services to give your agents more context.',
        })}
        css={css`
          background-color: ${euiTheme.colors.backgroundBasePlain};
          border-block-end: none;
        `}
        rightSideItems={[
          <EuiButton
            key="add-mcp-server"
            fill
            iconType="plus"
            onClick={() => setAddConnectorFlyoutOpen(true)}
            data-test-subj="mcpServersAddButtonToolbar"
          >
            {i18n.translate('xpack.onechat.tools.mcpServers.addServerButton', {
              defaultMessage: 'Add MCP server',
            })}
          </EuiButton>,
        ]}
      />
      <KibanaPageTemplate.Section>
        {servers.length === 0 && !loading ? (
          emptyMessage
        ) : (
          <EuiInMemoryTable
            css={css`
              /* Add 8px vertical padding to all body cells except the first (Name) column */
              .euiTableRowCell:not(:first-child) .euiTableCellContent {
                padding-top: 14px;
                padding-bottom: 14px;
              }
            `}
            items={serversWithStatus}
            columns={columns}
            itemId="id"
            loading={loading}
            search={serversSearchConfig as any}
            pagination={false}
          />
        )}
      </KibanaPageTemplate.Section>

      {isOpen && toolsFlyoutServer && (
        <EuiFlyout size="s" onClose={closeFlyout} aria-labelledby={toolsFlyoutTitleId}>
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="s" id={toolsFlyoutTitleId}>
              <h3>{toolsFlyoutServer.name}</h3>
            </EuiTitle>
            <EuiText color="subdued" size="s">
              {i18n.translate('xpack.onechat.tools.mcpServers.toolsFlyoutSubheading', {
                defaultMessage: 'Manage active MCP tools',
              })}
            </EuiText>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <EuiInMemoryTable
              items={sortedTools}
              itemId={(item: { name: string }) => item.name}
              columns={[
                {
                  field: 'name',
                  name: i18n.translate('xpack.onechat.tools.mcpServers.toolsColumnName', {
                    defaultMessage: 'Tool',
                  }),
                  sortable: true,
                  render: (_: string, item: { name: string; description?: string }) => (
                    <div>
                      <EuiText size="s">
                        <strong>{item.name}</strong>
                      </EuiText>
                      {item.description && (
                        <EuiText size="xs" color="subdued">
                          {truncateFirstSentence(item.description)}
                        </EuiText>
                      )}
                    </div>
                  ),
                } as EuiBasicTableColumn<{ name: string; description?: string }>,
                {
                  name: i18n.translate('xpack.onechat.tools.mcpServers.toolsColumnActive', {
                    defaultMessage: 'Active',
                  }),
                  width: '120px',
                  render: (item: { name: string }) => {
                    const isActive = activeToolNames.has(item.name);
                    return (
                      <EuiSwitch
                        label={
                          isActive
                            ? i18n.translate('xpack.onechat.tools.mcpServers.activeOn', {
                                defaultMessage: 'Enabled',
                              })
                            : i18n.translate('xpack.onechat.tools.mcpServers.activeOff', {
                                defaultMessage: 'Disabled',
                              })
                        }
                        showLabel={false}
                        checked={isActive}
                        onChange={(e) => toggleToolActive(item.name, e.target.checked)}
                        disabled={false}
                        data-test-subj={`mcpToolToggle-${item.name}`}
                      />
                    );
                  },
                } as EuiBasicTableColumn<{ name: string }>,
              ]}
              search={{
                box: {
                  incremental: true,
                  placeholder: i18n.translate(
                    'xpack.onechat.tools.mcpServers.toolsSearchPlaceholder',
                    {
                      defaultMessage: 'Search tools…',
                    }
                  ),
                },
              }}
              sorting={true}
              pagination={false}
            />
          </EuiFlyoutBody>
          <EuiFlyoutFooter>
            <EuiFlexGroup>
              <EuiFlexItem grow={true}>
                <EuiButtonEmpty onClick={onCancelToolsFlyout}>
                  {i18n.translate('xpack.onechat.tools.mcpServers.toolsFlyoutCancel', {
                    defaultMessage: 'Cancel',
                  })}
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={true}>
                <EuiButton
                  fill
                  onClick={onSaveTools}
                  isLoading={isSaving}
                  isDisabled={!hasChanges || isSaving}
                  data-test-subj="mcpToolsSaveButton"
                >
                  {i18n.translate('xpack.onechat.tools.mcpServers.toolsFlyoutSave', {
                    defaultMessage: 'Save',
                  })}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutFooter>
        </EuiFlyout>
      )}

      {addConnectorFlyoutOpen && addConnectorFlyout}
      {editConnectorFlyout}

      {deleteModalServer && (
        <EuiConfirmModal
          aria-labelledby={modalTitleId}
          titleProps={{ id: modalTitleId }}
          title={
            <span>
              {i18n.translate('xpack.onechat.tools.mcpServers.deleteModalTitlePrefix', {
                defaultMessage: 'Delete MCP server:',
              })}{' '}
              <strong>{deleteModalServer.name}</strong>?
            </span>
          }
          onCancel={() => setDeleteModalServer(null)}
          onConfirm={confirmDelete}
          isLoading={isDeletingServer}
          confirmButtonDisabled={isDeletingServer}
          cancelButtonText={i18n.translate('xpack.onechat.tools.mcpServers.deleteModalCancel', {
            defaultMessage: 'Cancel',
          })}
          confirmButtonText={i18n.translate('xpack.onechat.tools.mcpServers.deleteModalConfirm', {
            defaultMessage: 'Delete',
          })}
          buttonColor="danger"
          defaultFocusedButton="confirm"
        >
          <p>
            {i18n.translate('xpack.onechat.tools.mcpServers.deleteModalBody', {
              defaultMessage: 'This will remove the MCP server and all associated tools.',
            })}
          </p>
        </EuiConfirmModal>
      )}
    </KibanaPageTemplate>
  );
};
