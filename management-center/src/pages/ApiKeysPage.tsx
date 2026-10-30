import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { Skeleton } from '@/components/ui/Skeleton';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconAlertTriangle,
  IconPencil,
  IconPlus,
  IconRefreshCw,
  IconTrash2,
} from '@/components/ui/icons';
import { Meter } from '@/features/dashboard/components/Meter';
import { useRevealGroup } from '@/hooks/motion';
import {
  clientApiKeysApi,
  type ClientApiKey,
  type ClientApiKeyInput,
  type ClientApiKeyOptions,
} from '@/services/api';
import { useAuthStore, useNotificationStore, useThemeStore } from '@/stores';
import {
  getAuthFileIcon,
  getTypeLabel,
  normalizeProviderKey,
} from '@/features/authFiles/constants';
import { namedModels } from '@/utils/modelNames';
import styles from './ApiKeysPage.module.scss';

const emptyOptions: ClientApiKeyOptions = { providers: [], models: [] };
const money = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

function newKeyInput(provider = ''): ClientApiKeyInput {
  return {
    name: '',
    allowed_providers: provider ? [provider] : [],
    allowed_models: [],
    daily_limit_usd: 0,
    daily_request_limit: 0,
    daily_token_limit: 0,
    requests_per_minute: 0,
    disabled: false,
  };
}

function inputFromKey(key: ClientApiKey, options: ClientApiKeyOptions): ClientApiKeyInput {
  return {
    name: key.managed ? key.name : '',
    allowed_providers: key.allowed_providers.length > 0 ? key.allowed_providers : options.providers,
    allowed_models: key.allowed_models,
    daily_limit_usd: key.daily_limit_usd,
    daily_request_limit: key.daily_request_limit,
    daily_token_limit: key.daily_token_limit,
    requests_per_minute: key.requests_per_minute,
    disabled: key.disabled,
  };
}

