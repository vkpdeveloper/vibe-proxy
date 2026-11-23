import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, ArrowDown01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { maskApiKey } from '@/utils/format';
import { MAX_CREDENTIAL_WEIGHT } from '@/utils/credentialWeight';
import type { ApiKeyEntryInput } from '../../types';
import type { ConnectivityState, ConnectivityStatus } from './useConnectivityTest';
import { ConnectivityStatusIcon } from './ConnectivityStatusIcon';
import { NO_SPINNER, SecretInput } from './FormControls';
import { Hint } from '@/components/ui/tooltip';

const COLLAPSED_LIMIT = 10;

const idleStatus: ConnectivityStatus = { state: 'idle' as ConnectivityState, message: '' };

const isBlankEntry = (entry: ApiKeyEntryInput): boolean =>
  !entry.apiKey.trim() && !entry.existingApiKey?.trim();

interface ApiKeyEntriesEditorProps {
  entries: ApiKeyEntryInput[];
  removeDisabled: boolean;
  mutating: boolean;
  statuses: ConnectivityStatus[];
  isTestingAny: boolean;
  onUpdate: (idx: number, patch: Partial<ApiKeyEntryInput>) => void;
  /** Appends a new blank entry and returns its index. */
  onAdd: () => number;
  onRemove: (idx: number) => void;
  onTest: (idx: number) => void;
  onTestAll: () => void;
}

