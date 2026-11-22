import type { HTMLAttributes } from 'react';
import { Skeleton as UiSkeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: number | string;
  height?: number | string;
  rounded?: number | string;
}

// A still placeholder. No pulse or shimmer: a looping animation repaints every frame for nothing.
export function Skeleton({ width, height, rounded, className, style, ...rest }: SkeletonProps) {
  return (
    <UiSkeleton
      className={cn('animate-none', className)}
      style={{
        ...style,
        width: width ?? style?.width,
        height: height ?? style?.height,
        borderRadius: rounded ?? style?.borderRadius,
      }}
      aria-hidden="true"
      {...rest}
    />
  );
}
