import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/** Minimum character count before the expand/collapse toggle appears. */
const EXPAND_THRESHOLD = 30;

const toggleClass =
  'absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50';

/** Auto-expanding textarea that collapses back to a single-line input on demand. */
export function ExpandableInput({
  value,
  placeholder,
  ariaLabel,
  disabled,
  className,
  onChange,
}: {
  value: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  onChange: (nextValue: string) => void;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Strip newlines — these fields are single-line identifiers/paths that
    // would break YAML serialization if they contained line breaks.
    const sanitized = e.target.value.replace(/[\r\n]/g, '');
    onChange(sanitized);
    // autoResize is handled by useLayoutEffect after React syncs the
    // sanitized value back to the DOM — calling it here would measure
    // stale content.
  };

  // Resize synchronously before paint to avoid visual flicker.
  useLayoutEffect(() => {
    if (!collapsed && textareaRef.current) {
      autoResize(textareaRef.current);
    }
  }, [collapsed, value, autoResize]);

  const expandable = value.length > EXPAND_THRESHOLD;

  if (collapsed) {
    return (
      <div className="relative min-w-0 flex-1">
        <Input
          className={cn('h-9', expandable && 'pr-9', className)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[\r\n]/g, ''))}
          disabled={disabled}
        />
        {expandable && (
          <button
            type="button"
            className={toggleClass}
            disabled={disabled}
            onClick={() => {
              setCollapsed(false);
              requestAnimationFrame(() => {
                textareaRef.current?.focus();
              });
            }}
            title={t('common.expand')}
            aria-label={t('common.expand')}
          >
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.75} className="size-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative min-w-0 flex-1">
      <Textarea
        ref={textareaRef}
        className={cn('min-h-9 resize-none pr-9 break-all', className)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        rows={2}
      />
      <button
        type="button"
        className={toggleClass}
        disabled={disabled}
        onClick={() => setCollapsed(true)}
        title={t('common.collapse')}
        aria-label={t('common.collapse')}
      >
        <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={1.75} className="size-4" />
      </button>
    </div>
  );
}
