import { useCallback, useEffect, useId, useImperativeHandle, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { PencilEdit02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { ProviderRecentUsageMap } from '@/components/providers/utils';
import { useNotificationStore } from '@/stores';
import { PROVIDER_DESCRIPTORS } from '../descriptors';
import { isMultiProtocolSponsorBrand } from '../sponsorDefinitions';
import type { ProviderBrand, ProviderEntryFormInput, ProviderResource } from '../types';
import type { UseProviderWorkbenchResult } from '../useProviderWorkbench';
import { BaseProviderForm } from './forms/BaseProviderForm';
import { ResourceDetailView } from './ResourceDetailView';
import { SponsorProviderForm } from './forms/SponsorProviderForm';

type SheetMode = 'detail' | 'create' | 'edit';

export interface ProviderSheetState {
  open: boolean;
  brand: ProviderBrand;
  mode: SheetMode;
  resource: ProviderResource | null;
}

export interface ProviderSheetHandle {
  confirmDiscardIfDirty: () => Promise<boolean>;
}

interface ProviderSheetProps {
  state: ProviderSheetState;
  onClose: () => void;
  onSwitchToEdit: () => void;
  workbench: UseProviderWorkbenchResult;
  onCreated: () => void;
  onUpdated: () => void;
  mutationDisabled?: boolean;
  usageByProvider?: ProviderRecentUsageMap;
  ref?: Ref<ProviderSheetHandle>;
}

export function ProviderSheet({
  state,
  onClose,
  onSwitchToEdit,
  workbench,
  onCreated,
  onUpdated,
  mutationDisabled = false,
  usageByProvider,
  ref,
}: ProviderSheetProps) {
  const { t } = useTranslation();
  const { showConfirmation } = useNotificationStore();
  const formId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Reset dirty flag whenever the sheet is closed or the editing target
  // (brand / resource / mode) changes; the child form will re-mount and
  // re-report its own dirty state.
  useEffect(() => {
    setIsDirty(false);
  }, [state.brand, state.mode, state.resource?.id, state.open]);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  const descriptor = PROVIDER_DESCRIPTORS[state.brand];
  const isEditingForm = state.mode === 'create' || state.mode === 'edit';
  const formMutating = submitting || mutationDisabled;
  const submitDisabled = formMutating || (state.mode === 'edit' && !isDirty);

  const confirmDiscardIfDirty = useCallback((): Promise<boolean> => {
    if (!isEditingForm || !isDirty || submitting) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      showConfirmation({
        title: t('providersPage.unsavedChanges.title'),
        message: t('providersPage.unsavedChanges.message'),
        variant: 'danger',
        confirmText: t('providersPage.unsavedChanges.discard'),
        cancelText: t('providersPage.unsavedChanges.keepEditing'),
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }, [isDirty, isEditingForm, showConfirmation, submitting, t]);

  useImperativeHandle(ref, () => ({ confirmDiscardIfDirty }), [confirmDiscardIfDirty]);

  const handleCancelClick = useCallback(() => {
    void confirmDiscardIfDirty().then((ok) => {
      if (ok) onClose();
    });
  }, [confirmDiscardIfDirty, onClose]);

  const titleText =
    state.mode === 'create'
      ? `${t('providersPage.form.createEyebrow')} · ${t(
          `providersPage.providerNames.${state.brand}`
        )}`
      : state.mode === 'edit'
        ? `${t('providersPage.form.editEyebrow')} · ${t(
            `providersPage.providerNames.${state.brand}`
          )}`
        : `${t('providersPage.detail.title')} · ${t(`providersPage.providerNames.${state.brand}`)}`;

  const handleCreate = useCallback(
    async (input: ProviderEntryFormInput) => {
      if (mutationDisabled) return;
      setSubmitting(true);
      try {
        await workbench.createProvider(state.brand, input);
        onCreated();
      } finally {
        setSubmitting(false);
      }
    },
    [mutationDisabled, onCreated, state.brand, workbench]
  );

  const handleUpdate = useCallback(
    async (input: ProviderEntryFormInput) => {
      if (!state.resource || mutationDisabled || !isDirty) return;
      setSubmitting(true);
      try {
        await workbench.updateProvider(state.resource, input);
        onUpdated();
      } finally {
        setSubmitting(false);
      }
    },
    [isDirty, mutationDisabled, onUpdated, state.resource, workbench]
  );

  const renderBody = () => {
    if (state.mode === 'detail') {
      if (!state.resource) {
        return null;
      }
      return <ResourceDetailView resource={state.resource} usageByProvider={usageByProvider} />;
    }
    const formKey = `${state.brand}:${state.resource?.id ?? 'new'}:${state.mode}`;
    if (isMultiProtocolSponsorBrand(state.brand)) {
      return (
        <SponsorProviderForm
          key={formKey}
          brand={state.brand}
          resource={state.resource}
          mode={state.mode}
          mutating={formMutating}
          formId={formId}
          onSubmit={state.mode === 'create' ? handleCreate : handleUpdate}
          onDirtyChange={handleDirtyChange}
        />
      );
    }
    return (
      <BaseProviderForm
        key={formKey}
        brand={state.brand}
        resource={state.resource}
        mode={state.mode}
        mutating={formMutating}
        formId={formId}
        onSubmit={state.mode === 'create' ? handleCreate : handleUpdate}
        onDirtyChange={handleDirtyChange}
      />
    );
  };

  const footerButton = 'h-9 px-4';
  const footer =
    state.mode === 'detail' ? (
      <>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className={footerButton}
          onClick={onClose}
        >
          {t('providersPage.actions.cancel')}
        </Button>
        {state.resource ? (
          <Button
            type="button"
            size="lg"
            className={footerButton}
            onClick={onSwitchToEdit}
            disabled={formMutating}
          >
            <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.75} data-icon="inline-start" />
            {t('providersPage.actions.edit')}
          </Button>
        ) : null}
      </>
    ) : (
      <>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className={footerButton}
          onClick={handleCancelClick}
          disabled={submitting}
        >
          {t('providersPage.actions.cancel')}
        </Button>
        <Button
          type="submit"
          form={formId}
          size="lg"
          className={footerButton}
          disabled={submitDisabled}
        >
          {state.mode === 'create'
            ? t('providersPage.actions.create')
            : t('providersPage.actions.save')}
        </Button>
      </>
    );

  // Closing by overlay, Escape or the close button asks before discarding unsaved edits.
  const handleOpenChange = (open: boolean) => {
    if (open || submitting) return;
    void confirmDiscardIfDirty().then((ok) => {
      if (ok) onClose();
    });
  };

  return (
    <Sheet open={state.open} onOpenChange={handleOpenChange}>
      <SheetContent
        aria-describedby={undefined}
        className={cn(
          'gap-0 data-[side=right]:w-full',
          descriptor.sheetSize === 'md'
            ? 'data-[side=right]:sm:max-w-xl'
            : 'data-[side=right]:sm:max-w-2xl'
        )}
      >
        <SheetHeader className="border-b px-6 py-5 pr-14">
          <SheetTitle className="truncate">{titleText}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{renderBody()}</div>
        <SheetFooter className="mt-0 flex-row justify-end border-t px-6 py-4">{footer}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
