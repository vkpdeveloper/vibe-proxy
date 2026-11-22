import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/stores';
import { getAuthFileIcon, getTypeLabel } from '../constants';

/** A provider's mark on a small tile, like VM Bridge's provider logos. */
export function ProviderLogo({ type, className }: { type: string; className?: string }) {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const src = getAuthFileIcon(type, resolvedTheme);
  return (
    <span
      className={cn(
        'grid size-6 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary ring-1 ring-white/10',
        className
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-contain p-[20%]" draggable={false} />
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">
          {getTypeLabel(t, type).slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}
