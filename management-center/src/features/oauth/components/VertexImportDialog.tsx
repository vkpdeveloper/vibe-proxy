import { useId, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { File01Icon, Upload04Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmailPrivacyText } from '@/components/common/EmailPrivacyText';
import { cn } from '@/lib/utils';
import type { VertexImportState } from '../hooks/useVertexImport';
import { FlowAlert, FlowDialog, FlowView, ResultView, type DialogHeading } from './FlowDialogParts';

export interface VertexImportDialogProps {
  open: boolean;
  heading: DialogHeading;
  vertex: VertexImportState;
  onPickFile: (file: File | undefined) => void;
  onLocationChange: (value: string) => void;
  onImport: () => void;
  onImportAnother: () => void;
  onViewAuthFiles: () => void;
  onClose: () => void;
}

export function VertexImportDialog({
  open,
  heading,
  vertex,
  onPickFile,
  onLocationChange,
  onImport,
  onImportAnother,
  onViewAuthFiles,
  onClose,
}: VertexImportDialogProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileHintId = useId();
  const fileTitleId = useId();
  const fileLabelId = useId();
  const locationId = useId();
  const [dragging, setDragging] = useState(false);
  const result = vertex.result;

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    onPickFile(event.dataTransfer.files?.[0]);
  };

  const resultRows = result
    ? [
        { key: 'result_project', value: result.projectId },
        { key: 'result_email', value: result.email },
        { key: 'result_location', value: result.location },
        { key: 'result_file', value: result.authFile },
      ].filter((row): row is { key: string; value: string } => Boolean(row.value))
    : [];

  return (
    <FlowDialog open={open} heading={heading} onClose={onClose}>
      <FlowView key={result ? 'result' : 'form'}>
        {result ? (
          <ResultView
            title={t('vertex_import.result_title')}
            actions={
              <>
                <Button variant="outline" size="lg" className="h-9 px-4" onClick={onViewAuthFiles}>
                  {t('auth_login.view_auth_files')}
                </Button>
                <Button size="lg" className="h-9 px-4" onClick={onImportAnother}>
                  {t('vertex_import.import_another')}
                </Button>
              </>
            }
          >
            {resultRows.length > 0 && (
              <dl className="mt-1 grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 rounded-lg border p-3 text-left text-sm">
                {resultRows.map((row) => (
                  <div className="contents" key={row.key}>
                    <dt className="text-muted-foreground">{t(`vertex_import.${row.key}`)}</dt>
                    <dd className="min-w-0 truncate font-mono text-xs leading-5">
                      <EmailPrivacyText text={row.value} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </ResultView>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t('vertex_import.description')}</p>

            <FieldGroup>
              <Field>
                <FieldTitle id={fileLabelId}>{t('vertex_import.file_label')}</FieldTitle>
                {/* Stretched button keeps the email reveal button out of the click target */}
                <div
                  className={cn(
                    'relative flex min-w-0 items-center gap-3 rounded-lg border border-dashed border-input p-3 transition-colors duration-150 ease-out hover:bg-muted/50 has-[button:focus-visible]:border-ring has-[button:focus-visible]:ring-3 has-[button:focus-visible]:ring-ring/50',
                    dragging && 'border-primary bg-primary/10 hover:bg-primary/10',
                    vertex.file && !dragging && 'border-solid'
                  )}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                >
                  <button
                    type="button"
                    className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground outline-none after:absolute after:inset-0 after:rounded-lg"
                    onClick={() => fileInputRef.current?.click()}
                    aria-labelledby={`${fileLabelId} ${fileTitleId}`}
                    aria-describedby={fileHintId}
                  >
                    <HugeiconsIcon
                      icon={vertex.file ? File01Icon : Upload04Icon}
                      strokeWidth={1.75}
                      className="size-4"
                    />
                  </button>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className={cn(
                        'truncate text-sm',
                        vertex.file ? 'font-mono text-xs leading-5' : 'font-medium'
                      )}
                      id={fileTitleId}
                    >
                      <EmailPrivacyText
                        text={vertex.file?.name ?? ''}
                        fallback={t('vertex_import.drop_hint')}
                      />
                    </span>
                    <span className="text-sm text-muted-foreground" id={fileHintId}>
                      {vertex.file ? t('vertex_import.choose_file') : t('vertex_import.file_hint')}
                    </span>
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={(event) => {
                    onPickFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor={locationId}>{t('vertex_import.location_label')}</FieldLabel>
                <Input
                  id={locationId}
                  className="h-9"
                  value={vertex.location}
                  onChange={(event) => onLocationChange(event.target.value)}
                  placeholder={t('vertex_import.location_placeholder')}
                  spellCheck={false}
                />
                <FieldDescription>{t('vertex_import.location_hint')}</FieldDescription>
              </Field>
            </FieldGroup>

            {vertex.error && <FlowAlert>{vertex.error}</FlowAlert>}

            <Button
              size="lg"
              className="h-9 w-fit px-4"
              onClick={onImport}
              disabled={!vertex.file || vertex.loading}
            >
              {t('vertex_import.import_button')}
            </Button>
          </>
        )}
      </FlowView>
    </FlowDialog>
  );
}
