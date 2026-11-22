import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores';
import type { PluginStoreEntry } from '@/types';
import {
  buildRepositoryURL,
  getPluginConfirmToken,
  getPluginRepositorySlug,
  isDefaultPluginStoreSource,
  resolvePluginAssetURL,
} from '../pluginResources';
import { PluginLogo } from './PluginParts';

interface PluginInstallGateModalProps {
  open: boolean;
  entry: PluginStoreEntry | null;
  isUpdate: boolean;
  installing: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export function PluginInstallGateModal({
  open,
  entry,
  isUpdate,
  installing,
  onClose,
  onConfirm,
}: PluginInstallGateModalProps) {
  const { t } = useTranslation();
  const apiBase = useAuthStore((state) => state.apiBase);
  const [step, setStep] = useState(1);
  const [typed, setTyped] = useState('');
  const [wasOpen, setWasOpen] = useState(false);

  // Reset the gauntlet to step 1 on each fresh open. Adjusting state during render
  // (React's "you might not need an effect" guidance) avoids a setState-in-effect.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep(1);
      setTyped('');
    }
  }

  if (!entry) return null;

  const title = entry.name || entry.id;
  const repoSlug = getPluginRepositorySlug(entry.repository);
  const repositoryURL = buildRepositoryURL(entry.repository);
  const repoLabel = repoSlug || entry.id;
  const token = getPluginConfirmToken(entry);
  const logo = resolvePluginAssetURL(entry.logo, apiBase);
  const rawSourceText = entry.sourceName || entry.sourceUrl;
  const sourceText = isDefaultPluginStoreSource(entry)
    ? t('plugin_store.cli_proxy_api_source')
    : rawSourceText;
  const tokenMatches = typed.trim() === token;

  const handleClose = () => {
    if (installing) return;
    onClose();
  };

  const handleFinalConfirm = async () => {
    try {
      await onConfirm();
    } catch {
      // The caller surfaces the error via a notification; stay on this step.
    }
  };

  const identity = (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <PluginLogo src={logo} className="size-11" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium">{title}</span>
        {repositoryURL ? (
          <a
            className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            href={repositoryURL}
            target="_blank"
            rel="noreferrer"
            title={t('plugin_store.open_repository')}
            aria-label={t('plugin_store.open_repository')}
          >
            <span className="truncate">{repoLabel}</span>
            <HugeiconsIcon icon={LinkSquare02Icon} className="size-3 shrink-0" strokeWidth={1.75} />
          </a>
        ) : (
          <span className="truncate font-mono text-xs text-muted-foreground">{repoLabel}</span>
        )}
        {sourceText ? (
          <span className="truncate text-xs text-faint">
            {t('plugin_store.source_name', { source: sourceText })}
          </span>
        ) : null}
      </div>
    </div>
  );

  let body: ReactNode;
  let footer: ReactNode;

  if (step === 1) {
    body = identity;
    footer = (
      <Button variant="outline" size="lg" className="w-full" onClick={() => setStep(2)}>
        {t('plugin_store.gate_step1_action')}
      </Button>
    );
  } else if (step === 2) {
    body = (
      <>
        {identity}
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-[13px] text-warning">
          <HugeiconsIcon icon={Alert02Icon} className="mt-px size-4 shrink-0" strokeWidth={1.75} />
          <span>{t('plugin_store.gate_warning')}</span>
        </div>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px] text-muted-foreground marker:text-faint">
          <li>{t('plugin_store.gate_effect_runs_code')}</li>
          <li>{t('plugin_store.gate_effect_no_review')}</li>
          <li>{t('plugin_store.gate_effect_restart')}</li>
        </ul>
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-[13px] text-destructive">{t('plugin_store.gate_untrusted_alert')}</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">{t('plugin_store.gate_repository_label')}</dt>
            <dd className="truncate font-mono">{repoSlug || entry.repository || '-'}</dd>
            <dt className="text-muted-foreground">{t('plugin_store.gate_source_label')}</dt>
            <dd className="truncate">{sourceText || '-'}</dd>
          </dl>
        </div>
      </>
    );
    footer = (
      <Button variant="outline" size="lg" className="w-full" onClick={() => setStep(3)}>
        {t('plugin_store.gate_step2_action')}
      </Button>
    );
  } else {
    body = (
      <>
        {identity}
        <Field>
          <FieldLabel htmlFor="plugin-gate-confirm" className="font-normal">
            {t('plugin_store.gate_step3_prompt', { token })}
          </FieldLabel>
          <Input
            id="plugin-gate-confirm"
            className="h-9 font-mono"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={installing}
            aria-label={t('plugin_store.gate_step3_prompt', { token })}
          />
          <FieldDescription>{t('plugin_store.gate_step3_hint')}</FieldDescription>
        </Field>
      </>
    );
    footer = (
      <Button
        variant="destructive"
        size="lg"
        className="w-full"
        onClick={handleFinalConfirm}
        disabled={!tokenMatches || installing}
      >
        {t('plugin_store.gate_step3_action')}
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-md"
        showCloseButton={!installing}
        onEscapeKeyDown={(event) => installing && event.preventDefault()}
        onInteractOutside={(event) => installing && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {t(isUpdate ? 'plugin_store.gate_title_update' : 'plugin_store.gate_title', {
              name: title,
            })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('plugin_store.gate_untrusted_alert')}
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
