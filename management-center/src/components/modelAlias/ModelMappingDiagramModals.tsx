import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon, Delete02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { AliasNode, SourceNode } from './ModelMappingDiagramTypes';
import { Hint } from '@/components/ui/tooltip';

function DiagramDialog({
  open,
  onClose,
  title,
  wide = false,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent aria-describedby={undefined} className={wide ? 'sm:max-w-2xl' : 'sm:max-w-sm'}>
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60dvh] min-w-0 overflow-y-auto">{children}</div>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface NameAliasModalProps {
  open: boolean;
  t: TFunction;
  value: string;
  error: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

function NameAliasModal({
  open,
  t,
  value,
  error,
  onChange,
  onClose,
  onSubmit,
  title,
  label,
  placeholder,
  submitLabel,
}: NameAliasModalProps & {
  title: string;
  label: string;
  placeholder: string;
  submitLabel: string;
}) {
  return (
    <DiagramDialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onSubmit}>{submitLabel}</Button>
        </>
      }
    >
      <Field data-invalid={Boolean(error) || undefined}>
        <FieldLabel htmlFor="diagram-alias-name">{label}</FieldLabel>
        <Input
          id="diagram-alias-name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
          }}
          aria-invalid={Boolean(error) || undefined}
          placeholder={placeholder}
          autoFocus
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
    </DiagramDialog>
  );
}

export function RenameAliasModal(props: NameAliasModalProps) {
  const { t } = props;
  return (
    <NameAliasModal
      {...props}
      title={t('oauth_model_alias.diagram_rename_alias_title')}
      label={t('oauth_model_alias.diagram_rename_alias_label')}
      placeholder={t('oauth_model_alias.diagram_rename_placeholder')}
      submitLabel={t('oauth_model_alias.diagram_rename_btn')}
    />
  );
}

export function AddAliasModal(props: NameAliasModalProps) {
  const { t } = props;
  return (
    <NameAliasModal
      {...props}
      title={t('oauth_model_alias.diagram_add_alias_title')}
      label={t('oauth_model_alias.diagram_add_alias_label')}
      placeholder={t('oauth_model_alias.diagram_add_placeholder')}
      submitLabel={t('oauth_model_alias.diagram_add_btn')}
    />
  );
}

type ToggleFork = (provider: string, sourceModel: string, alias: string, fork: boolean) => void;
type Unlink = (provider: string, sourceModel: string, alias: string) => void;

/** One source → alias link with its fork switch and an unlink button. */
function LinkRow({
  t,
  source,
  alias,
  fork,
  onToggleFork,
  onUnlink,
}: {
  t: TFunction;
  source: SourceNode;
  alias: string;
  fork: boolean;
  onToggleFork: ToggleFork;
  onUnlink: Unlink;
}) {
  const unlinkLabel = t('oauth_model_alias.diagram_delete_link', {
    provider: source.provider,
    name: source.name,
  });
  return (
    <div className="flex flex-col gap-2 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
        <span className="truncate">{source.name}</span>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={1.75}
          className="size-3.5 shrink-0 text-faint"
        />
        <span className="truncate">{alias}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          {t('oauth_model_alias.alias_fork_label')}
          <Switch
            checked={fork}
            onCheckedChange={(value) => onToggleFork(source.provider, source.name, alias, value)}
          />
        </label>
        <Hint label={unlinkLabel}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onUnlink(source.provider, source.name, alias)}
            aria-label={unlinkLabel}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} />
          </Button>
        </Hint>
      </div>
    </div>
  );
}

function LinkList({ children }: { children: ReactNode }) {
  return <div className="divide-y rounded-xl border bg-card">{children}</div>;
}

function NoLinks({ t }: { t: TFunction }) {
  return (
    <p className="py-6 text-center text-[13px] text-muted-foreground">
      {t('oauth_model_alias.diagram_settings_empty')}
    </p>
  );
}

interface SettingsAliasModalProps {
  open: boolean;
  t: TFunction;
  alias: string | null;
  aliasNodes: AliasNode[];
  onClose: () => void;
  onToggleFork: ToggleFork;
  onUnlink: Unlink;
}

export function SettingsAliasModal({
  open,
  t,
  alias,
  aliasNodes,
  onClose,
  onToggleFork,
  onUnlink,
}: SettingsAliasModalProps) {
  const node = alias ? aliasNodes.find((n) => n.alias === alias) : undefined;
  return (
    <DiagramDialog
      open={open}
      onClose={onClose}
      wide
      title={t('oauth_model_alias.diagram_settings_title', { alias: alias ?? '' })}
      footer={
        <Button variant="outline" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {alias && node && node.sources.length > 0 ? (
        <LinkList>
          {node.sources.map((source) => (
            <LinkRow
              key={source.id}
              t={t}
              source={source}
              alias={alias}
              fork={source.aliases.find((item) => item.alias === alias)?.fork === true}
              onToggleFork={onToggleFork}
              onUnlink={onUnlink}
            />
          ))}
        </LinkList>
      ) : alias ? (
        <NoLinks t={t} />
      ) : null}
    </DiagramDialog>
  );
}

interface SettingsSourceModalProps {
  open: boolean;
  t: TFunction;
  source: SourceNode | null;
  onClose: () => void;
  onToggleFork: ToggleFork;
  onUnlink: Unlink;
}

export function SettingsSourceModal({
  open,
  t,
  source,
  onClose,
  onToggleFork,
  onUnlink,
}: SettingsSourceModalProps) {
  return (
    <DiagramDialog
      open={open}
      onClose={onClose}
      wide
      title={t('oauth_model_alias.diagram_settings_source_title')}
      footer={
        <Button variant="outline" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {source && source.aliases.length > 0 ? (
        <LinkList>
          {source.aliases.map((entry) => (
            <LinkRow
              key={`${source.id}-${entry.alias}`}
              t={t}
              source={source}
              alias={entry.alias}
              fork={entry.fork === true}
              onToggleFork={onToggleFork}
              onUnlink={onUnlink}
            />
          ))}
        </LinkList>
      ) : source ? (
        <NoLinks t={t} />
      ) : null}
    </DiagramDialog>
  );
}
