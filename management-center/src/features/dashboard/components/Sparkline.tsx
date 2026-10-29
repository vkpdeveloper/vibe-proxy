import { useId, useMemo } from 'react';
import { cssColor, fillStyle } from '@/lib/dither';
import type { DitherColor } from '@/lib/dither';
import { buildSmoothLinePath } from './curve';
import styles from './Sparkline.module.scss';

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 32;
/** 顶部留白，避免峰值贴边被裁切 */
const TOP_PADDING = 3;

interface SparklineProps {
  points: number[];
  /** Line and area colour, a palette name or CSS colour. Default ink. */
  color?: DitherColor;
  ariaLabel: string;
  className?: string;
}

/**
 * Mini line chart: a 2px line over a dithered area that is densest at the top
 * of the box, so high stretches read darker than quiet ones. One series, so no
 * legend; the card's text carries the value.
 */
export function Sparkline({ points, color, ariaLabel, className }: SparklineProps) {
  // The id ends up in a CSS url(), so keep it to plain characters.
  const clipId = `spark${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const geometry = useMemo(() => {
    const values = points.filter((value) => Number.isFinite(value));
    if (values.length === 0) {
      return null;
    }

    const max = Math.max(...values);
    const usableHeight = VIEW_HEIGHT - TOP_PADDING;
    const stepX = values.length > 1 ? VIEW_WIDTH / (values.length - 1) : 0;

    const coordinates = values.map((value, index) => {
      const x = values.length > 1 ? index * stepX : VIEW_WIDTH / 2;
      const ratio = max > 0 ? value / max : 0;
      const y = VIEW_HEIGHT - ratio * usableHeight;
      return { x, y };
    });

    const line = buildSmoothLinePath(coordinates, TOP_PADDING, VIEW_HEIGHT);

    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    const area = `${line} L${last.x.toFixed(2)} ${VIEW_HEIGHT} L${first.x.toFixed(2)} ${VIEW_HEIGHT} Z`;

    return { line, area, isFlat: max <= 0 };
  }, [points]);

  if (!geometry) {
    return (
      <div className={[styles.empty, className].filter(Boolean).join(' ')} aria-hidden="true" />
    );
  }

  const strokeColor = geometry.isFlat ? '--text-quaternary' : (color ?? 'ink');

  return (
    <div
      className={['relative', styles.sparkline, className].filter(Boolean).join(' ')}
      role="img"
      aria-label={ariaLabel}
    >
      {!geometry.isFlat && (
        <div
          className="absolute inset-0"
          style={{
            clipPath: `url(#${clipId})`,
            ...fillStyle('gradient', {
              color: strokeColor,
              cell: 2,
              edge: 'top',
              length: 14,
              from: 0.75,
              to: 0.12,
            }),
          }}
        />
      )}
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            <path d={geometry.area} transform={`scale(${1 / VIEW_WIDTH} ${1 / VIEW_HEIGHT})`} />
          </clipPath>
        </defs>
        <path
          d={geometry.line}
          fill="none"
          stroke={cssColor(strokeColor)}
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
