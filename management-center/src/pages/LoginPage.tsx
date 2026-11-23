import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, GlobeIcon, ViewIcon, ViewOffSlashIcon } from '@hugeicons/core-free-icons';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { cn } from '@/lib/utils';
import { useAuthStore, useLanguageStore, useNotificationStore } from '@/stores';
import { detectApiBaseFromLocation, normalizeApiBase } from '@/utils/connection';
import { LANGUAGE_LABEL_KEYS, LANGUAGE_ORDER } from '@/utils/constants';
import type { ApiError } from '@/types';
import { LegacyBackendError } from '@/services/api/legacyBackendProbe';

type RedirectState = { from?: { pathname?: string } };

/**
 * Turns a login failure into a localized message. A wrong key reads plainly; other HTTP errors
 * keep the status and backend detail for troubleshooting.
 */
function getLocalizedErrorMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof LegacyBackendError) return t('login.error_legacy_backend');
  const apiError = error as Partial<ApiError>;
  const status = typeof apiError.status === 'number' ? apiError.status : undefined;
  const code = typeof apiError.code === 'string' ? apiError.code : undefined;
  const message =
    error instanceof Error
      ? error.message
      : typeof apiError.message === 'string'
        ? apiError.message
        : typeof error === 'string'
          ? error
          : '';

  const withHttpStatus = (summary: string) => {
    if (!status) return summary;
    const genericAxiosMessage = `Request failed with status code ${status}`;
    const detail = message.trim();
    const backendDetail =
      detail && detail !== genericAxiosMessage
        ? ` (${t('login.error_backend_detail')}: ${detail})`
        : '';
    return `HTTP ${status}: ${summary}${backendDetail}`;
  };

  const lower = message.toLowerCase();
  // A wrong key is the common case, so it gets plain words with no status or backend detail.
  if (status === 401 || /invalid (management )?key/.test(lower)) {
    return t('login.error_unauthorized');
  }
  if (status === 403) return withHttpStatus(t('login.error_forbidden'));
  if (status === 404) return withHttpStatus(t('login.error_not_found'));
  if (status && status >= 500) return withHttpStatus(t('login.error_server'));

  if (code === 'ECONNABORTED' || lower.includes('timeout')) return t('login.error_timeout');
  if (code === 'ERR_NETWORK' || lower.includes('network error')) return t('login.error_network');
  if (code === 'ERR_CERT_AUTHORITY_INVALID' || lower.includes('certificate')) {
    return t('login.error_ssl');
  }
  if (lower.includes('cors') || lower.includes('cross-origin')) return t('login.error_cors');

  return withHttpStatus(t('login.error_invalid'));
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const login = useAuthStore((state) => state.login);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const storedBase = useAuthStore((state) => state.apiBase);
  const storedKey = useAuthStore((state) => state.managementKey);
  const storedRememberPassword = useAuthStore((state) => state.rememberPassword);

  const [apiBase, setApiBase] = useState('');
  const [managementKey, setManagementKey] = useState('');
  const [showServer, setShowServer] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState('');

  const detectedBase = useMemo(() => detectApiBaseFromLocation(), []);
  const redirect = (location.state as RedirectState | null)?.from?.pathname || '/';

  // Auto-login with a remembered session; otherwise prefill what was saved.
  useEffect(() => {
    const init = async () => {
      try {
        if (await restoreSession()) {
          navigate(redirect, { replace: true });
          return;
        }
        setApiBase(storedBase || detectedBase);
        setManagementKey(storedKey || '');
        setRememberPassword(storedRememberPassword || Boolean(storedKey));
      } finally {
        setRestoring(false);
      }
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    if (!managementKey.trim()) {
      setError(t('login.error_required'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login({
        apiBase: apiBase ? normalizeApiBase(apiBase) : detectedBase,
        managementKey: managementKey.trim(),
        rememberPassword,
      });
      showNotification(t('common.connected_status'), 'success');
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setError(getLocalizedErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated && !restoring) return <Navigate to={redirect} replace />;
  // Like VM Bridge, nothing shows while a remembered session is checked.
  if (restoring) return null;

  const serverAddress = apiBase || detectedBase;
  const keyLabel = showKey ? t('login.hide_key') : t('login.show_key');

  return (
    <main className="grid min-h-full grid-cols-1 place-items-center px-4 py-10">
      <form
        className="flex w-full max-w-sm min-w-0 flex-col gap-8"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="flex flex-col items-center gap-4">
          <Logo className="size-12" />
          <h1 className="text-xl font-semibold tracking-tight">{t('title.login')}</h1>
        </div>

        <FieldGroup>
          {/* On error only the border and the message turn red, not the label or the typed key. */}
          <Field data-invalid={Boolean(error)} className="data-[invalid=true]:text-foreground">
            <FieldLabel htmlFor="management-key">{t('login.management_key_label')}</FieldLabel>
            <InputGroup className="h-10">
              <InputGroupInput
                id="management-key"
                name="cpa-management-key"
                type={showKey ? 'text' : 'password'}
                autoFocus
                autoComplete="current-password"
                placeholder={t('login.management_key_placeholder')}
                aria-invalid={Boolean(error)}
                value={managementKey}
                onChange={(event) => setManagementKey(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                {/* A full 40px target; it overlaps the field's 1px border, which is invisible. */}
                <InputGroupButton
                  size="icon-sm"
                  className="-mr-1.5 size-10"
                  aria-label={keyLabel}
                  title={keyLabel}
                  onClick={() => setShowKey((shown) => !shown)}
                >
                  <HugeiconsIcon icon={showKey ? ViewOffSlashIcon : ViewIcon} strokeWidth={1.75} />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {error && <FieldError>{error}</FieldError>}
          </Field>

          <Field orientation="horizontal" className="min-h-10 items-center">
            <Checkbox
              id="remember-password"
              checked={rememberPassword}
              onCheckedChange={(checked) => setRememberPassword(checked === true)}
            />
            {/* The label fills the row, so a tap anywhere on it toggles the checkbox. */}
            <FieldLabel
              htmlFor="remember-password"
              className="flex-1 items-center self-stretch font-normal"
            >
              {t('login.remember_password_label')}
            </FieldLabel>
          </Field>

          <Button type="submit" size="lg" className="h-10" disabled={loading}>
            {loading ? t('login.submitting') : t('login.submit_button')}
          </Button>
        </FieldGroup>

        <div className="relative -mt-2">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <button
              type="button"
              aria-expanded={showServer}
              onClick={() => setShowServer((shown) => !shown)}
              className="flex min-w-0 items-center gap-1.5 rounded-md text-left outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:min-h-10"
            >
              {/* On phones the address gets its own line and wraps instead of losing its end. */}
              <span className="flex min-w-0 flex-col max-sm:py-1 sm:block sm:truncate">
                {t('login.custom_connection_label')}
                {!showServer && (
                  <span className="font-mono [overflow-wrap:anywhere] text-faint sm:ml-1.5">
                    {serverAddress}
                  </span>
                )}
              </span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                strokeWidth={1.75}
                className={cn(
                  'size-3.5 shrink-0 transition-transform duration-150 ease-out motion-reduce:transition-none',
                  showServer && 'rotate-180'
                )}
              />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="shrink-0 text-muted-foreground max-sm:-mr-2.5 max-sm:h-10 max-sm:px-2.5"
                  aria-label={t('language.switch')}
                >
                  <HugeiconsIcon icon={GlobeIcon} strokeWidth={1.75} />
                  {t(LANGUAGE_LABEL_KEYS[language])}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuRadioGroup value={language} onValueChange={setLanguage}>
                  {LANGUAGE_ORDER.map((lang) => (
                    <DropdownMenuRadioItem key={lang} value={lang}>
                      {t(LANGUAGE_LABEL_KEYS[lang])}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Opens under its toggle, which already names it. It sits outside the flow so the
              centred form doesn't shift and the toggle stays put. */}
          {showServer && (
            <Field className="absolute inset-x-0 top-full mt-2">
              <FieldLabel htmlFor="server-address" className="sr-only">
                {t('login.custom_connection_label')}
              </FieldLabel>
              <Input
                id="server-address"
                className="h-10 font-mono"
                inputMode="url"
                autoComplete="url"
                placeholder={t('login.custom_connection_placeholder')}
                value={apiBase}
                onChange={(event) => setApiBase(event.target.value)}
              />
              <FieldDescription>{t('login.custom_connection_hint')}</FieldDescription>
            </Field>
          )}
        </div>
      </form>
    </main>
  );
}
