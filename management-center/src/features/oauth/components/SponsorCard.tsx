import { useId } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { LinkSquare02Icon } from '@hugeicons/core-free-icons';
import { buttonVariants } from '@/components/ui/button';
import { ProviderLogo } from '@/features/providers/components/ProviderLogo';
import type { ProviderFlowState } from '../hooks/useOAuthFlows';
import { ProviderTile } from './ProviderTile';

export interface SponsorCardSite {
  id: string;
  /** Full site name (e.g. "Kimi China"), the accessible name of the sign-in button. */
  name: string;
  /** Short visible site name (e.g. "China"); a substring of `name` (label in name). */
  region: string;
  domain: string;
  /** Its dialog is open or a sign-in is waiting. */
  active?: boolean;
  status?: ProviderFlowState['status'];
  statusLabel?: string;
  signUpUrl: string;
}

export interface SponsorCardProps {
  title: string;
  caption: string;
  /** Kimi's app icon, which carries its own rounded tile. */
  icon: string;
  signUpLabel: string;
  sites: SponsorCardSite[];
  /** Starts the site's sign-in and opens its dialog. */
  onOpen: (siteId: string) => void;
}

/** Sponsor card: one brand, one sign-in entry and one open platform sign-up link per site. */
export function SponsorCard({
  title,
  caption,
  icon,
  signUpLabel,
  sites,
  onOpen,
}: SponsorCardProps) {
  const titleId = useId();

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border bg-card p-3"
      role="group"
      aria-labelledby={titleId}
    >
      <div className="flex min-w-0 items-center gap-3">
        <ProviderLogo src={icon} flush className="size-9 rounded-lg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium" id={titleId}>
            {title}
          </p>
          <p className="text-sm text-muted-foreground">{caption}</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {sites.map((site) => (
          <ProviderTile
            key={site.id}
            label={site.region}
            name={site.name}
            caption={<span className="font-mono text-xs">{site.domain}</span>}
            active={site.active}
            status={site.status}
            statusLabel={site.statusLabel}
            onOpen={() => onOpen(site.id)}
            aside={
              <a
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                href={site.signUpUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${signUpLabel} · ${site.name}`}
              >
                {signUpLabel}
                <HugeiconsIcon
                  icon={LinkSquare02Icon}
                  data-icon="inline-end"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </a>
            }
          />
        ))}
      </div>
    </div>
  );
}
