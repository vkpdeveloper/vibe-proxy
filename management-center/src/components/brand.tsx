import { cn } from '@/lib/utils';

/** The VProxy mark (a loose wave enters the gate and leaves as three routes) on a rounded tile. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-7 shrink-0', className)} aria-label="VProxy">
      <rect width="64" height="64" rx="18" fill="#fff" />
      <path
        d="M9 32c3-10 6.5-10 9.5 0s6.5 10 9.5 0"
        fill="none"
        stroke="#000"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="31" y="14" width="5.5" height="36" rx="2.75" fill="#000" />
      <path
        d="M41 21.5h7M41 32h13M41 42.5h7"
        fill="none"
        stroke="#000"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}
