import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Page, Section } from '@/components/layout/Page';
import { useAuthStore, useThemeStore } from '@/stores';
import iconVertex from '@/assets/icons/vertex.svg';
import iconCodex from '@/assets/icons/codex.svg';
import iconOpenCodeGoDark from '@/assets/icons/opencode-go-dark.svg';
import iconOpenCodeGoLight from '@/assets/icons/opencode-go-light.svg';
import iconDevinCliDark from '@/assets/icons/devin-cli-dark.svg';
import iconDevinCliLight from '@/assets/icons/devin-cli-light.svg';
import { ProviderTile } from './components/ProviderTile';
import { OAuthFlowDialog } from './components/OAuthFlowDialog';
import type { DialogHeading } from './components/FlowDialogParts';
import { VertexImportDialog } from './components/VertexImportDialog';
import { SiwcBindDialog } from './components/SiwcBindDialog';
import { ApiKeyImportDialog } from './components/ApiKeyImportDialog';
import {
  useOAuthFlows,
  usePluginOAuthProviders,
  type ClaudeReconnectTarget,
  type ProviderFlowState,
} from './hooks/useOAuthFlows';
import { useVertexImport } from './hooks/useVertexImport';
import { useOpenCodeGoImport } from './hooks/useOpenCodeGoImport';
import { useDevinCliImport } from './hooks/useDevinCliImport';
import {
  OAUTH_PROVIDERS,
  resolveThemedIcon,
  supportsManualCallback,
  type OAuthProviderCard,
  type ThemedIcon,
} from './providers';

/** 对话框焦点标识：Vertex 不是 OAuth 提供商，用保留 id 避免与提供商冲突。 */
const VERTEX_DIALOG_ID = '__vertex__';
const VERTEX_LABEL = 'Vertex AI';
const OPENCODE_GO_DIALOG_ID = '__opencode_go__';
const DEVIN_CLI_DIALOG_ID = '__devin_cli__';
const OPENCODE_GO_ICON: ThemedIcon = { light: iconOpenCodeGoDark, dark: iconOpenCodeGoLight };
const DEVIN_CLI_ICON: ThemedIcon = { light: iconDevinCliDark, dark: iconDevinCliLight };
/** Claude asks for an optional name first, so its tile opens without starting. */
const CLAUDE_PROVIDER_ID = 'anthropic';

/** Router state the auth files page sends to reconnect a Claude limits login. */
export interface OAuthPageLocationState {
  claudeReconnect?: ClaudeReconnectTarget;
}

type DialogTarget =
  | { kind: 'oauth'; id: string }
  | { kind: 'vertex' }
  | { kind: 'opencode-go' }
  | { kind: 'devin-cli' };

/**
 * OAuth sign-in: a gallery of provider tiles and one focused sign-in dialog.
 *
 * A tile starts the sign-in right away (Claude first asks for a name). The dialog can close at
 * any time; the sign-in keeps going and the tile caption shows its progress. The last target
 * stays mounted after close so the dialog keeps its content during the exit animation.
 */
