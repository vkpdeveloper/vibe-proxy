import type { ErrorLogFile } from '@/services/api/logs';

export type ErrorLogViewerState =
  | { status: 'closed' }
  | { status: 'loading'; item: ErrorLogFile }
  | { status: 'ready'; item: ErrorLogFile; text: string }
  | { status: 'error'; item: ErrorLogFile; message: string }
  /** The server saved nothing for this request; an expected outcome, not a failure. */
  | { status: 'missing'; item: ErrorLogFile };

export type ErrorLogViewerAction =
  | { type: 'open'; item: ErrorLogFile }
  | { type: 'ready'; text: string }
  | { type: 'error'; message: string }
  | { type: 'missing' }
  | { type: 'close' };

/** Request ownership is checked by the caller before dispatching asynchronous results. */
export function errorLogViewerReducer(
  state: ErrorLogViewerState,
  action: ErrorLogViewerAction
): ErrorLogViewerState {
  switch (action.type) {
    case 'open':
      return { status: 'loading', item: action.item };
    case 'ready':
      return state.status === 'loading'
        ? { status: 'ready', item: state.item, text: action.text }
        : state;
    case 'error':
      return state.status === 'loading'
        ? { status: 'error', item: state.item, message: action.message }
        : state;
    case 'missing':
      return state.status === 'loading' ? { status: 'missing', item: state.item } : state;
    case 'close':
      return { status: 'closed' };
  }
}