export function ApiKeysPage() {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const connected = useAuthStore((state) => state.connectionStatus === 'connected');
  const revealRef = useRevealGroup<HTMLDivElement>();
  const { showNotification, showConfirmation } = useNotificationStore();
  const [keys, setKeys] = useState<ClientApiKey[]>([]);
  const [options, setOptions] = useState<ClientApiKeyOptions>(emptyOptions);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ClientApiKey | null | undefined>(undefined);
  const [form, setForm] = useState<ClientApiKeyInput>(newKeyInput());
  const [modelSearch, setModelSearch] = useState('');
  const [revealedSecret, setRevealedSecret] = useState('');

  const load = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError('');
    try {
      const response = await clientApiKeysApi.list();
      setKeys(Array.isArray(response.keys) ? response.keys : []);
      setOptions({
        providers: Array.isArray(response.options?.providers) ? response.options.providers : [],
        models: Array.isArray(response.options?.models) ? response.options.models : [],
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load client API keys.');
    } finally {
      setLoading(false);
    }
  }, [connected]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleModels = useMemo(() => {
    const providers = new Set(form.allowed_providers);
    const query = modelSearch.trim().toLowerCase();
    return namedModels(options.models).filter(
      (model) =>
        model.providers.some((provider) => providers.has(provider)) &&
        (!query || `${model.name} ${model.id}`.toLowerCase().includes(query))
    );
  }, [form.allowed_providers, modelSearch, options.models]);

  const totalToday = keys.reduce((sum, key) => sum + (key.today_usd || 0), 0);
  const activeKeys = keys.filter((key) => !key.disabled).length;
  const blockedKeys = keys.filter((key) => key.blocked).length;

  const openCreate = () => {
    setEditing(null);
    setForm(newKeyInput(options.providers[0] ?? ''));
    setModelSearch('');
  };

  const openEdit = (key: ClientApiKey) => {
    setEditing(key);
    setForm(inputFromKey(key, options));
    setModelSearch('');
  };

  const toggleProvider = (provider: string, selected: boolean) => {
    const providers = selected
      ? [...form.allowed_providers, provider]
      : form.allowed_providers.filter((item) => item !== provider);
    const validModels = new Set(
      options.models
        .filter((model) => model.providers.some((item) => providers.includes(item)))
        .map((model) => model.id)
    );
    setForm((current) => ({
      ...current,
      allowed_providers: providers,
      allowed_models: current.allowed_models.filter((model) => validModels.has(model)),
    }));
  };

  const toggleModel = (model: string, selected: boolean) => {
    setForm((current) => ({
      ...current,
      allowed_models: selected
        ? [...current.allowed_models, model]
        : current.allowed_models.filter((item) => item !== model),
    }));
  };

  const save = async () => {
    if (!form.name.trim()) {
      showNotification('Give this key a name.', 'warning');
      return;
    }
    if (form.allowed_providers.length === 0) {
      showNotification('Select at least one provider.', 'warning');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await clientApiKeysApi.update(editing.id, form);
        showNotification('API key policy updated.', 'success');
      } else {
        const response = await clientApiKeysApi.create(form);
        setRevealedSecret(response.api_key);
        showNotification('API key created.', 'success');
      }
      setEditing(undefined);
      await load();
    } catch (saveError) {
      showNotification(
        saveError instanceof Error ? saveError.message : 'Unable to save this API key.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(revealedSecret);
      showNotification('API key copied.', 'success');
    } catch {
      showNotification('Copy failed. Select the key and copy it manually.', 'warning');
    }
  };

  const rotate = (key: ClientApiKey) => {
    showConfirmation({
      title: `Rotate ${key.name}?`,
      message:
        'The current secret will stop working immediately. The policy and usage history stay intact.',
      confirmText: 'Rotate key',
      variant: 'danger',
      onConfirm: async () => {
        const response = await clientApiKeysApi.rotate(key.id);
        setRevealedSecret(response.api_key);
        showNotification('API key rotated.', 'success');
        await load();
      },
    });
  };

  const remove = (key: ClientApiKey) => {
    showConfirmation({
      title: `Delete ${key.name}?`,
      message:
        'Requests using this secret will fail immediately. Existing spending history remains in the ledger.',
      confirmText: 'Delete key',
      variant: 'danger',
      onConfirm: async () => {
        await clientApiKeysApi.remove(key.id);
        showNotification('API key deleted.', 'success');
        await load();
      },
    });
  };

  const providerLabel = (provider: string) => getTypeLabel(t, normalizeProviderKey(provider));
  const providerIcon = (provider: string) =>
    getAuthFileIcon(normalizeProviderKey(provider), resolvedTheme);

  return (
    <div className={styles.page} ref={revealRef}>
      <header className={styles.header}>
        <div className={styles.copy}>
          <h1 className={styles.title} data-reveal>
            Client API keys
          </h1>
          <p className={styles.meta} data-reveal>
            <span>
              {keys.length} {keys.length === 1 ? 'key' : 'keys'}
            </span>
            <span className={styles.metaDot} aria-hidden="true">
              ·
            </span>
            <span className={activeKeys > 0 ? styles.metaActive : styles.metaMuted}>
              {activeKeys} enabled
            </span>
            {blockedKeys > 0 && (
              <>
                <span className={styles.metaDot} aria-hidden="true">
                  ·
                </span>
                <span className={styles.metaProblem}>{blockedKeys} blocked</span>
              </>
            )}
            <span className={styles.metaDot} aria-hidden="true">
              ·
            </span>
            <span>{money.format(totalToday)} today</span>
          </p>
        </div>
        <div className={styles.actions} data-reveal>
          <button
            className={styles.ghostAction}
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            <IconRefreshCw size={14} className={loading ? styles.spinning : undefined} />
            Refresh
          </button>
          <button className={styles.primaryAction} type="button" onClick={openCreate}>
            <IconPlus size={15} />
            Generate key
          </button>
        </div>
      </header>

      {error && (
        <div className={styles.errorBanner} role="alert">
          <IconAlertTriangle size={15} />
          <span>{error}</span>
        </div>
      )}

      <section aria-busy={loading}>
        {loading && keys.length === 0 ? (
          <div className={styles.list} aria-hidden="true">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} height={44} className={styles.skeletonRow} />
            ))}
          </div>
        ) : !loading && keys.length === 0 ? (
          <EmptyState
            title="No client keys yet"
            action={
              <Button size="sm" onClick={openCreate}>
                <IconPlus size={14} /> Generate key
              </Button>
            }
          />
        ) : (
          <div className={styles.list}>
            <div className={styles.listHead} aria-hidden="true">
              <span>Key</span>
              <span>Access</span>
              <span>Spend today</span>
              <span className={styles.alignRight}>Requests · Tokens</span>
              <span />
            </div>
            {keys.map((key) => {
              const budgetUsed =
                key.daily_limit_usd > 0 ? (key.today_usd / key.daily_limit_usd) * 100 : null;
              const limits = [
                key.daily_request_limit > 0 &&
                  `${compact.format(key.daily_request_limit)} req/day`,
                key.daily_token_limit > 0 && `${compact.format(key.daily_token_limit)} tok/day`,
                key.requests_per_minute > 0 && `${compact.format(key.requests_per_minute)} rpm`,
              ].filter(Boolean);
              return (
                <article
                  className={`${styles.row} ${key.disabled ? styles.rowDisabled : ''}`}
                  key={key.id}
                >
                  <div className={styles.who}>
                    <span className={styles.name}>{key.name}</span>
                    <span className={styles.rowMeta}>
                      {key.managed && <code>{key.masked_key}</code>}
                      {key.disabled ? (
                        <span className={styles.stateOff}>Disabled</span>
                      ) : key.blocked ? (
                        <span className={styles.stateBlocked} title={key.block_reason}>
                          Blocked
                        </span>
                      ) : null}
                    </span>
                  </div>

                  <div className={styles.access}>
                    {key.managed ? (
                      <span className={styles.providers}>
                        {key.allowed_providers.map((provider) => {
                          const icon = providerIcon(provider);
                          return (
                            <span className={styles.provider} key={provider} title={providerLabel(provider)}>
                              {icon ? <img src={icon} alt="" /> : null}
                              {providerLabel(provider)}
                            </span>
                          );
                        })}
                      </span>
                    ) : (
                      <span className={styles.unrestricted}>Unrestricted</span>
                    )}
                    <span className={styles.accessHint}>
                      {key.allowed_models.length
                        ? `${key.allowed_models.length} model${key.allowed_models.length === 1 ? '' : 's'}`
                        : 'All models'}
                      {limits.length > 0 && ` · ${limits.join(' · ')}`}
                    </span>
                  </div>

                  <div className={styles.spend}>
                    <span className={styles.spendHead}>
                      <strong>{money.format(key.today_usd)}</strong>
                      {key.daily_limit_usd > 0 && (
                        <span>of {money.format(key.daily_limit_usd)}</span>
                      )}
                    </span>
                    {budgetUsed !== null && (
                      <Meter
                        value={budgetUsed}
                        tone={budgetUsed >= 100 ? 'critical' : budgetUsed >= 80 ? 'warning' : 'good'}
                        ariaLabel={`${key.name} daily budget used`}
                      />
                    )}
                  </div>

                  <div className={styles.counts}>
                    {compact.format(key.today_requests)}
                    <span className={styles.countDivider}>·</span>
                    {compact.format(key.today_tokens)}
                  </div>

                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => openEdit(key)}
                      aria-label={`Edit ${key.name}`}
                      title="Edit"
                    >
                      <IconPencil size={15} />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => rotate(key)}
                      aria-label={`Rotate ${key.name}`}
                      title="Rotate secret"
                    >
                      <IconRefreshCw size={15} />
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                      onClick={() => remove(key)}
                      aria-label={`Delete ${key.name}`}
                      title="Delete"
                    >
                      <IconTrash2 size={15} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <Modal
        open={editing !== undefined}
        onClose={() => !saving && setEditing(undefined)}
        closeDisabled={saving}
        width={640}
        title={editing ? `Edit ${editing.name}` : 'New API key'}
        footer={
          <div className={styles.modalFooter}>
            <Button variant="ghost" onClick={() => setEditing(undefined)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {editing ? 'Save' : 'Generate key'}
            </Button>
          </div>
        }
      >
        <div className={styles.form}>
          <Input
            label="Name"
            value={form.name}
            placeholder="Production app"
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />

          <fieldset className={styles.fieldset}>
            <legend>Providers</legend>
            <div className={styles.providerChoices}>
              {options.providers.map((provider) => {
                const selected = form.allowed_providers.includes(provider);
                const icon = providerIcon(provider);
                return (
                  <button
                    key={provider}
                    type="button"
                    className={`${styles.providerChoice} ${selected ? styles.providerChoiceOn : ''}`}
                    aria-pressed={selected}
                    onClick={() => toggleProvider(provider, !selected)}
                  >
                    {icon ? <img src={icon} alt="" /> : null}
                    {providerLabel(provider)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>
              Models
              <span className={styles.legendHint}>
                {form.allowed_models.length
                  ? `${form.allowed_models.length} selected`
                  : 'None selected allows all'}
              </span>
            </legend>
            <Input
              aria-label="Search models"
              placeholder="Search models"
              value={modelSearch}
              onChange={(event) => setModelSearch(event.target.value)}
            />
            <div className={styles.modelList}>
              {visibleModels.map((model) => (
                <SelectionCheckbox
                  key={model.id}
                  className={styles.modelRow}
                  labelClassName={styles.modelLabel}
                  checked={form.allowed_models.includes(model.id)}
                  onChange={(value) => toggleModel(model.id, value)}
                  label={
                    <>
                      <span className={styles.modelName}>{model.name}</span>
                      {model.name !== model.id && (
                        <code className={styles.modelId}>{model.id}</code>
                      )}
                    </>
                  }
                />
              ))}
              {visibleModels.length === 0 && (
                <p className={styles.modelEmpty}>No models match.</p>
              )}
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>
              Limits
              <span className={styles.legendHint}>0 means no limit</span>
            </legend>
            <div className={styles.limitGrid}>
              <Input
                label="USD per day"
                type="number"
                min="0"
                step="0.01"
                value={form.daily_limit_usd}
                onChange={(event) =>
                  setForm({ ...form, daily_limit_usd: Number(event.target.value) })
                }
              />
              <Input
                label="Requests per day"
                type="number"
                min="0"
                step="1"
                value={form.daily_request_limit}
                onChange={(event) =>
                  setForm({ ...form, daily_request_limit: Number(event.target.value) })
                }
              />
              <Input
                label="Tokens per day"
                type="number"
                min="0"
                step="1"
                value={form.daily_token_limit}
                onChange={(event) =>
                  setForm({ ...form, daily_token_limit: Number(event.target.value) })
                }
              />
              <Input
                label="Requests per minute"
                type="number"
                min="0"
                step="1"
                value={form.requests_per_minute}
                onChange={(event) =>
                  setForm({ ...form, requests_per_minute: Number(event.target.value) })
                }
              />
            </div>
          </fieldset>

          <div className={styles.enableRow}>
            <span>Enabled</span>
            <ToggleSwitch
              checked={!form.disabled}
              onChange={(enabled) => setForm({ ...form, disabled: !enabled })}
              ariaLabel="Enable this API key"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(revealedSecret)}
        onClose={() => setRevealedSecret('')}
        width={520}
        title="Copy your API key"
        footer={
          <div className={styles.modalFooter}>
            <Button variant="ghost" onClick={() => setRevealedSecret('')}>
              Done
            </Button>
            <Button onClick={() => void copySecret()}>Copy key</Button>
          </div>
        }
      >
        <div className={styles.secretPanel}>
          <code>{revealedSecret}</code>
          <p>It won't be shown again.</p>
        </div>
      </Modal>
    </div>
  );
}
