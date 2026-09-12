import type { ResetDisplay } from '@/utils/quota';
import { create } from 'zustand';

export const RESET_DISPLAY_MODES = ['compact', 'relative', 'full'] as const;

export type ResetDisplayMode = (typeof RESET_DISPLAY_MODES)[number];

interface QuotaResetDisplayState {
  mode: ResetDisplayMode;
  cycleMode: () => void;
  setMode: (mode: ResetDisplayMode) => void;
}

/** One reset-time preference shared by every quota card on the page. */
export const useQuotaResetDisplayStore = create<QuotaResetDisplayState>((set) => ({
  mode: 'compact',
  cycleMode: () =>
    set(({ mode }) => ({
      mode: RESET_DISPLAY_MODES[(RESET_DISPLAY_MODES.indexOf(mode) + 1) % RESET_DISPLAY_MODES.length],
    })),
  setMode: (mode) => set({ mode }),
}));

/** Ordered, de-duplicated labels used by the reset-time cycling control. */
export const getResetDisplayFormats = (display: ResetDisplay): string[] =>
  [display.absolute, display.relative, display.full].filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index
  );

/** Resolve one semantic display mode, falling back when a legacy snapshot lacks a format. */
export const getResetDisplayValue = (
  display: ResetDisplay,
  mode: ResetDisplayMode
): string => {
  switch (mode) {
    case 'relative':
      return display.relative || display.absolute;
    case 'full':
      return display.full || display.relative || display.absolute;
    default:
      return display.absolute;
  }
};
