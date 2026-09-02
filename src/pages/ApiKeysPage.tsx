import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconAlertTriangle,
  IconCheckCircle2,
  IconKey,
  IconPencil,
  IconPlus,
  IconRefreshCw,
  IconTrash2,
} from '@/components/ui/icons';
import {
  clientApiKeysApi,
  type ClientApiKey,
  type ClientApiKeyInput,
  type ClientApiKeyOptions,
} from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import styles from './ApiKeysPage.module.scss';

const emptyOptions: ClientApiKeyOptions = { providers: [], models: [] };
const money = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 5,
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

function formatLimit(value: number, suffix: string): string {
  return value > 0 ? `${compact.format(value)} ${suffix}` : `Unlimited ${suffix}`;
}

export function ApiKeysPage() {
  const connected = useAuthStore((state) => state.connectionStatus === 'connected');
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
    return options.models.filter(
      (model) =>
        model.providers.some((provider) => providers.has(provider)) &&
        (!query || model.id.toLowerCase().includes(query))
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>ACCESS CONTROL</span>
          <h1>Client API keys</h1>
          <p>
            Issue scoped credentials, cap daily spend, and decide exactly which providers and models
            each key can use.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.refreshButton}
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            <IconRefreshCw size={17} className={loading ? styles.spinning : undefined} />
            Refresh
          </button>
          <button className={styles.createButton} type="button" onClick={openCreate}>
            <IconPlus size={18} />
            Generate key
          </button>
        </div>
      </header>

      {error && (
        <div className={styles.error}>
          <IconAlertTriangle size={18} />
          {error}
        </div>
      )}

      <section className={styles.summaryGrid} aria-label="API key summary">
        <article>
          <span>Total keys</span>
          <strong>{keys.length}</strong>
          <small>{activeKeys} currently enabled</small>
        </article>
        <article>
          <span>Spend today</span>
          <strong>{money.format(totalToday)}</strong>
          <small>Resets at 00:00 UTC</small>
        </article>
        <article>
          <span>Blocked now</span>
          <strong>{blockedKeys}</strong>
          <small>Disabled or at a configured limit</small>
        </article>
      </section>

      <section className={styles.keyList} aria-busy={loading}>
        {loading && keys.length === 0 ? (
          <div className={styles.loadingCard}>
            <span />
            <span />
            <span />
          </div>
        ) : !loading && keys.length === 0 ? (
          <div className={styles.emptyState}>
            <span>
              <IconKey size={24} />
            </span>
            <h2>No client keys yet</h2>
            <p>Generate a key and choose the providers, models, and limits it can use.</p>
            <Button onClick={openCreate}>
              <IconPlus size={17} /> Generate your first key
            </Button>
          </div>
        ) : (
          keys.map((key) => {
            const progress =
              key.daily_limit_usd > 0
                ? Math.min(100, (key.today_usd / key.daily_limit_usd) * 100)
                : 0;
            return (
              <article className={styles.keyCard} key={key.id}>
                <div className={styles.keyTopline}>
                  <div className={styles.keyIdentity}>
                    <span className={styles.keyIcon}>
                      <IconKey size={18} />
                    </span>
                    <div>
                      <div className={styles.nameLine}>
                        <h2>{key.name}</h2>
                        {!key.managed && <span className={styles.legacyBadge}>Unrestricted</span>}
                        {key.blocked ? (
                          <span className={styles.blockedBadge}>Blocked</span>
                        ) : (
                          <span className={styles.activeBadge}>Active</span>
                        )}
                      </div>
                      <code>{key.masked_key}</code>
                    </div>
                  </div>
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      onClick={() => openEdit(key)}
                      aria-label={`Edit ${key.name}`}
                    >
                      <IconPencil size={17} /> Edit
                    </button>
                    <button type="button" onClick={() => rotate(key)}>
                      Rotate
                    </button>
                    <button
                      className={styles.deleteButton}
                      type="button"
                      onClick={() => remove(key)}
                      aria-label={`Delete ${key.name}`}
                    >
                      <IconTrash2 size={17} />
                    </button>
                  </div>
                </div>

                <div className={styles.usageGrid}>
                  <div>
                    <span>Today</span>
                    <strong>{money.format(key.today_usd)}</strong>
                  </div>
                  <div>
                    <span>Requests</span>
                    <strong>{compact.format(key.today_requests)}</strong>
                  </div>
                  <div>
                    <span>Tokens</span>
                    <strong>{compact.format(key.today_tokens)}</strong>
                  </div>
                  <div>
                    <span>Rate</span>
                    <strong>{formatLimit(key.requests_per_minute, 'rpm')}</strong>
                  </div>
                </div>

                {key.daily_limit_usd > 0 && (
                  <div className={styles.budget}>
                    <div>
                      <span>Daily budget</span>
                      <strong>
                        {money.format(key.today_usd)} / {money.format(key.daily_limit_usd)}
                      </strong>
                    </div>
                    <span className={styles.budgetTrack}>
                      <span style={{ width: `${progress}%` }} />
                    </span>
                  </div>
                )}

                <div className={styles.scopeRow}>
                  <div>
                    <span>Providers</span>
                    <div>
                      {key.allowed_providers.length ? (
                        key.allowed_providers.map((provider) => <em key={provider}>{provider}</em>)
                      ) : (
                        <em>All providers</em>
                      )}
                    </div>
                  </div>
                  <div>
                    <span>Models</span>
                    <p>
                      {key.allowed_models.length
                        ? `${key.allowed_models.length} selected model${key.allowed_models.length === 1 ? '' : 's'}`
                        : 'All models in selected providers'}
                    </p>
                  </div>
                  <div>
                    <span>Daily caps</span>
                    <p>
                      {formatLimit(key.daily_request_limit, 'requests')} ·{' '}
                      {formatLimit(key.daily_token_limit, 'tokens')}
                    </p>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>

      <Modal
        open={editing !== undefined}
        onClose={() => !saving && setEditing(undefined)}
        closeDisabled={saving}
        width={720}
        title={editing ? `Edit ${editing.name}` : 'Generate client API key'}
        footer={
          <div className={styles.modalFooter}>
            <Button variant="ghost" onClick={() => setEditing(undefined)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {editing ? 'Save changes' : 'Generate key'}
            </Button>
          </div>
        }
      >
        <div className={styles.form}>
          <Input
            label="Key name"
            value={form.name}
            placeholder="Production app"
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <div className={styles.providerSection}>
            <div className={styles.fieldHeading}>
              <label>Allowed providers</label>
              <span>Select one or more upstream routes.</span>
            </div>
            <div className={styles.choiceGrid}>
              {options.providers.map((provider) => (
                <SelectionCheckbox
                  key={provider}
                  checked={form.allowed_providers.includes(provider)}
                  onChange={(value) => toggleProvider(provider, value)}
                  label={provider}
                />
              ))}
            </div>
          </div>
          <div className={styles.modelSection}>
            <div className={styles.fieldHeading}>
              <label>Allowed models</label>
              <span>
                Leave every model unchecked to allow all models from the selected providers.
              </span>
            </div>
            <Input
              aria-label="Search models"
              placeholder="Search models…"
              value={modelSearch}
              onChange={(event) => setModelSearch(event.target.value)}
            />
            <div className={styles.modelGrid}>
              {visibleModels.map((model) => (
                <SelectionCheckbox
                  key={model.id}
                  checked={form.allowed_models.includes(model.id)}
                  onChange={(value) => toggleModel(model.id, value)}
                  label={
                    <span>
                      <strong>{model.id}</strong>
                      <small>{model.providers.join(' · ')}</small>
                    </span>
                  }
                />
              ))}
              {visibleModels.length === 0 && (
                <p>No models match the selected providers and search.</p>
              )}
            </div>
          </div>
          <div className={styles.limitGrid}>
            <Input
              label="USD per day"
              type="number"
              min="0"
              step="0.01"
              value={form.daily_limit_usd}
              hint="0 = unlimited"
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
              hint="0 = unlimited"
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
              hint="0 = unlimited"
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
              hint="0 = unlimited"
              onChange={(event) =>
                setForm({ ...form, requests_per_minute: Number(event.target.value) })
              }
            />
          </div>
          <div className={styles.disableRow}>
            <div>
              <strong>Disable this key</strong>
              <span>Reject every request until you enable it again.</span>
            </div>
            <ToggleSwitch
              checked={form.disabled}
              onChange={(disabled) => setForm({ ...form, disabled })}
              ariaLabel="Disable this API key"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(revealedSecret)}
        onClose={() => setRevealedSecret('')}
        width={560}
        title="Your new API key"
      >
        <div className={styles.secretPanel}>
          <span className={styles.successIcon}>
            <IconCheckCircle2 size={22} />
          </span>
          <p>Copy this secret now. For security, it won’t be shown again.</p>
          <div>
            <code>{revealedSecret}</code>
            <Button onClick={() => void copySecret()}>Copy key</Button>
          </div>
          <Button variant="ghost" onClick={() => setRevealedSecret('')}>
            I’ve saved it
          </Button>
        </div>
      </Modal>
    </div>
  );
}
