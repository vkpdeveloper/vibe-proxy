import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Page } from '@/components/layout/Page';
import { OAuthEditorProviderCard } from '@/features/authFiles/components/OAuthEditorProviderCard';
import {
  ExcludedModelsPicker,
  normalizeExcludedRules,
  type ExcludedModelsCatalogState,
} from '@/components/excludedModels';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useAuthStore, useNotificationStore } from '@/stores';
import { authFilesApi } from '@/services/api';
import { buildOAuthProviderOptions, normalizeProviderKey } from '@/features/authFiles/constants';
import { getStringSetSignature, isOAuthEditorDirty } from '@/features/authFiles/oauthEditorState';
import type { AuthFileItem, OAuthModelAliasEntry } from '@/types';
import { getErrorMessage } from '@/utils/helpers';

type AuthFileModelItem = { id: string; display_name?: string; type?: string; owned_by?: string };

type LocationState = { fromAuthFiles?: boolean } | null;

export function AuthFilesOAuthExcludedEditPage() {
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
  const [excludedUnsupported, setExcludedUnsupported] = useState(false);
  const loadRequestRef = useRef(0);

  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
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
    return Object.prototype.hasOwnProperty.call(excluded, resolvedProviderKey);
  }, [excluded, resolvedProviderKey]);
  const baselineModelsSignature = useMemo(
    () => getStringSetSignature(normalizeExcludedRules(excluded[resolvedProviderKey] ?? [])),
    [excluded, resolvedProviderKey]
  );
  /** 规则集就是选中集本身——「待添加的自定义规则」随 Add 按钮一起消失了。 */
  const effectiveRules = useMemo(() => normalizeExcludedRules(selectedModels), [selectedModels]);
  const effectiveRulesSignature = useMemo(
    () => getStringSetSignature(effectiveRules),
    [effectiveRules]
  );
  const contentDirty = baselineModelsSignature !== effectiveRulesSignature;
  const candidates = useMemo(
    () => modelsList.map((model) => ({ id: model.id, displayName: model.display_name })),
    [modelsList]
  );
  const catalogState: ExcludedModelsCatalogState = modelsLoading
    ? 'loading'
    : modelsError === 'unsupported'
      ? 'unavailable'
      : 'ready';
  const isDirty = isOAuthEditorDirty(
    initialProviderKey,
    provider,
    baselineModelsSignature,
    effectiveRulesSignature
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

  const title = useMemo(() => {
    if (isEditing) {
      return t('oauth_excluded.edit_title', { provider: provider.trim() || resolvedProviderKey });
    }
    return t('oauth_excluded.add_title');
  }, [isEditing, provider, resolvedProviderKey, t]);

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
    setExcludedUnsupported(false);

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

      if (aliasResult.status === 'fulfilled') {
        setModelAlias(aliasResult.value ?? {});
      }

      if (excludedResult.status === 'fulfilled') {
        setExcluded(excludedResult.value ?? {});
        setBaselineReady(true);
        return;
      }

      const err = excludedResult.reason;
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? (err as { status?: unknown }).status
          : undefined;

      if (status === 404) {
        setExcludedUnsupported(true);
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
      setSelectedModels(new Set());
      return;
    }
    const existing = excluded[resolvedProviderKey] ?? [];
    setSelectedModels(new Set(normalizeExcludedRules(existing)));
  }, [excluded, resolvedProviderKey]);

  useEffect(() => {
    if (!resolvedProviderKey || excludedUnsupported) {
      setModelsList([]);
      setModelsError(null);
      setModelsLoading(false);
      return;
    }

    let cancelled = false;
    setModelsList([]);
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
  }, [excludedUnsupported, resolvedProviderKey, showNotification, t]);

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

  const handleRulesChange = useCallback((next: string[]) => {
    setSelectedModels(new Set(next));
  }, []);

  const handleSave = useCallback(async () => {
    const normalizedProvider = normalizeProviderKey(provider);
    if (!normalizedProvider) {
      showNotification(t('oauth_excluded.provider_required'), 'error');
      return;
    }

    const models = effectiveRules;
    setSaving(true);
    try {
      if (models.length) {
        await authFilesApi.saveOauthExcludedModels(normalizedProvider, models);
      } else if (isEditing) {
        await authFilesApi.deleteOauthExcludedEntry(normalizedProvider);
      }
      showNotification(t('oauth_excluded.save_success'), 'success');
      allowNextNavigation();
      handleBack();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('oauth_excluded.save_failed')}: ${errorMessage}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [allowNextNavigation, effectiveRules, handleBack, isEditing, provider, showNotification, t]);

  const canSave =
    !disableControls &&
    !saving &&
    baselineReady &&
    !excludedUnsupported &&
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
              className="h-9 px-3 max-sm:w-9 max-sm:px-0"
              onClick={handleBack}
              aria-label={t('common.back')}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.75} data-icon="inline-start" />
              <span className="max-sm:hidden">{t('common.back')}</span>
            </Button>
            <Button size="lg" className="h-9 px-4" onClick={handleSave} disabled={!canSave}>
              {t('oauth_excluded.save')}
            </Button>
          </div>
        }
      >
        {initialLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : excludedUnsupported ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>{t('oauth_excluded.upgrade_required_title')}</EmptyTitle>
              <EmptyDescription>{t('oauth_excluded.upgrade_required_desc')}</EmptyDescription>
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
              translationPrefix="oauth_excluded"
            />
            <section className="flex flex-col gap-5">
              <div className="flex min-h-9 items-center justify-between gap-3">
                <h2
                  className="text-lg font-semibold tracking-tight"
                  id="oauth-excluded-models-label"
                >
                  {t('oauth_excluded.models_label')}
                </h2>
                {resolvedProviderKey && (
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {t('excluded_models.trigger_summary_rules', { n: effectiveRules.length })}
                  </span>
                )}
              </div>
              {resolvedProviderKey ? (
                <ExcludedModelsPicker
                  value={effectiveRules}
                  onChange={handleRulesChange}
                  candidates={candidates}
                  catalogState={catalogState}
                  disabled={disableControls || saving}
                  labelledBy="oauth-excluded-models-label"
                />
              ) : (
                <Empty className="border border-dashed p-6 md:p-6">
                  <EmptyHeader>
                    <EmptyDescription>{t('oauth_excluded.provider_required')}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </section>
          </>
        )}
      </Page>
    </div>
  );
}
