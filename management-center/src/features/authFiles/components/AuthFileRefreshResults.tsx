import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AuthFileRefreshResult } from '@/services/api/authFiles';

export function AuthFileRefreshResultsContent({ results }: { results: AuthFileRefreshResult[] }) {
  const { t } = useTranslation();
  const success = results.filter((result) => result.success).length;
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <p role="status" className="text-muted-foreground">
        {results.length === 0
          ? t('auth_files.refresh_all_empty')
          : t('auth_files.refresh_all_summary', { success, failed: results.length - success })}
      </p>
      {results.length > 0 && (
        <ul className="flex max-h-[50vh] flex-col divide-y overflow-y-auto rounded-lg border">
          {results.map((result, index) => (
            <li key={`${result.id}:${index}`} className="flex flex-col gap-1 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <strong className="min-w-0 truncate font-mono text-xs font-normal">
                  {result.id}
                </strong>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 text-xs',
                    result.success ? 'text-success' : 'text-destructive'
                  )}
                >
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      result.success ? 'bg-success' : 'bg-destructive'
                    )}
                  />
                  {t(
                    result.success
                      ? 'auth_files.refresh_result_success'
                      : 'auth_files.refresh_result_failed'
                  )}
                </span>
              </div>
              {!result.success && result.error && (
                <p className="text-xs break-words text-muted-foreground">{result.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AuthFileRefreshResults({
  results,
  onClose,
}: {
  results: AuthFileRefreshResult[] | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={results !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('auth_files.refresh_all_results')}</DialogTitle>
        </DialogHeader>
        {results !== null && <AuthFileRefreshResultsContent results={results} />}
        <DialogFooter>
          <DialogClose asChild>
            <Button>{t('common.close')}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
