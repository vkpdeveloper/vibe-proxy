import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { checkLoginProxyUrl } from '../loginProxy';

/** Optional proxy for the logins started on this page. Empty means a direct login. */
export function LoginProxyField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const errorId = useId();
  const [touched, setTouched] = useState(false);
  const showError = touched && checkLoginProxyUrl(value).kind === 'invalid';

  return (
    <Field className="gap-1.5 sm:max-w-sm">
      <FieldLabel htmlFor={inputId}>{t('auth_login.login_proxy_label')}</FieldLabel>
      <Input
        id={inputId}
        className="h-10 font-mono text-base sm:h-9 sm:text-xs md:text-xs"
        inputMode="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setTouched(true)}
        placeholder="socks5://host:1080"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-invalid={showError}
        aria-describedby={showError ? errorId : undefined}
      />
      {showError && <FieldError id={errorId}>{t('auth_login.login_proxy_invalid')}</FieldError>}
    </Field>
  );
}
