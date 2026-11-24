import { memo, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Copy01Icon, Delete02Icon, PencilEdit02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAuthStore, useNotificationStore } from '@/stores';
import { apiKeyNameFingerprint, readApiKeyNames, saveApiKeyName } from '../../apiKeyNames';
import { copyToClipboard } from '@/utils/clipboard';
import { makeClientId } from '@/types/visualConfig';
import { generateSecureApiKey } from '@/utils/apiKey';
import { maskApiKey } from '@/utils/format';
import { isValidApiKeyCharset } from '@/utils/validation';
import { ApiKeyStrengthMeter } from './ApiKeyStrengthMeter';
import { Hint } from '@/components/ui/tooltip';

interface ApiKeysCardEditorProps {
  value: string;
  disabled?: boolean;
  onChange: (nextValue: string) => void;
}

export const ApiKeysCardEditor = memo(function ApiKeysCardEditor(props: ApiKeysCardEditorProps) {
  const apiBase = useAuthStore((state) => state.apiBase);
  return <ScopedApiKeysCardEditor key={apiBase} {...props} apiBase={apiBase} />;
});

function ScopedApiKeysCardEditor({
  value,
  disabled,
  onChange,
  apiBase,
}: ApiKeysCardEditorProps & { apiBase: string }) {
  const [names, setNames] = useState(() => readApiKeyNames(apiBase));
  const [nameValue, setNameValue] = useState('');
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const apiKeys = useMemo(
    () =>
      value
        .split('\n')
        .map((key) => key.trim())
        .filter(Boolean),
    [value]
  );
  const nameFingerprints = useMemo(
    () => apiKeys.map((key) => apiKeyNameFingerprint(apiBase, key)),
    [apiBase, apiKeys]
  );
  const [apiKeyIds, setApiKeyIds] = useState(() => apiKeys.map(() => makeClientId()));
  const renderApiKeyIds = useMemo(() => {
    if (apiKeyIds.length === apiKeys.length) return apiKeyIds;
    if (apiKeyIds.length > apiKeys.length) return apiKeyIds.slice(0, apiKeys.length);
    return [
      ...apiKeyIds,
      ...Array.from({ length: apiKeys.length - apiKeyIds.length }, () => makeClientId()),
    ];
  }, [apiKeyIds, apiKeys.length]);

  const apiKeyInputId = useId();
  const nameInputId = useId();
  const nameHintId = `${nameInputId}-hint`;
  const apiKeyHintId = `${apiKeyInputId}-hint`;
  const apiKeyErrorId = `${apiKeyInputId}-error`;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingApiKeyId, setEditingApiKeyId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [formError, setFormError] = useState('');

  const openAddModal = () => {
    setNameValue('');
    setEditingApiKeyId(null);
    setInputValue('');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (apiKeyId: string) => {
    const editingIndex = renderApiKeyIds.findIndex((id) => id === apiKeyId);
    const latestNames = readApiKeyNames(apiBase);
    setNames(latestNames);
    setNameValue(latestNames[nameFingerprints[editingIndex]] ?? '');
    setEditingApiKeyId(apiKeyId);
    setInputValue(apiKeys[editingIndex] ?? '');
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setInputValue('');
    setEditingApiKeyId(null);
    setFormError('');
  };

  const updateApiKeys = (nextKeys: string[]) => {
    onChange(nextKeys.join('\n'));
  };

  const handleDelete = (apiKeyId: string) => {
    const index = renderApiKeyIds.findIndex((id) => id === apiKeyId);
    if (index < 0) return;
    setApiKeyIds(renderApiKeyIds.filter((id) => id !== apiKeyId));
    updateApiKeys(apiKeys.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setFormError(t('config_management.visual.api_keys.error_empty'));
      return;
    }
    if (!isValidApiKeyCharset(trimmed)) {
      setFormError(t('config_management.visual.api_keys.error_invalid'));
      return;
    }

    const editingIndex = editingApiKeyId
      ? renderApiKeyIds.findIndex((id) => id === editingApiKeyId)
      : -1;
    const nextKeys =
      editingApiKeyId === null
        ? [...apiKeys, trimmed]
        : apiKeys.map((key, idx) => (idx === editingIndex ? trimmed : key));
    if (!saveApiKeyName(apiBase, trimmed, nameValue)) {
      setFormError(t('config_management.visual.api_keys.name_save_error'));
      return;
    }
    setNames(readApiKeyNames(apiBase));
    // Retain old fingerprints: configuration edits can still be discarded or fail to save.
    if (editingApiKeyId === null) {
      setApiKeyIds([...renderApiKeyIds, makeClientId()]);
    }
    if (nextKeys.join('\n') !== apiKeys.join('\n')) updateApiKeys(nextKeys);
    closeModal();
  };

  const handleCopy = async (apiKey: string) => {
    const copied = await copyToClipboard(apiKey);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const handleGenerate = () => {
    setInputValue(generateSecureApiKey());
    setFormError('');
  };

  // 40px tap targets on phones.
  const iconButtonClass = 'text-muted-foreground max-sm:size-10';
  const addButton = (className: string, variant?: 'outline') => (
    <Button variant={variant} className={className} onClick={openAddModal} disabled={disabled}>
      <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" strokeWidth={2} />
      {t('config_management.visual.api_keys.add')}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <span className="min-w-0 text-sm font-medium">
          {t('config_management.visual.api_keys.label')}
        </span>
        {/* Phones get a full-width button under the list instead, so the title keeps the row. */}
        {addButton('shrink-0 max-sm:hidden', 'outline')}
      </div>

      {apiKeys.length === 0 ? (
        <div className="py-4 text-center text-[13px] text-muted-foreground max-sm:rounded-lg max-sm:border max-sm:border-dashed max-sm:px-3">
          {t('config_management.visual.api_keys.empty')}
        </div>
      ) : (
        // The keys run edge to edge in the setting row instead of a box inside a box. On desktop
        // the list ends the card, so the card's own border closes it.
        <ol className="-mx-4 divide-y border-y sm:-mb-3.5 sm:border-b-0">
          {apiKeys.map((key, index) => {
            const name = names[nameFingerprints[index]];
            const masked = maskApiKey(String(key || ''));
            return (
              <li
                key={renderApiKeyIds[index] ?? `${key}-${index}`}
                className="flex items-center gap-3 py-1.5 pr-2 pl-4 max-sm:py-1"
              >
                <span className="w-6 shrink-0 font-mono text-xs text-faint tabular-nums max-sm:hidden">
                  {index + 1}
                </span>
                {/* Unnamed keys show only the masked key, not a generic "API Key" label. */}
                {name ? (
                  <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
                    <span className="truncate text-sm">{name}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {masked}
                    </span>
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{masked}</span>
                )}
                <span className="flex shrink-0 items-center">
                  <Hint label={t('common.copy')}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={iconButtonClass}
                      onClick={() => handleCopy(key)}
                      disabled={disabled}
                      aria-label={t('common.copy')}
                    >
                      <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.75} />
                    </Button>
                  </Hint>
                  <Hint label={t('config_management.visual.common.edit')}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={iconButtonClass}
                      onClick={() => openEditModal(renderApiKeyIds[index] ?? '')}
                      disabled={disabled}
                      aria-label={t('config_management.visual.common.edit')}
                    >
                      <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.75} />
                    </Button>
                  </Hint>
                  <Hint label={t('config_management.visual.common.delete')}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive max-sm:size-10"
                      onClick={() => handleDelete(renderApiKeyIds[index] ?? '')}
                      disabled={disabled}
                      aria-label={t('config_management.visual.common.delete')}
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} />
                    </Button>
                  </Hint>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {addButton('h-10 w-full sm:hidden', 'outline')}

      <Dialog open={modalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingApiKeyId !== null
                ? t('config_management.visual.api_keys.edit_title')
                : t('config_management.visual.api_keys.add_title')}
            </DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              handleSave();
            }}
          >
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor={nameInputId}>
                  {t('config_management.visual.api_keys.name_label')}
                </FieldLabel>
                <Input
                  id={nameInputId}
                  className="h-9"
                  value={nameValue}
                  onChange={(event) => setNameValue(event.target.value)}
                  placeholder={t('config_management.visual.api_keys.name_placeholder')}
                  aria-describedby={nameHintId}
                  disabled={disabled}
                />
                <FieldDescription id={nameHintId} className="text-[13px]">
                  {t('config_management.visual.api_keys.name_hint')}
                </FieldDescription>
              </Field>
              <Field data-invalid={Boolean(formError) || undefined}>
                <FieldLabel htmlFor={apiKeyInputId}>
                  {t('config_management.visual.api_keys.input_label')}
                </FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id={apiKeyInputId}
                    className="h-9 font-mono text-[13px] md:text-[13px]"
                    placeholder={t('config_management.visual.api_keys.input_placeholder')}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    disabled={disabled}
                    aria-describedby={formError ? `${apiKeyErrorId} ${apiKeyHintId}` : apiKeyHintId}
                    aria-invalid={Boolean(formError)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 shrink-0"
                    onClick={handleGenerate}
                    disabled={disabled}
                  >
                    {t('config_management.visual.api_keys.generate')}
                  </Button>
                </div>
                <ApiKeyStrengthMeter value={inputValue} />
                <FieldDescription id={apiKeyHintId} className="text-[13px]">
                  {t('config_management.visual.api_keys.input_hint')}
                </FieldDescription>
                {formError && <FieldError id={apiKeyErrorId}>{formError}</FieldError>}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal} disabled={disabled}>
                {t('config_management.visual.common.cancel')}
              </Button>
              <Button type="submit" disabled={disabled}>
                {editingApiKeyId !== null
                  ? t('common.save')
                  : t('config_management.visual.common.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
