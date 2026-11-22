import type { ClientApiKey } from '@/services/api';

export const formatUsd = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format;

/** Today's spend across every client key. The server resets it at 00:00 UTC. */
export const spendToday = (keys: ClientApiKey[]) =>
  keys.reduce((sum, key) => sum + (key.today_usd || 0), 0);
