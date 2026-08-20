import type { CSSProperties, HTMLAttributes } from 'react';

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  /** Number of stacked lines to render. */
  lines?: number;
}

export function Skeleton({ width = '100%', height = '1rem', lines = 1, style, ...rest }: SkeletonProps) {
  const block = (key?: number) => (
    <span
      key={key}
      className="od-skeleton"
      aria-hidden="true"
      style={{ width, height, marginBottom: key === undefined ? undefined : '0.5rem', ...style }}
      {...rest}
    />
  );
  if (lines <= 1) return block();
  return (
    <>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} style={{ display: 'block' }}>
          {block(i)}
        </span>
      ))}
    </>
  );
}
