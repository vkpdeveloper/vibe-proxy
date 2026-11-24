import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { BlockerFunction } from 'react-router';
import { useBlocker, useLocation, useNavigate } from 'react-router';
import { useNotificationStore } from '@/stores';

type ConfirmationVariant = 'danger' | 'primary' | 'secondary';

export type UnsavedChangesDialog = {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant?: ConfirmationVariant;
};

export type UseUnsavedChangesGuardOptions = {
  enabled?: boolean;
  shouldBlock: boolean;
  dialog: UnsavedChangesDialog;
};

// The router can only block Back/Forward to history entries it created. An entry from a
// hand-edited URL has no index, so the router lets that navigation through and the edits are
// lost. Window listeners run in the order they were added, and this module loads before App
// creates the router, so this one sees such a navigation first and can stop it.
let interceptPop: ((event: PopStateEvent) => void) | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (event) => interceptPop?.(event));
}

export function useUnsavedChangesGuard(options: UseUnsavedChangesGuardOptions) {
  const { enabled = true, shouldBlock, dialog } = options;
  const { showConfirmation } = useNotificationStore();
  const lastBlockedRef = useRef<string>('');
  const allowNextNavigationUntilRef = useRef(0);
  const allowNextNavigationKeyRef = useRef('');
  const location = useLocation();
  const navigate = useNavigate();
  const blocking = enabled && shouldBlock;

  const allowNextNavigation = useCallback(() => {
    // Allow one programmatic navigation after successful save.
    // A short window is used to avoid stale flags lingering when no navigation happens.
    allowNextNavigationUntilRef.current = Date.now() + 2_000;
    allowNextNavigationKeyRef.current = '';
  }, []);

  const allowNavigationTo = useCallback((nextLocationKey: string) => {
    allowNextNavigationUntilRef.current = Date.now() + 2_000;
    allowNextNavigationKeyRef.current = nextLocationKey;
  }, []);

  const shouldBlockFunction = useCallback<BlockerFunction>(
    (args) => {
      if (!enabled) return false;
      const now = Date.now();

      if (allowNextNavigationUntilRef.current > now) {
        const nextKey = `${args.nextLocation.pathname}${args.nextLocation.search}${args.nextLocation.hash}`;
        if (!allowNextNavigationKeyRef.current) {
          allowNextNavigationKeyRef.current = nextKey;
        }
        if (allowNextNavigationKeyRef.current === nextKey) {
          return false;
        }
      } else if (allowNextNavigationUntilRef.current !== 0) {
        allowNextNavigationUntilRef.current = 0;
        allowNextNavigationKeyRef.current = '';
      }

      return shouldBlock;
    },
    [enabled, shouldBlock]
  );

  const blocker = useBlocker(shouldBlockFunction);

  useEffect(() => {
    if (allowNextNavigationUntilRef.current === 0) return;
    allowNextNavigationUntilRef.current = 0;
    allowNextNavigationKeyRef.current = '';
  }, [location.key]);

  const blockedKey = useMemo(() => {
    if (blocker.state !== 'blocked' || !blocker.location) return '';
    return `${blocker.location.pathname}${blocker.location.search}${blocker.location.hash}`;
  }, [blocker.location, blocker.state]);

  const confirmLeave = useCallback(
    (onConfirm: () => void, onCancel?: () => void) =>
      showConfirmation({
        title: dialog.title,
        message: dialog.message,
        confirmText: dialog.confirmText,
        cancelText: dialog.cancelText,
        variant: dialog.variant ?? 'danger',
        onConfirm,
        onCancel,
      }),
    [dialog, showConfirmation]
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') {
      lastBlockedRef.current = '';
      return;
    }

    if (!blockedKey || lastBlockedRef.current === blockedKey) {
      return;
    }
    lastBlockedRef.current = blockedKey;

    confirmLeave(
      () => blocker.proceed(),
      () => blocker.reset()
    );
  }, [blockedKey, blocker, confirmLeave]);

  // Back/Forward to an entry the router did not create: put this page's URL back and ask first.
  useEffect(() => {
    if (!blocking) return;
    const here = { state: window.history.state as unknown, href: window.location.href };
    const intercept = (event: PopStateEvent) => {
      const state: unknown = event.state;
      const routerEntry =
        typeof state === 'object' && state !== null && 'idx' in state && state.idx != null;
      if (routerEntry) return;
      event.stopImmediatePropagation();
      const target = window.location.hash.slice(1) || '/';
      window.history.pushState(here.state, '', here.href);
      confirmLeave(() => {
        allowNextNavigation();
        void navigate(target);
      });
    };
    interceptPop = intercept;
    return () => {
      if (interceptPop === intercept) interceptPop = null;
    };
  }, [allowNextNavigation, blocking, confirmLeave, location.key, navigate]);

  // Reloading or closing the tab skips the router entirely.
  useEffect(() => {
    if (!blocking) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [blocking]);

  return { allowNextNavigation, allowNavigationTo };
}
