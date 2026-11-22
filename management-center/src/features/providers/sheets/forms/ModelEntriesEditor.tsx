import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, ArrowDown01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ModelAdvancedFields } from './ModelAdvancedFields';
import { SwitchField } from './FormControls';
import type { ModelEntryInput, ProviderBrand } from '../../types';

const COLLAPSED_LIMIT = 10;

interface ModelEntriesEditorProps {
  models: ModelEntryInput[];
  /** Restrict advanced controls to the OAuthModelAlias contract. */
  oauthAliasOnly?: boolean;
  providerBrand?: ProviderBrand;
  /** Only OpenAI-compatible entries can expose the image-generation capability. */
  supportsImage: boolean;
  /** Every backend provider model can override its thinking capability. */
  supportsThinking: boolean;
  mutating: boolean;
  removeDisabled: boolean;
  onUpdate: (idx: number, patch: Partial<ModelEntryInput>) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}

export function ModelEntriesEditor({
  models,
  oauthAliasOnly = false,
  providerBrand = 'gemini',
  supportsImage,
  supportsThinking,
  mutating,
  removeDisabled,
  onUpdate,
  onAdd,
  onRemove,
}: ModelEntriesEditorProps) {
  const { t } = useTranslation();
  const id = useId();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const aliasLabel = t(
    oauthAliasOnly ? 'auth_files.policy_alias_name' : 'providersPage.modelOptions.modelAlias'
  );

  const handleAdd = () => {
    // New rows are appended; make sure the truncated list doesn't hide them.
    if (!showAll && models.length >= COLLAPSED_LIMIT) {
      setShowAll(true);
    }
    onAdd();
  };

  const handleRemove = (removeIdx: number) => {
    setExpandedIdx((prev) => {
      if (prev === null || prev === removeIdx) return null;
      return prev > removeIdx ? prev - 1 : prev;
    });
    onRemove(removeIdx);
  };

  const visible = showAll ? models : models.slice(0, COLLAPSED_LIMIT);

  return (
    <div className="flex flex-col gap-2">
      {visible.map((entry, idx) => {
        const expanded = expandedIdx === idx;
        const hasThinking = entry.thinkingEnabled ?? Boolean(entry.thinkingJson?.trim());
        const rowId = `${id}-${idx}`;
        return (
          <div key={idx} className="rounded-lg border">
            <div className="flex flex-wrap items-center gap-2 p-2">
              <Input
                className="min-w-0 flex-1 basis-36 font-mono"
                placeholder={t('providersPage.modelOptions.modelName')}
                aria-label={t('providersPage.modelOptions.modelName')}
                value={entry.name}
                onChange={(e) => onUpdate(idx, { name: e.target.value })}
                disabled={mutating}
              />
              <Input
                className="min-w-0 flex-1 basis-36 font-mono"
                placeholder={aliasLabel}
                aria-label={aliasLabel}
                required={oauthAliasOnly}
                value={entry.alias ?? ''}
                onChange={(e) => onUpdate(idx, { alias: e.target.value })}
                disabled={mutating}
              />
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {!oauthAliasOnly && supportsImage && !expanded && entry.image === true ? (
                  <Badge variant="secondary">{t('providersPage.form.modelBadgeImage')}</Badge>
                ) : null}
                {!oauthAliasOnly && supportsThinking && !expanded && hasThinking ? (
                  <Badge variant="secondary">{t('providersPage.form.modelBadgeThinking')}</Badge>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setExpandedIdx(expanded ? null : idx)}
                  title={expanded ? t('common.collapse') : t('common.expand')}
                  aria-label={expanded ? t('common.collapse') : t('common.expand')}
                  aria-expanded={expanded}
                  disabled={mutating}
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={t('providersPage.modelOptions.removeModel')}
                  title={t('providersPage.modelOptions.removeModel')}
                  disabled={mutating || removeDisabled}
                  onClick={() => handleRemove(idx)}
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.75} />
                </Button>
              </div>
            </div>
            {expanded ? (
              <div className="flex flex-col gap-5 border-t p-3">
                {!oauthAliasOnly && supportsImage ? (
                  <SwitchField
                    id={`${rowId}-image`}
                    label={t('providersPage.form.modelImage')}
                    description={t('providersPage.form.modelImageHint')}
                    checked={entry.image === true}
                    disabled={mutating}
                    onCheckedChange={(checked) => onUpdate(idx, { image: checked })}
                  />
                ) : null}
                {oauthAliasOnly ? (
                  <>
                    <Field>
                      <FieldLabel htmlFor={`${rowId}-display-name`}>
                        {t('auth_files.policy_alias_display_name')}
                      </FieldLabel>
                      <Input
                        id={`${rowId}-display-name`}
                        value={entry.displayName ?? ''}
                        disabled={mutating}
                        onChange={(event) => onUpdate(idx, { displayName: event.target.value })}
                      />
                    </Field>
                    {(['fork', 'forceMapping'] as const).map((field) => (
                      <SwitchField
                        key={field}
                        id={`${rowId}-${field}`}
                        label={t(
                          field === 'fork'
                            ? 'auth_files.policy_alias_fork'
                            : 'auth_files.policy_alias_force_mapping'
                        )}
                        checked={entry[field] === true}
                        disabled={mutating}
                        onCheckedChange={(checked) => onUpdate(idx, { [field]: checked })}
                      />
                    ))}
                  </>
                ) : (
                  <ModelAdvancedFields
                    entry={entry}
                    providerBrand={providerBrand}
                    disabled={mutating}
                    supportsThinking={supportsThinking}
                    onUpdate={(patch) => onUpdate(idx, patch)}
                  />
                )}
              </div>
            ) : null}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={mutating} onClick={handleAdd}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} />
          {t('providersPage.form.addModel')}
        </Button>
        {models.length > COLLAPSED_LIMIT ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll
              ? t('providersPage.form.showFewerEntries')
              : t('providersPage.form.showAllEntries', { count: models.length })}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
