import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlugSocketIcon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import { PROVIDER_LOGOS, type ProviderBrandLogoKey } from '../brandLogos';

type ProviderLogoProps = { className?: string } & (
  | { brand: ProviderBrandLogoKey }
  /** `flush` is for artwork that already carries its own rounded tile. */
  | { src: string; flush?: boolean }
);

/**
 * A provider's mark on a dark rounded tile. Glyph logos are inset; logos that ship their own
 * tile fill it. Falls back to a plug icon when a plugin logo fails to load.
 */
export function ProviderLogo({ className, ...props }: ProviderLogoProps) {
  const logo = 'brand' in props ? PROVIDER_LOGOS[props.brand] : null;
  const src = logo ? (logo.darkSrc ?? logo.src) : 'src' in props ? props.src : '';
  const flush = logo ? Boolean(logo.themeSurface) : 'flush' in props && Boolean(props.flush);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const broken = !src || failedSrc === src;

  return (
    <span
      className={cn(
        'grid size-6 shrink-0 place-items-center overflow-hidden rounded-md bg-black ring-1 ring-white/10',
        className
      )}
    >
      {broken ? (
        <HugeiconsIcon
          icon={PlugSocketIcon}
          strokeWidth={1.75}
          className="size-1/2 text-muted-foreground"
        />
      ) : (
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setFailedSrc(src)}
          className={cn('size-full object-contain', !flush && 'p-[18%]')}
        />
      )}
    </span>
  );
}