export function ApiKeyEntriesEditor({
  entries,
  removeDisabled,
  mutating,
  statuses,
  isTestingAny,
  onUpdate,
  onAdd,
  onRemove,
  onTest,
  onTestAll,
}: ApiKeyEntriesEditorProps) {
  const { t } = useTranslation();
  const id = useId();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(() =>
    entries.length === 1 && isBlankEntry(entries[0]) ? 0 : null
  );
  const [showPasswords, setShowPasswords] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const setPasswordVisible = (idx: number, visible: boolean) => {
    setShowPasswords((prev) => {
      const next = new Set(prev);
      if (visible) {
        next.add(idx);
      } else {
        next.delete(idx);
      }
      return next;
    });
  };

  const handleAdd = () => {
    const idx = onAdd();
    setExpandedIdx(idx);
  };

  const handleRemove = (removeIdx: number) => {
    setShowPasswords((prev) => {
      if (!prev.size) return prev;
      const next = new Set<number>();
      prev.forEach((idx) => {
        if (idx < removeIdx) {
          next.add(idx);
        } else if (idx > removeIdx) {
          next.add(idx - 1);
        }
      });
      return next;
    });
    setExpandedIdx((prev) => {
      if (prev === null || prev === removeIdx) return null;
      return prev > removeIdx ? prev - 1 : prev;
    });
    onRemove(removeIdx);
  };

  // Newest entries first, matching the append-on-add order.
  const reversed = entries.map((entry, idx) => ({ entry, idx })).reverse();
  const visible = showAll ? reversed : reversed.slice(0, COLLAPSED_LIMIT);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-sm:h-10"
          disabled={mutating}
          onClick={handleAdd}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} />
          {t('providersPage.form.addApiKeyEntry')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-sm:h-10"
          disabled={mutating || isTestingAny}
          onClick={onTestAll}
        >
          {t('providersPage.connectivity.testAll')}
        </Button>
      </div>
      {visible.map(({ entry, idx }) => {
        const status = statuses[idx] ?? idleStatus;
        const expanded = expandedIdx === idx;
        const summaryKey = entry.apiKey.trim() || entry.existingApiKey?.trim() || '';
        const entryId = `${id}-${idx}`;
        return (
          <div key={idx} className="rounded-lg border">
            <div className="flex items-center gap-1 py-1 pr-1 pl-3">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm outline-none focus-visible:underline"
                aria-expanded={expanded}
                onClick={() => setExpandedIdx(expanded ? null : idx)}
              >
                <span className="shrink-0 font-medium">
                  {t('providersPage.form.apiKeyEntry', { index: idx + 1 })}
                </span>
                <span
                  className={cn(
                    'min-w-0 truncate font-mono text-xs',
                    summaryKey ? 'text-muted-foreground' : 'text-faint'
                  )}
                >
                  {summaryKey ? maskApiKey(summaryKey) : t('providersPage.status.notConfigured')}
                </span>
                {entry.proxyUrl.trim() ? (
                  <Badge variant="secondary" title={entry.proxyUrl}>
                    {t('providersPage.form.proxyBadge')}
                  </Badge>
                ) : null}
              </button>
              <ConnectivityStatusIcon state={status.state} />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="max-sm:h-10"
                disabled={mutating || status.state === 'loading'}
                onClick={() => onTest(idx)}
              >
                {t('providersPage.connectivity.test')}
              </Button>
              <Hint label={expanded ? t('common.collapse') : t('common.expand')}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="max-sm:size-10"
                  onClick={() => setExpandedIdx(expanded ? null : idx)}
                  aria-label={expanded ? t('common.collapse') : t('common.expand')}
                >
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    strokeWidth={1.75}
                    className={cn(
                      'transition-transform duration-200 ease-out motion-reduce:transition-none',
                      expanded && 'rotate-180'
                    )}
                  />
                </Button>
              </Hint>
              <Hint label={t('common.delete')}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive max-sm:size-10"
                  disabled={mutating || removeDisabled}
                  aria-label={t('common.delete')}
                  onClick={() => handleRemove(idx)}
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.75} />
                </Button>
              </Hint>
            </div>
            {status.state === 'error' ? (
              <p role="alert" className="border-t px-3 py-2 text-sm text-destructive">
                {status.message}
              </p>
            ) : null}
            {expanded ? (
              <div className="flex flex-col gap-5 border-t p-3">
                <Field>
                  <FieldLabel htmlFor={`${entryId}-key`}>
                    {t('providersPage.form.apiKey')}
                  </FieldLabel>
                  <SecretInput
                    id={`${entryId}-key`}
                    value={entry.apiKey}
                    onValueChange={(apiKey) => onUpdate(idx, { apiKey })}
                    visible={showPasswords.has(idx)}
                    onVisibleChange={(visible) => setPasswordVisible(idx, visible)}
                    disabled={mutating}
                    placeholder={
                      entry.existingApiKey
                        ? t('providersPage.form.apiKeyEditPlaceholder')
                        : t('providersPage.form.apiKeyCreatePlaceholder')
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${entryId}-proxy`}>
                    {t('providersPage.form.proxyUrl')}
                  </FieldLabel>
                  <Input
                    id={`${entryId}-proxy`}
                    className="font-mono placeholder:font-sans"
                    value={entry.proxyUrl}
                    onChange={(e) => onUpdate(idx, { proxyUrl: e.target.value })}
                    disabled={mutating}
                    placeholder="http://127.0.0.1:7890"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${entryId}-weight`}>
                    {t('providersPage.form.weight')}
                  </FieldLabel>
                  <Input
                    id={`${entryId}-weight`}
                    type="number"
                    step="1"
                    max={MAX_CREDENTIAL_WEIGHT}
                    className={NO_SPINNER}
                    value={entry.weight ?? ''}
                    onChange={(e) =>
                      onUpdate(idx, {
                        weight: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    disabled={mutating}
                    placeholder="1"
                  />
                  <FieldDescription className="text-xs">
                    {t('providersPage.form.weightHint')}
                  </FieldDescription>
                </Field>
              </div>
            ) : null}
          </div>
        );
      })}
      {entries.length > COLLAPSED_LIMIT ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start max-sm:h-10"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll
            ? t('providersPage.form.showFewerEntries')
            : t('providersPage.form.showAllEntries', { count: entries.length })}
        </Button>
      ) : null}
    </div>
  );
}
