import {
  anthropicResetGrantBlocker,
  type AnthropicResetGrantStatus,
} from '@/services/api/claudeResetGrants';

/** Grants that can be claimed right now. */
export function usableResetGrants(status: AnthropicResetGrantStatus, now: number) {
  if (status.cooldownUntil && Date.parse(status.cooldownUntil) > now) return [];
  return status.grants.filter(
    (grant) =>
      !anthropicResetGrantBlocker(status, grant.id) &&
      (!grant.startsAt || Date.parse(grant.startsAt) <= now) &&
      (!grant.endsAt || Date.parse(grant.endsAt) > now)
  );
}

/** Spend the grant closest to expiring; undated grants go last, ties by stable ID. */
export function selectResetGrant(status: AnthropicResetGrantStatus, now: number) {
  const endsAt = (value: string | null) => (value ? Date.parse(value) : Infinity);
  return usableResetGrants(status, now).sort(
    (a, b) => endsAt(a.endsAt) - endsAt(b.endsAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )[0];
}