export function OAuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const apiBase = useAuthStore((state) => state.apiBase);
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);

  const pluginProviders = usePluginOAuthProviders(apiBase);
  const providerCards = useMemo<OAuthProviderCard[]>(
    () => [...OAUTH_PROVIDERS, ...pluginProviders],
    [pluginProviders]
  );

  const focusedRef = useRef<string | null>(null);
  const [dialog, setDialog] = useState<DialogTarget | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [siwcOpen, setSiwcOpen] = useState(false);
  // 每次打开换新 key 重新挂载（全新选择与会话）；关闭后保持挂载，让退出动画走完
  const [siwcKey, setSiwcKey] = useState(0);
  const openSiwc = () => {
    setSiwcKey((key) => key + 1);
    setSiwcOpen(true);
  };

  const flows = useOAuthFlows({
    providerCards,
    isFocused: (provider) => focusedRef.current === provider,
  });
  const vertexImport = useVertexImport({
    isFocused: () => focusedRef.current === VERTEX_DIALOG_ID,
    onCredentialAdded: flows.recordCredentialAdded,
  });
  const openCodeGoImport = useOpenCodeGoImport({
    isFocused: () => focusedRef.current === OPENCODE_GO_DIALOG_ID,
    onCredentialAdded: flows.recordCredentialAdded,
  });
  const devinCliImport = useDevinCliImport({
    isFocused: () => focusedRef.current === DEVIN_CLI_DIALOG_ID,
    onCredentialAdded: flows.recordCredentialAdded,
  });

  const labelOf = (card: OAuthProviderCard) => (card.kind === 'plugin' ? card.title : card.label);

  const captionOf = (card: OAuthProviderCard) => {
    if (card.kind === 'plugin') return t('auth_login.method_plugin');
    return t(card.flow === 'device' ? 'auth_login.method_device' : 'auth_login.method_browser');
  };

  const iconOf = (card: OAuthProviderCard) =>
    card.kind === 'plugin' ? card.icon : resolveThemedIcon(card.icon, resolvedTheme);

  const headingOf = (card: OAuthProviderCard): DialogHeading => ({
    title:
      card.kind === 'plugin'
        ? t('auth_login.plugin_oauth_title', { name: card.title })
        : t(card.titleKey),
    caption: captionOf(card),
    icon: iconOf(card),
    flush: card.kind === 'builtin' && card.flush,
  });

  const tileStatusLabel = (status: ProviderFlowState['status']) =>
    status === 'waiting'
      ? t('auth_login.tile_waiting')
      : status === 'success'
        ? t('auth_login.tile_success')
        : status === 'error'
          ? t('auth_login.tile_error')
          : undefined;

  const openProvider = (card: OAuthProviderCard) => {
    focusedRef.current = card.id;
    setDialog({ kind: 'oauth', id: card.id });
    setDialogOpen(true);
    // 已有进行中/失败/刚成功的尝试 → 只是重新打开查看；否则立即开始登录
    if (!flows.states[card.id]?.status && card.id !== CLAUDE_PROVIDER_ID) {
      void flows.startAuth(card.id);
    }
  };

  const startFromDialog = (providerId: string) => {
    const state = flows.states[providerId] ?? {};
    // Claude: "log in another account" goes back to the name field first.
    if (providerId === CLAUDE_PROVIDER_ID && state.status === 'success') {
      flows.dismissSuccess(providerId);
      return;
    }
    void flows.startAuth(providerId, { name: state.accountName, reconnect: state.reconnect });
  };

  const reconnectTarget = (location.state as OAuthPageLocationState | null)?.claudeReconnect;
  useEffect(() => {
    if (!reconnectTarget) return;
    // Consume the request so a reload or back navigation does not start it again.
    navigate(location.pathname, { replace: true, state: null });
    focusedRef.current = CLAUDE_PROVIDER_ID;
    setDialog({ kind: 'oauth', id: CLAUDE_PROVIDER_ID });
    setDialogOpen(true);
    void flows.startAuth(CLAUDE_PROVIDER_ID, { reconnect: reconnectTarget });
    // flows is recreated every render; the request is keyed on the target alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnectTarget]);

  const openVertex = () => {
    focusedRef.current = VERTEX_DIALOG_ID;
    setDialog({ kind: 'vertex' });
    setDialogOpen(true);
  };

  const openOpenCodeGo = () => {
    focusedRef.current = OPENCODE_GO_DIALOG_ID;
    setDialog({ kind: 'opencode-go' });
    setDialogOpen(true);
  };

  const openDevinCli = () => {
    focusedRef.current = DEVIN_CLI_DIALOG_ID;
    setDialog({ kind: 'devin-cli' });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (dialog?.kind === 'oauth') flows.dismissSuccess(dialog.id);
    if (dialog?.kind === 'vertex' && vertexImport.vertex.result) vertexImport.resetForAnother();
    if (dialog?.kind === 'opencode-go' && openCodeGoImport.openCodeGo.success) {
      openCodeGoImport.resetForAnother();
    }
    if (dialog?.kind === 'devin-cli' && devinCliImport.devinCli.success) {
      devinCliImport.resetForAnother();
    }
    focusedRef.current = null;
    setDialogOpen(false);
  };

  const viewAuthFiles = () => navigate('/auth-files');
  const viewQuota = () => navigate('/quota');

  const dialogCard =
    dialog?.kind === 'oauth' ? providerCards.find((card) => card.id === dialog.id) : undefined;
  const isOpen = (kind: DialogTarget['kind'], id?: string) =>
    dialogOpen && dialog?.kind === kind && (dialog.kind !== 'oauth' || dialog.id === id);
  const isActive = (card: OAuthProviderCard) =>
    isOpen('oauth', card.id) || flows.states[card.id]?.status === 'waiting';

  const waitingCount = Object.values(flows.states).filter(
    (state) => state.status === 'waiting'
  ).length;

  return (
    <Page
      title={t('nav.oauth', { defaultValue: 'OAuth' })}
      actions={
        (waitingCount > 0 || flows.addedCount > 0) && (
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {waitingCount > 0 && (
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
                {t('auth_login.meta_waiting', { count: waitingCount })}
              </span>
            )}
            {flows.addedCount > 0 && (
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-success" aria-hidden="true" />
                {t('auth_login.meta_added', { count: flows.addedCount })}
              </span>
            )}
          </div>
        )
      }
    >
      <Section title={t('auth_login.other_oauth_providers')}>
        <div className="grid gap-2 sm:grid-cols-2">
          {providerCards.map((card) => {
            const status = flows.states[card.id]?.status;
            return (
              <ProviderTile
                key={card.id}
                label={labelOf(card)}
                caption={captionOf(card)}
                icon={iconOf(card)}
                flush={card.kind === 'builtin' && card.flush}
                active={isActive(card)}
                status={status}
                statusLabel={tileStatusLabel(status)}
                onOpen={() => openProvider(card)}
              />
            );
          })}
        </div>
      </Section>

      <Section title={t('auth_login.other_login_methods')}>
        <div className="grid gap-2 sm:grid-cols-2">
          <ProviderTile
            label={VERTEX_LABEL}
            caption={t('vertex_import.file_label')}
            icon={iconVertex}
            active={isOpen('vertex')}
            onOpen={openVertex}
          />
          <ProviderTile
            label={t('siwc.bind')}
            caption={t('siwc.tile_caption')}
            icon={iconCodex}
            flush
            active={siwcOpen}
            onOpen={openSiwc}
          />
          <ProviderTile
            label={t('opencode_go_login.title')}
            caption={t('opencode_go_login.api_key_label')}
            icon={resolveThemedIcon(OPENCODE_GO_ICON, resolvedTheme)}
            active={isOpen('opencode-go')}
            onOpen={openOpenCodeGo}
          />
          <ProviderTile
            label={t('devin_cli_login.title')}
            caption={t('devin_cli_login.api_key_label')}
            icon={resolveThemedIcon(DEVIN_CLI_ICON, resolvedTheme)}
            active={isOpen('devin-cli')}
            onOpen={openDevinCli}
          />
        </div>
      </Section>

      {dialogCard && (
        <OAuthFlowDialog
          open={dialogOpen && dialog?.kind === 'oauth'}
          providerId={dialogCard.id}
          heading={headingOf(dialogCard)}
          state={flows.states[dialogCard.id] ?? {}}
          text={(suffix) => flows.providerText(dialogCard.id, suffix)}
          supportsCallback={supportsManualCallback(dialogCard)}
          onStart={() => startFromDialog(dialogCard.id)}
          onAccountNameChange={
            dialogCard.id === CLAUDE_PROVIDER_ID
              ? (value) => flows.setAccountName(dialogCard.id, value)
              : undefined
          }
          onCancel={() => void flows.cancelAuth(dialogCard.id)}
          onCallbackChange={(value) => flows.setCallbackInput(dialogCard.id, value)}
          onCallbackSubmit={() => void flows.submitCallback(dialogCard.id)}
          onViewAuthFiles={viewAuthFiles}
          onClose={closeDialog}
        />
      )}

      <VertexImportDialog
        open={dialogOpen && dialog?.kind === 'vertex'}
        heading={{
          title: t('vertex_import.title'),
          caption: t('vertex_import.file_label'),
          icon: iconVertex,
        }}
        vertex={vertexImport.vertex}
        onPickFile={vertexImport.pickFile}
        onLocationChange={vertexImport.setLocation}
        onImport={() => void vertexImport.importCredential()}
        onImportAnother={vertexImport.resetForAnother}
        onViewAuthFiles={viewAuthFiles}
        onClose={closeDialog}
      />

      <ApiKeyImportDialog
        open={dialogOpen && dialog?.kind === 'opencode-go'}
        heading={{
          title: t('opencode_go_login.title'),
          caption: t('opencode_go_login.api_key_label'),
          icon: resolveThemedIcon(OPENCODE_GO_ICON, resolvedTheme),
        }}
        namespace="opencode_go_login"
        secretName="opencode-go-api-key"
        state={openCodeGoImport.openCodeGo}
        fields={[
          {
            id: 'email',
            type: 'email',
            value: openCodeGoImport.openCodeGo.email,
            onChange: (value) => openCodeGoImport.setField('email', value),
          },
        ]}
        onApiKeyChange={(value) => openCodeGoImport.setField('apiKey', value)}
        onToggleShowKey={openCodeGoImport.toggleShowKey}
        onSubmit={() => void openCodeGoImport.importCredential()}
        onViewAuthFiles={viewAuthFiles}
        onViewQuota={viewQuota}
        onClose={closeDialog}
      />

      <ApiKeyImportDialog
        open={dialogOpen && dialog?.kind === 'devin-cli'}
        heading={{
          title: t('devin_cli_login.title'),
          caption: t('devin_cli_login.api_key_label'),
          icon: resolveThemedIcon(DEVIN_CLI_ICON, resolvedTheme),
        }}
        namespace="devin_cli_login"
        secretName="devin-cli-api-key"
        state={devinCliImport.devinCli}
        fields={[
          {
            id: 'server_url',
            type: 'url',
            value: devinCliImport.devinCli.serverUrl,
            onChange: (value) => devinCliImport.setField('serverUrl', value),
          },
          {
            id: 'email',
            type: 'email',
            value: devinCliImport.devinCli.email,
            onChange: (value) => devinCliImport.setField('email', value),
          },
        ]}
        onApiKeyChange={(value) => devinCliImport.setField('apiKey', value)}
        onToggleShowKey={devinCliImport.toggleShowKey}
        onSubmit={() => void devinCliImport.importCredential()}
        onViewAuthFiles={viewAuthFiles}
        onViewQuota={viewQuota}
        onClose={closeDialog}
      />

      {siwcKey > 0 && (
        <SiwcBindDialog
          key={siwcKey}
          open={siwcOpen}
          onClose={() => setSiwcOpen(false)}
          onViewAuthFiles={viewAuthFiles}
        />
      )}
    </Page>
  );
}
