import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getTypeLabel, normalizeProviderKey } from '../constants';
import { ProviderLogo } from './ProviderLogo';

interface OAuthEditorProviderCardProps {
  provider: string;
  options: string[];
  onChange: (provider: string) => void;
  disabled: boolean;
  translationPrefix: 'oauth_excluded' | 'oauth_model_alias';
}

/** The provider an OAuth editor applies to: free text, with the known providers as shortcuts. */
export function OAuthEditorProviderCard({
  provider,
  options,
  onChange,
  disabled,
  translationPrefix,
}: OAuthEditorProviderCardProps) {
  const { t } = useTranslation();
  const id = useId();
  const label = t(`${translationPrefix}.provider_label`);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex min-h-9 items-center">
        <label htmlFor={id} className="text-lg font-semibold tracking-tight">
          {label}
        </label>
      </div>
      <div className="flex flex-col gap-3">
        <Input
          id={id}
          className="h-9"
          list={`${id}-options`}
          placeholder={t(`${translationPrefix}.provider_placeholder`)}
          value={provider}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
        />
        <datalist id={`${id}-options`}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <p className="text-sm text-muted-foreground">{t(`${translationPrefix}.provider_hint`)}</p>
        {options.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
            {options.map((option) => {
              const active = normalizeProviderKey(provider) === normalizeProviderKey(option);
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange(option)}
                  disabled={disabled}
                  className={cn(
                    'inline-flex h-8 items-center gap-2 rounded-lg border bg-transparent py-1 pr-3 pl-1 text-sm text-muted-foreground transition-colors duration-150 ease-out outline-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
                    active && 'border-primary/60 bg-primary/10 text-foreground hover:bg-primary/10'
                  )}
                >
                  <ProviderLogo type={option} />
                  {getTypeLabel(t, option)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
