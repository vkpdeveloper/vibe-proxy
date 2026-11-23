import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  Alert02Icon,
  Analytics01Icon,
  ArrowReloadHorizontalIcon,
  Delete02Icon,
  Key01Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  RefreshIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CopyButton } from '@/components/ui/copy-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Private } from '@/components/ui/private';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Hint } from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Page } from '@/components/layout/Page';
import { usePhone } from '@/components/layout/pageBar';
import { cn } from '@/lib/utils';
import { Meter } from '@/features/dashboard/components/Meter';
import { formatUsd, spendToday } from '@/features/dashboard/components/spend';
import { useAction } from '@/hooks/use-action';
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
import { formatCompactNumber } from '@/utils/format';
import { namedModels } from '@/utils/modelNames';

const emptyOptions: ClientApiKeyOptions = { providers: [], models: [] };
const wholeUsd = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
}).format;
/** Limits are usually round numbers, so "$100" reads better than "$100.00". */
const formatLimitUsd = (value: number) =>
  Number.isInteger(value) ? wholeUsd(value) : formatUsd(value);
/**
 * Usage takes the same stable key id its key picker uses. Cards show today's numbers,
 * so the link opens today's range to match them.
 */
const usagePath = (key: ClientApiKey) => `/usage?key=${encodeURIComponent(key.id)}&range=today`;

type NumberField =
  'daily_limit_usd' | 'daily_request_limit' | 'daily_token_limit' | 'requests_per_minute';

const LIMIT_FIELDS: Array<{ field: NumberField; label: string; step: string }> = [
  { field: 'daily_limit_usd', label: 'USD per day', step: '0.01' },
  { field: 'daily_request_limit', label: 'Requests per day', step: '1' },
  { field: 'daily_token_limit', label: 'Tokens per day', step: '1' },
  { field: 'requests_per_minute', label: 'Requests per minute', step: '1' },
];

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

/** Rotate and delete both ask first; this holds which one and for which key. */
type PendingConfirm = { kind: 'rotate' | 'delete'; key: ClientApiKey };

