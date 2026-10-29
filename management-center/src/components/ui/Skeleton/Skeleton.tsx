import type { CSSProperties, HTMLAttributes } from 'react';
import { fillStyle } from '@/lib/dither';
import styles from './Skeleton.module.scss';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: number | string;
  height?: number | string;
  rounded?: number | string;
}

// A still dithered placeholder, denser on the left where content starts.
// No shimmer: a looping gradient repaints every frame for nothing.
const SKELETON_FILL = fillStyle('gradient', {
  color: 'grey',
  edge: 'left',
  length: 48,
  from: 0.5,
  to: 0.125,
});

export function Skeleton({ width, height, rounded, className, style, ...rest }: SkeletonProps) {
  const merged: CSSProperties = {
    ...SKELETON_FILL,
    ...style,
    width: width ?? style?.width,
    height: height ?? style?.height,
    borderRadius: rounded ?? style?.borderRadius,
  };
  const cls = [styles.skeleton, className].filter(Boolean).join(' ');
  return <div className={cls} style={merged} aria-hidden="true" {...rest} />;
}
