import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { buildSmoothLinePath } from './curve';

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 32;
/** Room above the peak so the line is never clipped. */
const TOP_PADDING = 3;

interface SparklineProps {
  points: number[];
  ariaLabel: string;
  /** Sets the line colour through `currentColor`, e.g. `text-success`. */
  className?: string;
}

/** A one-series line with a faint area under it. The row's text carries the value. */
export function Sparkline({ points, ariaLabel, className }: SparklineProps) {
  const geometry = useMemo(() => {
    const values = points.filter((value) => Number.isFinite(value));
    if (values.length === 0) return null;

    const max = Math.max(...values);
    const stepX = values.length > 1 ? VIEW_WIDTH / (values.length - 1) : 0;
    const coordinates = values.map((value, index) => ({
      x: values.length > 1 ? index * stepX : VIEW_WIDTH / 2,
      y: VIEW_HEIGHT - (max > 0 ? value / max : 0) * (VIEW_HEIGHT - TOP_PADDING),
    }));

    const line = buildSmoothLinePath(coordinates, TOP_PADDING, VIEW_HEIGHT);
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    const area = `${line} L${last.x.toFixed(2)} ${VIEW_HEIGHT} L${first.x.toFixed(2)} ${VIEW_HEIGHT} Z`;
    return { line, area, flat: max <= 0 };
  }, [points]);

  if (!geometry) return <div className={cn('h-6', className)} aria-hidden="true" />;

  return (
    <svg
      className={cn('h-6 w-full overflow-visible', geometry.flat && 'text-faint', className)}
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      {!geometry.flat && <path d={geometry.area} fill="currentColor" opacity={0.12} />}
      <path
        d={geometry.line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