export function ApiKeysPage() {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const connected = useAuthStore((state) => state.connectionStatus === 'connected');
  const { showNotification } = useNotificationStore();
  const [keys, setKeys] = useState<ClientApiKey[]>([]);
  const [options, setOptions] = useState<ClientApiKeyOptions>(emptyOptions);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ClientApiKey | null | undefined>(undefined);
  const [form, setForm] = useState<ClientApiKeyInput>(newKeyInput());
  const [modelSearch, setModelSearch] = useState('');
  const [revealedSecret, setRevealedSecret] = useState('');
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const confirmAction = useAction();
  const phone = usePhone();
  const navigate = useNavigate();
  // Config links here with this state; going back returns to the setting it came from.
  const fromConfig = (useLocation().state as { from?: string } | null)?.from === 'config';

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

  // Dropping a provider also drops the selected models only it could serve.
  const setProviders = (providers: string[]) => {
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

  // The submit button stays disabled until this holds, which also blocks Enter-to-submit.
  const formValid = form.name.trim() !== '' && form.allowed_providers.length > 0;

  const save = async () => {
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

  const runConfirm = async ({ kind, key }: PendingConfirm) => {
    const ok = await confirmAction.run(async () => {
      if (kind === 'rotate') {
        const response = await clientApiKeysApi.rotate(key.id);
        setRevealedSecret(response.api_key);
        showNotification('API key rotated.', 'success');
      } else {
        await clientApiKeysApi.remove(key.id);
        showNotification('API key deleted.', 'success');
      }
      await load();
    });
    if (ok) setConfirm(null);
  };

  const providerLabel = (provider: string) => getTypeLabel(t, normalizeProviderKey(provider));
  const providerIcon = (provider: string) =>
    getAuthFileIcon(normalizeProviderKey(provider), resolvedTheme);

  const stats = [
    { label: 'Keys', value: keys.length.toLocaleString() },
    { label: 'Enabled', value: activeKeys.toLocaleString(), dot: activeKeys > 0 && 'bg-success' },
    {
      label: 'Blocked',
      value: blockedKeys.toLocaleString(),
      dot: blockedKeys > 0 && 'bg-destructive',
    },
    { label: 'Spend today', value: formatUsd(spendToday(keys)) },
  ];

  return (
    <>
      <Page
        title={t('nav.client_api_keys')}
        onBack={fromConfig ? () => navigate(-1) : undefined}
        actions={
          <div className="flex shrink-0 items-center gap-2">
            <Hint label={t('common.refresh')}>
              <Button
                variant={phone ? 'ghost' : 'outline'}
                size="icon-lg"
                className="max-sm:size-10"
                aria-label={t('common.refresh')}
                disabled={loading}
                onClick={() => void load()}
              >
                <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} />
              </Button>
            </Hint>
            <Hint label="Generate key">
              <Button
                size="lg"
                className="h-9 px-3 max-sm:size-10 max-sm:px-0!"
                aria-label="Generate key"
                onClick={openCreate}
              >
                <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" strokeWidth={2} />
                <span className="max-sm:hidden">Generate key</span>
              </Button>
            </Hint>
          </div>
        }
      >
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive"
          >
            <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0" strokeWidth={1.75} />
            {error}
          </div>
        )}

        <section aria-busy={loading} className="flex flex-col gap-4">
          {/* Phone: one line, spend first. The grid of boxes takes half the screen there. */}
          <div className="flex items-end justify-between gap-3 sm:hidden">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] text-muted-foreground">Spend today</span>
              <span className="truncate text-2xl font-medium tracking-tight">
                {formatUsd(spendToday(keys))}
              </span>
            </div>
            <span className="shrink-0 pb-1 text-[13px] text-muted-foreground">
              {keys.length} keys, {activeKeys} enabled
              {blockedKeys > 0 && <span className="text-destructive">, {blockedKeys} blocked</span>}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-px overflow-hidden rounded-xl border bg-border max-sm:hidden">
            {stats.map((stat) => (
              <div key={stat.label} className="flex min-w-0 flex-col gap-1.5 bg-card p-4">
                <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  {stat.dot && <span className={`size-2 rounded-full ${stat.dot}`} />}
                  {stat.label}
                </span>
                <span className="truncate font-mono text-2xl tracking-tight tabular-nums">
                  {stat.value}
                </span>
              </div>
            ))}
          </div>

          {loading && keys.length === 0 ? (
            <div className="flex flex-col gap-2" aria-hidden="true">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-[74px] rounded-lg" />
              ))}
            </div>
          ) : !loading && keys.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={Key01Icon} strokeWidth={1.75} />
                </EmptyMedia>
                <EmptyTitle>No client keys yet</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <Button size="lg" className="px-4" onClick={openCreate}>
                  <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" strokeWidth={2} />
                  Generate key
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <ItemGroup className="gap-2 max-sm:gap-0 max-sm:overflow-hidden max-sm:rounded-xl max-sm:border">
              {keys.map((key) => {
                const budgetUsed =
                  key.daily_limit_usd > 0 ? (key.today_usd / key.daily_limit_usd) * 100 : null;
                const limits = [
                  key.daily_request_limit > 0 &&
                    `${formatCompactNumber(key.daily_request_limit)} req/day`,
                  key.daily_token_limit > 0 &&
                    `${formatCompactNumber(key.daily_token_limit)} tok/day`,
                  key.requests_per_minute > 0 &&
                    `${formatCompactNumber(key.requests_per_minute)} rpm`,
                ].filter(Boolean);
                const unused = key.today_requests === 0;
                return (
                  <Item
                    key={key.id}
                    variant="outline"
                    className={cn(
                      'relative transition-colors hover:bg-muted/30 max-sm:rounded-none max-sm:border-0 max-sm:border-b max-sm:p-4 max-sm:last:border-b-0 max-sm:active:bg-muted/40',
                      key.disabled && 'opacity-60'
                    )}
                  >
                    <ItemMedia variant="icon" className="max-sm:hidden">
                      <HugeiconsIcon icon={Key01Icon} strokeWidth={1.75} />
                    </ItemMedia>
                    <ItemContent className="min-w-0 max-sm:flex-row max-sm:flex-wrap max-sm:items-center max-sm:gap-x-2 max-sm:pr-9">
                      <ItemTitle className="max-w-full max-sm:basis-full">
                        {/* The name's link covers the whole card, so a tap anywhere opens its usage. */}
                        <Link
                          to={usagePath(key)}
                          state={{ from: 'api-keys' }}
                          className="truncate outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-ring/50"
                        >
                          {key.name}
                        </Link>
                        {key.disabled ? (
                          <Badge variant="secondary" className="gap-1.5">
                            <span className="size-1.5 rounded-full bg-faint" />
                            Disabled
                          </Badge>
                        ) : key.blocked ? (
                          <Badge variant="destructive" title={key.block_reason}>
                            Blocked
                          </Badge>
                        ) : null}
                      </ItemTitle>
                      {key.managed && (
                        <ItemDescription className="truncate font-mono text-xs max-sm:shrink-0">
                          {key.masked_key}
                        </ItemDescription>
                      )}
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground max-sm:gap-x-1.5">
                        {key.managed ? (
                          key.allowed_providers.map((provider) => {
                            const icon = providerIcon(provider);
                            return (
                              <span key={provider} className="flex items-center gap-1 max-sm:gap-0">
                                {icon && (
                                  <img
                                    src={icon}
                                    alt=""
                                    title={providerLabel(provider)}
                                    className="size-3.5 rounded-sm"
                                  />
                                )}
                                <span className={icon ? 'max-sm:sr-only' : undefined}>
                                  {providerLabel(provider)}
                                </span>
                              </span>
                            );
                          })
                        ) : (
                          <span>Unrestricted</span>
                        )}
                        <span className="text-faint max-sm:text-muted-foreground">
                          {key.allowed_models.length
                            ? `${key.allowed_models.length} model${key.allowed_models.length === 1 ? '' : 's'}`
                            : 'All models'}
                          {/* Phone leaves the request and token limits to the edit dialog. */}
                          {limits.length > 0 && (
                            <span className="max-sm:hidden">, {limits.join(', ')}</span>
                          )}
                        </span>
                      </div>
                    </ItemContent>
                    <div className="flex w-full flex-col gap-1.5 pl-6.5 max-sm:flex-row max-sm:pl-0 max-sm:flex-wrap max-sm:items-baseline max-sm:gap-x-3 sm:w-36 sm:items-end sm:pl-0">
                      {unused && (
                        <span className="text-[13px] text-muted-foreground sm:hidden">
                          Not used today
                        </span>
                      )}
                      <span
                        className={cn(
                          'font-mono text-sm tabular-nums max-sm:font-sans max-sm:font-medium max-sm:normal-nums',
                          unused && 'max-sm:hidden'
                        )}
                      >
                        {formatUsd(key.today_usd)}
                        {key.daily_limit_usd > 0 && (
                          <span className="text-xs text-faint max-sm:font-normal max-sm:text-muted-foreground">
                            <span className="max-sm:hidden">
                              {' '}
                              / {formatUsd(key.daily_limit_usd)}
                            </span>
                            <span className="sm:hidden">
                              {' '}
                              of {formatLimitUsd(key.daily_limit_usd)} today
                            </span>
                          </span>
                        )}
                      </span>
                      {budgetUsed !== null && (
                        <Meter
                          className={cn('w-full max-sm:order-last', unused && 'max-sm:hidden')}
                          value={budgetUsed}
                          tone={
                            budgetUsed >= 100 ? 'critical' : budgetUsed >= 80 ? 'warning' : 'good'
                          }
                          ariaLabel={`${key.name} daily budget used`}
                        />
                      )}
                      <span className="font-mono text-xs text-faint tabular-nums max-sm:hidden">
                        {formatCompactNumber(key.today_requests)} req,{' '}
                        {formatCompactNumber(key.today_tokens)} tok
                      </span>
                      {!unused && (
                        <span className="text-[13px] text-muted-foreground sm:hidden">
                          {formatCompactNumber(key.today_requests)} requests ·{' '}
                          {formatCompactNumber(key.today_tokens)} tokens
                        </span>
                      )}
                    </div>
                    <ItemActions className="relative max-sm:absolute max-sm:top-1.5 max-sm:right-1.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="max-sm:size-10"
                            aria-label={`Actions for ${key.name}`}
                          >
                            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.75} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="max-sm:min-w-44">
                          <DropdownMenuItem
                            className="max-sm:py-2"
                            onSelect={() =>
                              navigate(usagePath(key), { state: { from: 'api-keys' } })
                            }
                          >
                            <HugeiconsIcon icon={Analytics01Icon} strokeWidth={1.75} />
                            View usage
                          </DropdownMenuItem>
                          <DropdownMenuItem className="max-sm:py-2" onSelect={() => openEdit(key)}>
                            <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.75} />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="max-sm:py-2"
                            onSelect={() => {
                              confirmAction.setError(null);
                              setConfirm({ kind: 'rotate', key });
                            }}
                          >
                            <HugeiconsIcon icon={ArrowReloadHorizontalIcon} strokeWidth={1.75} />
                            Rotate secret
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            className="max-sm:py-2"
                            onSelect={() => {
                              confirmAction.setError(null);
                              setConfirm({ kind: 'delete', key });
                            }}
                          >
                            <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
          )}
        </section>

        <Dialog
          open={editing !== undefined}
          onOpenChange={(open) => {
            if (!open && !saving) setEditing(undefined);
          }}
        >
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{editing ? `Edit ${editing.name}` : 'New API key'}</DialogTitle>
            </DialogHeader>
            <form
              className="flex flex-col gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="api-key-name">Name</FieldLabel>
                  <Input
                    id="api-key-name"
                    className="h-9"
                    value={form.name}
                    placeholder="Production app"
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </Field>

                <FieldSet className="gap-2">
                  <FieldLegend variant="label">Providers</FieldLegend>
                  <ToggleGroup
                    type="multiple"
                    variant="outline"
                    className="flex-wrap"
                    value={form.allowed_providers}
                    onValueChange={setProviders}
                  >
                    {options.providers.map((provider) => {
                      const icon = providerIcon(provider);
                      return (
                        <ToggleGroupItem
                          key={provider}
                          value={provider}
                          className="h-8 gap-1.5 px-2.5 data-[state=on]:border-primary/60 data-[state=on]:bg-primary/10"
                        >
                          {icon && <img src={icon} alt="" className="size-4 rounded-sm" />}
                          {providerLabel(provider)}
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                </FieldSet>

                <FieldSet className="gap-2">
                  <FieldLegend
                    variant="label"
                    className="flex w-full items-center justify-between gap-3"
                  >
                    Models
                    <span className="text-xs font-normal text-muted-foreground">
                      {form.allowed_models.length
                        ? `${form.allowed_models.length} selected`
                        : 'None selected allows all'}
                    </span>
                  </FieldLegend>
                  <InputGroup className="h-9">
                    <InputGroupAddon>
                      <HugeiconsIcon icon={Search01Icon} strokeWidth={1.75} />
                    </InputGroupAddon>
                    <InputGroupInput
                      aria-label="Search models"
                      placeholder="Search models"
                      value={modelSearch}
                      onChange={(event) => setModelSearch(event.target.value)}
                    />
                  </InputGroup>
                  {/* relative: checkbox inputs are absolutely positioned and must stay inside the
                      list. Phone lets the sheet do the scrolling instead of a scroll in a scroll. */}
                  <div className="relative max-h-56 divide-y overflow-y-auto rounded-lg border max-sm:max-h-none max-sm:overflow-visible">
                    {visibleModels.map((model) => (
                      <label
                        key={model.id}
                        className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors duration-150 hover:bg-muted/50 max-sm:min-h-11 max-sm:flex-wrap max-sm:gap-y-0.5"
                      >
                        <Checkbox
                          checked={form.allowed_models.includes(model.id)}
                          onCheckedChange={(value) => toggleModel(model.id, value === true)}
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px]">{model.name}</span>
                        {/* Phone puts the id on its own line so the date suffix that tells versions apart stays visible. */}
                        {model.name !== model.id && (
                          <code className="max-w-[45%] truncate font-mono text-xs text-faint max-sm:max-w-none max-sm:basis-full max-sm:pl-7 max-sm:text-muted-foreground">
                            {model.id}
                          </code>
                        )}
                      </label>
                    ))}
                    {visibleModels.length === 0 && (
                      <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
                        No models match.
                      </p>
                    )}
                  </div>
                </FieldSet>

                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-5">
                    {LIMIT_FIELDS.map(({ field, label, step }) => (
                      <Field key={field}>
                        <FieldLabel htmlFor={`api-key-${field}`}>{label}</FieldLabel>
                        <Input
                          id={`api-key-${field}`}
                          className="h-9 font-mono max-sm:font-sans"
                          type="number"
                          min="0"
                          step={step}
                          value={form[field]}
                          aria-describedby="api-key-limits-help"
                          onChange={(event) =>
                            setForm({ ...form, [field]: Number(event.target.value) })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                  <FieldDescription id="api-key-limits-help">0 means no limit.</FieldDescription>
                </div>

                {/* relative: the switch's hidden input is absolutely positioned. Without a
                    positioned parent it escapes the sheet's scrolling body and leaves the sheet
                    itself scrollable, so scrollIntoView could push the title off-screen. */}
                <Field orientation="horizontal" className="relative justify-between">
                  <FieldLabel htmlFor="api-key-enabled">Enabled</FieldLabel>
                  <Switch
                    id="api-key-enabled"
                    checked={!form.disabled}
                    onCheckedChange={(enabled) => setForm({ ...form, disabled: !enabled })}
                  />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(undefined)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !formValid}>
                  {editing ? 'Save' : 'Generate key'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(revealedSecret)}
          onOpenChange={(open) => {
            if (!open) setRevealedSecret('');
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Copy your API key</DialogTitle>
              <DialogDescription>It won't be shown again.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-lg border bg-card py-1 pr-1 pl-3">
              <code className="min-w-0 flex-1 font-mono text-xs break-all">
                <Private>{revealedSecret}</Private>
              </code>
              <CopyButton value={revealedSecret} label="Copy key" />
            </div>
            <DialogFooter>
              <Button onClick={() => setRevealedSecret('')}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={confirm !== null}
          onOpenChange={(open) => {
            if (!open && !confirmAction.busy) setConfirm(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm?.kind === 'rotate' ? 'Rotate' : 'Delete'} {confirm?.key.name}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm?.kind === 'rotate'
                  ? 'The current secret will stop working immediately. The policy and usage history stay intact.'
                  : 'Requests using this secret will fail immediately. Existing spending history remains in the ledger.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {confirmAction.error && <FieldError>{confirmAction.error}</FieldError>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={confirmAction.busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={confirmAction.busy}
                onClick={(event) => {
                  // Keep the dialog open until the request finishes, so a failure can show here.
                  event.preventDefault();
                  if (confirm) void runConfirm(confirm);
                }}
              >
                {confirm?.kind === 'rotate' ? 'Rotate key' : 'Delete key'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Page>
    </>
  );
}
