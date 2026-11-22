import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SiwcBindingStatus } from '../siwcBinding';

const DOT: Record<SiwcBindingStatus, string> = {
  active: 'bg-success',
  bound: 'bg-warning',
  unbound: 'bg-faint',
};

/**
 * SIWC binding status: a dot and a short word. `withLabel` drops the "SIWC" prefix where the
 * context already says it (inside the SIWC dialog).
 */
export function SiwcStatusBadge({
  status,
  withLabel = true,
}: {
  status: SiwcBindingStatus;
  withLabel?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className="gap-1.5 text-muted-foreground" data-status={status}>
      <span className={cn('size-1.5 rounded-full', DOT[status])} aria-hidden="true" />
      {withLabel && <span className="text-foreground">SIWC</span>}
      <span>{t(`siwc.${status}`)}</span>
    </Badge>
  );
}
