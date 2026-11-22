import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useNotificationStore } from '@/stores';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons';
import { Section } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription } from '@/components/ui/empty';
import { APIKEY_FUN_AFFILIATE_URL, APIKEY_FUN_DASHBOARD_URL } from '../sponsor';
import { isSponsorPartialMutationError } from '../sponsorMutationRecovery';
import type { ProviderEntryFormInput, ProviderResource } from '../types';
import type { UseProviderWorkbenchResult } from '../useProviderWorkbench';
import { SponsorProviderForm } from '../sheets/forms/SponsorProviderForm';
import { ProviderLogo } from './ProviderLogo';

interface SponsorQuickStartPanelProps {
  resource: ProviderResource | null;
  workbench: UseProviderWorkbenchResult;
  mutationDisabled?: boolean;
}

export function SponsorQuickStartPanel({
  resource,
  workbench,
  mutationDisabled = false,
}: SponsorQuickStartPanelProps) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const formId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const formMutating = submitting || mutationDisabled || workbench.mutating;
  const mode = resource ? 'edit' : 'create';
  const submitDisabled = formMutating || (mode === 'edit' && !isDirty);

  useUnsavedChangesGuard({
    shouldBlock: isDirty && !submitting,
    dialog: {
      title: t('providersPage.unsavedChanges.title'),
      message: t('providersPage.unsavedChanges.message'),
      confirmText: t('providersPage.unsavedChanges.discard'),
      cancelText: t('providersPage.unsavedChanges.keepEditing'),
      variant: 'danger',
    },
  });

  const handleSubmit = async (input: ProviderEntryFormInput) => {
    if (mutationDisabled) return;
    setSubmitting(true);
    try {
      if (resource) {
        await workbench.updateProvider(resource, input);
        showNotification(t('providersPage.toast.updated'), 'success');
      } else {
        await workbench.createProvider('apikeyFun', input);
        showNotification(t('providersPage.toast.created'), 'success');
        setShowCreateForm(false);
      }
      setIsDirty(false);
      setFormVersion((current) => current + 1);
    } catch (err) {
      if (isSponsorPartialMutationError(err)) {
        showNotification(t('providersPage.sponsor.partialMutationWarning'), 'warning');
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(
        `${t(resource ? 'notification.update_failed' : 'notification.add_failed')}: ${msg}`,
        'error'
      );
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const title = t('providersPage.providerNames.apikeyFun');
  const logo = <ProviderLogo brand="apikeyFun" className="size-7" />;

  if (!resource && !showCreateForm) {
    return (
      <Section title={title} icon={logo}>
        <Empty className="rounded-xl border border-dashed py-10">
          <EmptyDescription>{t('providersPage.sponsor.emptyRegisterHint')}</EmptyDescription>
          <EmptyContent className="flex-row flex-wrap justify-center">
            <Button type="button" onClick={() => setShowCreateForm(true)} disabled={formMutating}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} data-icon="inline-start" />
              {t('providersPage.actions.new')}
            </Button>
            <Button asChild variant="outline">
              <a href={APIKEY_FUN_AFFILIATE_URL} target="_blank" rel="noreferrer">
                {t('providersPage.sponsor.registerNow')}
                <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.75} data-icon="inline-end" />
              </a>
            </Button>
          </EmptyContent>
        </Empty>
      </Section>
    );
  }

  const actionHref = resource ? APIKEY_FUN_DASHBOARD_URL : APIKEY_FUN_AFFILIATE_URL;
  const actionLabel = resource
    ? t('providersPage.sponsor.dashboardLink')
    : t('providersPage.sponsor.registerLink');

  return (
    <Section
      title={title}
      icon={logo}
      actions={
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <a href={actionHref} target="_blank" rel="noreferrer">
            {actionLabel}
            <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.75} data-icon="inline-end" />
          </a>
        </Button>
      }
    >
      <SponsorProviderForm
        key={`${mode}:${resource?.id ?? 'new'}:${formVersion}`}
        resource={resource}
        mode={mode}
        mutating={formMutating}
        formId={formId}
        onSubmit={handleSubmit}
        onDirtyChange={setIsDirty}
      />

      <div className="flex justify-end gap-2 border-t pt-5">
        {!resource ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-9 px-4"
            onClick={() => {
              setShowCreateForm(false);
              setIsDirty(false);
              setFormVersion((current) => current + 1);
            }}
            disabled={submitting}
          >
            {t('providersPage.actions.cancel')}
          </Button>
        ) : null}
        <Button
          type="submit"
          form={formId}
          size="lg"
          className="h-9 px-4"
          disabled={submitDisabled}
        >
          {mode === 'create' ? t('providersPage.actions.create') : t('providersPage.actions.save')}
        </Button>
      </div>
    </Section>
  );
}
