import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@codemirror/state';
import { Chunk } from '@codemirror/merge';
import { HugeiconsIcon } from '@hugeicons/react';
import { File01Icon, Loading03Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type DiffModalProps = {
  open: boolean;
  original: string;
  modified: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
};

type UnifiedLineType = 'context' | 'addition' | 'deletion';

type UnifiedLine = {
  type: UnifiedLineType;
  oldNum: number | null;
  newNum: number | null;
  text: string;
};

type Hunk = {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: UnifiedLine[];
};

type DiffResult = {
  hunks: Hunk[];
  additions: number;
  deletions: number;
};

const DIFF_CONTEXT_LINES = 3;

const clampPos = (doc: Text, pos: number) => Math.max(0, Math.min(pos, doc.length));

function computeUnifiedDiff(original: string, modified: string): DiffResult {
  const oldDoc = Text.of(original.split('\n'));
  const newDoc = Text.of(modified.split('\n'));
  const chunks = Chunk.build(oldDoc, newDoc);

  let totalAdditions = 0;
  let totalDeletions = 0;

  const hunks: Hunk[] = chunks.map((chunk: Chunk) => {
    const lines: UnifiedLine[] = [];

    const hasDel = chunk.fromA < chunk.toA;
    const hasAdd = chunk.fromB < chunk.toB;

    // Collect deleted lines from old doc
    const delLines: { num: number; text: string }[] = [];
    if (hasDel) {
      const startLine = oldDoc.lineAt(chunk.fromA).number;
      const endLine = oldDoc.lineAt(chunk.toA - 1).number;
      for (let i = startLine; i <= endLine; i++) {
        delLines.push({ num: i, text: oldDoc.line(i).text });
      }
    }

    // Collect added lines from new doc
    const addLines: { num: number; text: string }[] = [];
    if (hasAdd) {
      const startLine = newDoc.lineAt(chunk.fromB).number;
      const endLine = newDoc.lineAt(chunk.toB - 1).number;
      for (let i = startLine; i <= endLine; i++) {
        addLines.push({ num: i, text: newDoc.line(i).text });
      }
    }

    totalDeletions += delLines.length;
    totalAdditions += addLines.length;

    // Compute context boundaries
    let ctxBeforeEndOld: number;
    let ctxAfterStartOld: number;
    let ctxBeforeEndNew: number;
    let ctxAfterStartNew: number;

    if (hasDel) {
      ctxBeforeEndOld = delLines[0].num - 1;
      ctxAfterStartOld = delLines[delLines.length - 1].num + 1;
    } else {
      const anchorPos = clampPos(oldDoc, chunk.fromA);
      const lineInfo = oldDoc.lineAt(anchorPos);
      if (chunk.fromA === lineInfo.from) {
        ctxBeforeEndOld = lineInfo.number - 1;
        ctxAfterStartOld = lineInfo.number;
      } else {
        ctxBeforeEndOld = lineInfo.number;
        ctxAfterStartOld = lineInfo.number + 1;
      }
    }

    if (hasAdd) {
      ctxBeforeEndNew = addLines[0].num - 1;
      ctxAfterStartNew = addLines[addLines.length - 1].num + 1;
    } else {
      const anchorPos = clampPos(newDoc, chunk.fromB);
      const lineInfo = newDoc.lineAt(anchorPos);
      if (chunk.fromB === lineInfo.from) {
        ctxBeforeEndNew = lineInfo.number - 1;
        ctxAfterStartNew = lineInfo.number;
      } else {
        ctxBeforeEndNew = lineInfo.number;
        ctxAfterStartNew = lineInfo.number + 1;
      }
    }

    // Context before
    const ctxBeforeCount = Math.min(
      DIFF_CONTEXT_LINES,
      Math.max(0, ctxBeforeEndOld),
      Math.max(0, ctxBeforeEndNew)
    );

    for (let i = ctxBeforeCount; i > 0; i--) {
      const oldNum = ctxBeforeEndOld - i + 1;
      const newNum = ctxBeforeEndNew - i + 1;
      if (oldNum >= 1 && newNum >= 1 && oldNum <= oldDoc.lines) {
        lines.push({
          type: 'context',
          oldNum,
          newNum,
          text: oldDoc.line(oldNum).text,
        });
      }
    }

    // Deletions
    for (const del of delLines) {
      lines.push({ type: 'deletion', oldNum: del.num, newNum: null, text: del.text });
    }

    // Additions
    for (const add of addLines) {
      lines.push({ type: 'addition', oldNum: null, newNum: add.num, text: add.text });
    }

    // Context after
    const ctxAfterCountOld = Math.max(
      0,
      Math.min(DIFF_CONTEXT_LINES, oldDoc.lines - ctxAfterStartOld + 1)
    );
    const ctxAfterCountNew = Math.max(
      0,
      Math.min(DIFF_CONTEXT_LINES, newDoc.lines - ctxAfterStartNew + 1)
    );
    const ctxAfterCount = Math.min(ctxAfterCountOld, ctxAfterCountNew);

    for (let i = 0; i < ctxAfterCount; i++) {
      const oldNum = ctxAfterStartOld + i;
      const newNum = ctxAfterStartNew + i;
      if (oldNum >= 1 && oldNum <= oldDoc.lines && newNum >= 1 && newNum <= newDoc.lines) {
        lines.push({
          type: 'context',
          oldNum,
          newNum,
          text: oldDoc.line(oldNum).text,
        });
      }
    }

    // Compute hunk header values
    const firstOld = lines.find((l) => l.oldNum !== null)?.oldNum ?? 1;
    const firstNew = lines.find((l) => l.newNum !== null)?.newNum ?? 1;
    const oldCount = lines.filter((l) => l.type !== 'addition').length;
    const newCount = lines.filter((l) => l.type !== 'deletion').length;

    return { oldStart: firstOld, oldCount, newStart: firstNew, newCount, lines };
  });

  return { hunks, additions: totalAdditions, deletions: totalDeletions };
}

const STAT_BLOCKS = 5;

function StatBar({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions;
  if (total === 0) return null;
  const addBlocks = Math.round((additions / total) * STAT_BLOCKS);
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {Array.from({ length: STAT_BLOCKS }, (_, i) => (
        <span
          key={i}
          className={cn('size-2 rounded-[2px]', i < addBlocks ? 'bg-success' : 'bg-destructive')}
        />
      ))}
    </span>
  );
}

const lineTone: Record<UnifiedLineType, string> = {
  context: 'text-muted-foreground',
  addition: 'bg-success/10 text-foreground',
  deletion: 'bg-destructive/10 text-foreground',
};

const prefixTone: Record<UnifiedLineType, string> = {
  context: 'text-faint',
  addition: 'text-success',
  deletion: 'text-destructive',
};

export function DiffModal({
  open,
  original,
  modified,
  onConfirm,
  onCancel,
  loading = false,
}: DiffModalProps) {
  const { t } = useTranslation();

  const diff = useMemo<DiffResult>(
    () => computeUnifiedDiff(original, modified),
    [original, modified]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !loading) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={!loading}
        className="flex max-h-[min(52rem,calc(100dvh-2rem))] flex-col sm:max-w-5xl"
      >
        <DialogHeader>
          <DialogTitle>{t('config_management.diff.title')}</DialogTitle>
          <DialogDescription className="sr-only">config.yaml</DialogDescription>
        </DialogHeader>

        {diff.hunks.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            {t('config_management.diff.no_changes')}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <HugeiconsIcon
                icon={File01Icon}
                strokeWidth={1.75}
                className="size-4 text-muted-foreground"
              />
              <span className="font-mono text-[13px]">config.yaml</span>
              <span className="ml-auto flex items-center gap-2 font-mono text-xs tabular-nums">
                <span className="text-success">+{diff.additions}</span>
                <span className="text-destructive">-{diff.deletions}</span>
                <StatBar additions={diff.additions} deletions={diff.deletions} />
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-auto font-mono text-[12px] leading-5">
              {diff.hunks.map((hunk, hunkIdx) => (
                <div key={hunkIdx} className="min-w-fit">
                  <div className="bg-primary/8 px-3 py-1 text-primary/90">
                    @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
                  </div>
                  {hunk.lines.map((line, lineIdx) => (
                    <div
                      key={`${hunkIdx}-${lineIdx}`}
                      className={cn(
                        'grid grid-cols-[2.75rem_2.75rem_1.25rem_1fr]',
                        lineTone[line.type]
                      )}
                    >
                      <span className="pr-2 text-right text-faint select-none tabular-nums">
                        {line.oldNum ?? ''}
                      </span>
                      <span className="pr-2 text-right text-faint select-none tabular-nums">
                        {line.newNum ?? ''}
                      </span>
                      <span className={cn('select-none', prefixTone[line.type])}>
                        {line.type === 'deletion' ? '-' : line.type === 'addition' ? '+' : ' '}
                      </span>
                      <code className="pr-3 whitespace-pre">{line.text || ' '}</code>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={loading} aria-busy={loading || undefined}>
            {loading ? (
              <HugeiconsIcon
                icon={Loading03Icon}
                data-icon="inline-start"
                strokeWidth={2}
                className="animate-spin motion-reduce:animate-none"
              />
            ) : null}
            {t('config_management.diff.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
