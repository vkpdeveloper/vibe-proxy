import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Page, Section } from '@/components/layout/Page';
import { OAuthEditorProviderCard } from '@/features/authFiles/components/OAuthEditorProviderCard';
import { OAuthAliasMappingRow } from '@/features/authFiles/components/OAuthAliasMappingRow';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useAuthStore, useNotificationStore } from '@/stores';
import { authFilesApi } from '@/services/api';
import { buildOAuthProviderOptions, normalizeProviderKey } from '@/features/authFiles/constants';
import {
  getModelAliasDraftSignature,
  isOAuthEditorDirty,
} from '@/features/authFiles/oauthEditorState';
import type { AuthFileItem, OAuthModelAliasEntry } from '@/types';
import { generateId, getErrorMessage } from '@/utils/helpers';

type AuthFileModelItem = { id: string; display_name?: string; type?: string; owned_by?: string };

type LocationState = { fromAuthFiles?: boolean } | null;

type OAuthModelMappingFormEntry = OAuthModelAliasEntry & { id: string };

const buildEmptyMappingEntry = (): OAuthModelMappingFormEntry => ({
  id: generateId(),
  name: '',
  alias: '',
  fork: true,
});

const normalizeMappingEntries = (
  entries?: OAuthModelAliasEntry[]
): OAuthModelMappingFormEntry[] => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [buildEmptyMappingEntry()];
  }
  return entries.map((entry) => ({
    id: generateId(),
    name: entry.name ?? '',
    alias: entry.alias ?? '',
    fork: Boolean(entry.fork),
    forceMapping: entry.forceMapping,
  }));
};

export function AuthFilesOAuthModelAliasEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { showConfirmation, showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const disableControls = connectionStatus !== 'connected';

  const [searchParams, setSearchParams] = useSearchParams();
  const providerFromParams = searchParams.get('provider') ?? '';
  const [initialProviderKey] = useState(() => normalizeProviderKey(providerFromParams));

  const [provider, setProvider] = useState(providerFromParams);
  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [modelAlias, setModelAlias] = useState<Record<string, OAuthModelAliasEntry[]>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [baselineReady, setBaselineReady] = useState(false);
  const [modelAliasUnsupported, setModelAliasUnsupported] = useState(false);
  const loadRequestRef = useRef(0);

  const [mappings, setMappings] = useState<OAuthModelMappingFormEntry[]>([
    buildEmptyMappingEntry(),
  ]);
  const [modelsList, setModelsList] = useState<AuthFileModelItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<'unsupported' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProvider(providerFromParams);
  }, [providerFromParams]);

  const providerOptions = useMemo(() => {
    const extraProviders = new Set<string>();
    Object.keys(excluded).forEach((value) => extraProviders.add(value));
    Object.keys(modelAlias).forEach((value) => extraProviders.add(value));
    files.forEach((file) => {
      if (typeof file.type === 'string') {
        extraProviders.add(file.type);
      }
      if (typeof file.provider === 'string') {
        extraProviders.add(file.provider);
      }
    });

    return buildOAuthProviderOptions(extraProviders);
  }, [excluded, files, modelAlias]);

  const resolvedProviderKey = useMemo(() => normalizeProviderKey(provider), [provider]);
  const isEditing = useMemo(() => {
    if (!resolvedProviderKey) return false;
    return Object.prototype.hasOwnProperty.call(modelAlias, resolvedProviderKey);
  }, [modelAlias, resolvedProviderKey]);
  const baselineMappingsSignature = useMemo(
    () => getModelAliasDraftSignature(modelAlias[resolvedProviderKey] ?? []),
    [modelAlias, resolvedProviderKey]
  );
  const mappingsSignature = useMemo(() => getModelAliasDraftSignature(mappings), [mappings]);
  const contentDirty = baselineMappingsSignature !== mappingsSignature;
  const isDirty = isOAuthEditorDirty(
    initialProviderKey,
    provider,
    baselineMappingsSignature,
    mappingsSignature
  );
  const unsavedChangesDialog = useMemo(
    () => ({
      title: t('common.unsaved_changes_title'),
      message: t('common.unsaved_changes_message'),
      confirmText: t('common.leave'),
      cancelText: t('common.stay'),
    }),
    [t]
  );
  const { allowNextNavigation, allowNavigationTo } = useUnsavedChangesGuard({
    shouldBlock: isDirty,
    dialog: unsavedChangesDialog,
  });
  const title = isEditing
    ? t('oauth_model_alias.edit_title', { provider: provider.trim() || resolvedProviderKey })
    : t('oauth_model_alias.add_title');
  const headerHint = useMemo(() => {
    if (!provider.trim()) {
      return t('oauth_model_alias.provider_hint');
    }
    if (modelsLoading) {
      return t('oauth_model_alias.model_source_loading');
    }
    if (modelsError === 'unsupported') {
      return t('oauth_model_alias.model_source_unsupported');
    }
    return t('oauth_model_alias.model_source_loaded', { count: modelsList.length });
  }, [modelsError, modelsList.length, modelsLoading, provider, t]);

  const handleBack = useCallback(() => {
    const state = location.state as LocationState;
    if (state?.fromAuthFiles) {
      navigate(-1);
      return;
    }
    navigate('/auth-files', { replace: true });
  }, [location.state, navigate]);

  const swipeRef = useEdgeSwipeBack({ onBack: handleBack });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBack]);

  const loadInitialData = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setInitialLoading(true);
    setInitialLoadError(null);
    setBaselineReady(false);
    setModelAliasUnsupported(false);

    try {
      const [filesResult, excludedResult, aliasResult] = await Promise.allSettled([
        authFilesApi.list(),
        authFilesApi.getOauthExcludedModels(),
        authFilesApi.getOauthModelAlias(),
      ]);

      if (requestId !== loadRequestRef.current) return;

      if (filesResult.status === 'fulfilled') {
        setFiles(filesResult.value?.files ?? []);
      }

      if (excludedResult.status === 'fulfilled') {
        setExcluded(excludedResult.value ?? {});
      }

      if (aliasResult.status === 'fulfilled') {
        setModelAlias(aliasResult.value ?? {});
        setBaselineReady(true);
        return;
      }

      const err = aliasResult.reason;
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? (err as { status?: unknown }).status
          : undefined;

      if (status === 404) {
        setModelAliasUnsupported(true);
        return;
      }
      setInitialLoadError(getErrorMessage(err));
    } catch (err: unknown) {
      if (requestId === loadRequestRef.current) {
        setInitialLoadError(getErrorMessage(err));
      }
    } finally {
      if (requestId === loadRequestRef.current) {
        setInitialLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadInitialData();
    return () => {
      loadRequestRef.current += 1;
    };
  }, [loadInitialData]);

  useEffect(() => {
    if (!resolvedProviderKey) {
      setMappings([buildEmptyMappingEntry()]);
      return;
    }
    const existing = modelAlias[resolvedProviderKey] ?? [];
    setMappings(normalizeMappingEntries(existing));
  }, [modelAlias, resolvedProviderKey]);

  useEffect(() => {
    if (!resolvedProviderKey || modelAliasUnsupported) {
      setModelsList([]);
      setModelsError(null);
      setModelsLoading(false);
      return;
    }

    let cancelled = false;
    setModelsLoading(true);
    setModelsError(null);

    authFilesApi
      .getModelDefinitions(resolvedProviderKey)
      .then((models) => {
        if (cancelled) return;
        setModelsList(models);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status =
          typeof err === 'object' && err !== null && 'status' in err
            ? (err as { status?: unknown }).status
            : undefined;

        if (status === 400 || status === 404) {
          setModelsList([]);
          setModelsError('unsupported');
          return;
        }

        const errorMessage = err instanceof Error ? err.message : '';
        showNotification(`${t('notification.load_failed')}: ${errorMessage}`, 'error');
      })
      .finally(() => {
        if (cancelled) return;
        setModelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [modelAliasUnsupported, resolvedProviderKey, showNotification, t]);

  const applyProviderChange = useCallback(
    (value: string) => {
      setProvider(value);
      const next = new URLSearchParams(searchParams);
      const trimmed = value.trim();
      if (trimmed) {
        next.set('provider', trimmed);
      } else {
        next.delete('provider');
      }
      const nextSearch = next.toString();
      allowNavigationTo(
        `${location.pathname}${nextSearch ? `?${nextSearch}` : ''}${location.hash}`
      );
      setSearchParams(next, { replace: true });
    },
    [allowNavigationTo, location.hash, location.pathname, searchParams, setSearchParams]
  );

  const updateProvider = useCallback(
    (value: string) => {
      if (!contentDirty || normalizeProviderKey(value) === resolvedProviderKey) {
        applyProviderChange(value);
        return;
      }
      showConfirmation({
        ...unsavedChangesDialog,
        variant: 'danger',
        onConfirm: () => applyProviderChange(value),
      });
    },
    [applyProviderChange, contentDirty, resolvedProviderKey, showConfirmation, unsavedChangesDialog]
  );

  const updateMappingEntry = useCallback(
    (index: number, field: keyof OAuthModelAliasEntry, value: string | boolean) => {
      setMappings((prev) =>
        prev.map((entry, idx) => (idx === index ? { ...entry, [field]: value } : entry))
      );
    },
    []
  );

  const addMappingEntry = useCallback(() => {
    setMappings((prev) => [...prev, buildEmptyMappingEntry()]);
  }, []);

  const removeMappingEntry = useCallback((index: number) => {
    setMappings((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      return next.length ? next : [buildEmptyMappingEntry()];
    });
  }, []);

  const handleSave = useCallback(async () => {
    const channel = normalizeProviderKey(provider);
    if (!channel) {
      showNotification(t('oauth_model_alias.provider_required'), 'error');
      return;
    }

    const seenAlias = new Set<string>();
    let hasDuplicateAlias = false;
    const normalized = mappings
      .map((entry) => {
        const name = String(entry.name ?? '').trim();
        const alias = String(entry.alias ?? '').trim();
        if (!name || !alias) return null;
        const aliasKey = alias.toLowerCase();
        if (seenAlias.has(aliasKey)) {
          hasDuplicateAlias = true;
          return null;
        }
        seenAlias.add(aliasKey);
        const normalizedEntry: OAuthModelAliasEntry = { name, alias };
        if (entry.fork) normalizedEntry.fork = true;
        if (typeof entry.forceMapping === 'boolean') {
          normalizedEntry.forceMapping = entry.forceMapping;
        }
        return normalizedEntry;
      })
      .filter(Boolean) as OAuthModelAliasEntry[];

    if (hasDuplicateAlias) {
      showNotification(t('oauth_model_alias.duplicate_alias'), 'error');
      return;
    }

    setSaving(true);
    try {
      if (normalized.length) {
        await authFilesApi.saveOauthModelAlias(channel, normalized);
      } else if (isEditing) {
        await authFilesApi.deleteOauthModelAlias(channel);
      }
      showNotification(t('oauth_model_alias.save_success'), 'success');
      allowNextNavigation();
      handleBack();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('oauth_model_alias.save_failed')}: ${errorMessage}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [allowNextNavigation, handleBack, isEditing, mappings, provider, showNotification, t]);

  const canSave =
    !disableControls &&
    !saving &&
    baselineReady &&
    !modelAliasUnsupported &&
    initialLoadError === null;

  return (
    <div ref={swipeRef} className="h-full">
      <Page
        title={title}
        actions={
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="lg"
              className="h-9 px-3 max-sm:w-9 max-sm:px-0!"
              onClick={handleBack}
              aria-label={t('common.back')}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.75} data-icon="inline-start" />
              <span className="max-sm:hidden">{t('common.back')}</span>
            </Button>
            <Button size="lg" className="h-9 px-4" onClick={handleSave} disabled={!canSave}>
              {t('oauth_model_alias.save')}
            </Button>
          </div>
        }
      >
        {initialLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : modelAliasUnsupported ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>{t('oauth_model_alias.upgrade_required_title')}</EmptyTitle>
              <EmptyDescription>{t('oauth_model_alias.upgrade_required_desc')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : initialLoadError !== null ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>{t('notification.refresh_failed')}</EmptyTitle>
              <EmptyDescription>
                {initialLoadError || t('notification.refresh_failed')}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => void loadInitialData()}>
                {t('common.refresh')}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <OAuthEditorProviderCard
              provider={provider}
              options={providerOptions}
              onChange={updateProvider}
              disabled={disableControls || saving}
              translationPrefix="oauth_model_alias"
            />
            <Section
              title={t('oauth_model_alias.alias_label')}
              actions={
                <Button
                  variant="outline"
                  onClick={addMappingEntry}
                  disabled={disableControls || saving || modelAliasUnsupported}
                >
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} data-icon="inline-start" />
                  {t('oauth_model_alias.add_alias')}
                </Button>
              }
            >
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">{headerHint}</p>
                <div className="flex flex-col divide-y rounded-xl border">
                  {mappings.map((entry, index) => (
                    <OAuthAliasMappingRow
                      key={entry.id}
                      entry={entry}
                      index={index}
                      options={modelsList.map((model) => ({
                        value: model.id,
                        label:
                          model.display_name && model.display_name !== model.id
                            ? model.display_name
                            : undefined,
                      }))}
                      disabled={disableControls || saving}
                      canRemove={mappings.length > 1}
                      onChange={(field, value) => updateMappingEntry(index, field, value)}
                      onRemove={() => removeMappingEntry(index)}
                    />
                  ))}
                </div>
              </div>
            </Section>
          </>
        )}
      </Page>
    </div>
  );
}
