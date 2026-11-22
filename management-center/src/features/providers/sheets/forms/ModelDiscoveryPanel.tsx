import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { RefreshIcon, Search01Icon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import type { ModelInfo } from '@/utils/models';

interface ModelDiscoveryPanelProps {
  loading: boolean;
  error: string | null;
  models: ModelInfo[];
  hasFetched: boolean;
  existingNames: Set<string>;
  mutating?: boolean;
  onApply: (picked: ModelInfo[]) => void;
  onReload: () => void;
  onClose: () => void;
}

export function ModelDiscoveryPanel({
  loading,
  error,
  models,
  hasFetched,
  existingNames,
  mutating,
  onApply,
  onReload,
  onClose,
}: ModelDiscoveryPanelProps) {
  const { t } = useTranslation();
  const id = useId();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => `${m.name} ${m.alias ?? ''}`.toLowerCase().includes(q));
  }, [models, search]);

  const selectable = useMemo(
    () => filtered.filter((m) => !existingNames.has(m.name)),
    [filtered, existingNames]
  );

  const allSelectableChecked =
    selectable.length > 0 && selectable.every((m) => selected.has(m.name));

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelectableChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectable.map((m) => m.name)));
    }
  };

  const handleApply = () => {
    const picked = models.filter((m) => selected.has(m.name) && !existingNames.has(m.name));
    if (!picked.length) return;
    onApply(picked);
    setSelected(new Set());
  };

  const renderModelLabel = (model: ModelInfo) => (
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      <span className="truncate font-mono text-xs">{model.name}</span>
      {model.alias ? (
        <span className="truncate text-xs text-muted-foreground">{model.alias}</span>
      ) : null}
    </span>
  );

  const message = (text: string) => (
    <p className="px-1 py-4 text-center text-sm text-muted-foreground">{text}</p>
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} strokeWidth={1.75} aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('providersPage.discovery.searchPlaceholder')}
            aria-label={t('providersPage.discovery.searchPlaceholder')}
          />
        </InputGroup>
        <Button type="button" variant="outline" onClick={onReload} disabled={loading}>
          <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} />
          {t('providersPage.discovery.reload')}
        </Button>
      </div>

      {loading && !models.length ? (
        message(t('providersPage.discovery.loading'))
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : hasFetched && !models.length ? (
        message(t('providersPage.discovery.empty'))
      ) : models.length ? (
        <>
          <div className="flex items-center justify-between gap-3 px-1">
            <label
              htmlFor={`${id}-all`}
              className="flex cursor-pointer items-center gap-2 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-50"
            >
              <Checkbox
                id={`${id}-all`}
                checked={allSelectableChecked}
                onCheckedChange={toggleAll}
                disabled={selectable.length === 0}
              />
              {allSelectableChecked
                ? t('providersPage.discovery.clearAll')
                : t('providersPage.discovery.selectAll')}
            </label>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {t('providersPage.discovery.selectedCount', {
                selected: selected.size,
                total: selectable.length,
              })}
            </span>
          </div>
          <ul className="max-h-64 overflow-y-auto rounded-lg border bg-background">
            {filtered.map((m, index) => {
              const existing = existingNames.has(m.name);
              const itemId = `${id}-model-${index}`;
              return (
                <li key={m.name} className="border-b last:border-b-0">
                  {existing ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
                      {renderModelLabel(m)}
                      <Badge variant="secondary">{t('providersPage.discovery.alreadyAdded')}</Badge>
                    </div>
                  ) : (
                    <label
                      htmlFor={itemId}
                      className="flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/50"
                    >
                      <Checkbox
                        id={itemId}
                        checked={selected.has(m.name)}
                        onCheckedChange={() => toggle(m.name)}
                      />
                      {renderModelLabel(m)}
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        message(t('providersPage.discovery.notLoaded'))
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={mutating}>
          {t('providersPage.discovery.close')}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleApply}
          disabled={mutating || selected.size === 0}
        >
          {t('providersPage.discovery.apply', { count: selected.size })}
        </Button>
      </div>
    </div>
  );
}
