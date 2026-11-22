import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import iconCodex from '@/assets/icons/codex.svg';
import { authFilesApi } from '@/services/api/authFiles';
import { captureSiwcBindingApi, oauthApi, type SiwcBindResponse } from '@/services/api/oauth';
import { useAuthStore } from '@/stores/useAuthStore';
import type { AuthFileItem } from '@/types';
import { formatDateTimeValue } from '@/utils/format';
import { cn } from '@/lib/utils';
import { notifyAuthFilesChanged } from '@/features/authFiles/authFilesEvents';
import { deriveAuthFileIdentity, stripJsonExtension } from '@/features/authFiles/identity';
import { createOAuthAttempts, type OAuthAttempt } from '../oauthAttempts';
import {
  createSiwcStart,
  getSiwcBindingStatus,
  isSiwcCallbackValid,
  listSiwcTargets,
} from '../siwcBinding';
import {
  AuthUrlField,
  CallbackFeedback,
  CallbackForm,
  FlowAlert,
  FlowDialog,
  FlowFooter,
  FlowView,
  OpenLinkButton,
  ResultView,
  Step,
  Steps,
} from './FlowDialogParts';
import { SiwcStatusBadge } from './SiwcStatusBadge';

type Phase = 'idle' | 'starting' | 'wait' | 'ok' | 'error' | 'unsupported' | 'expired';
type Feedback = 'submitted' | 'invalid_callback' | 'callback_failed';

const CALLBACK_PLACEHOLDER = 'http://127.0.0.1:1455/auth/callback?code=…&state=…';

export interface SiwcBindDialogProps {
  open: boolean;
  onClose: () => void;
  onViewAuthFiles: () => void;
}

/**
 * SIWC binding, in the same dialog frame as the OAuth sign-in (brand header, steps, status
 * footer, result). Pick a Codex credential first, then authorize; the credential is locked once
 * authorization starts and a failure can start over in place. The parent remounts it with a new
 * key per open; closing cancels a server session that is still running.
 */
export function SiwcBindDialog({ open, onClose, onViewAuthFiles }: SiwcBindDialogProps) {
  const { t, i18n } = useTranslation();
  const [targets, setTargets] = useState<AuthFileItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [name, setName] = useState('');
  const [run, setRun] = useState(0);
  const [session, setSession] = useState<SiwcBindResponse>();
  const [phase, setPhase] = useState<Phase>('idle');
  const [callback, setCallback] = useState('');
  const [feedback, setFeedback] = useState<Feedback | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const attemptRef = useRef<OAuthAttempt | null>(null);
  const startRef = useRef<ReturnType<typeof createSiwcStart<SiwcBindResponse>> | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // 连接守卫 + 凭证列表：切换连接或登出时立即作废并关闭，旧响应不得写入。
  useEffect(() => {
    let active = true;
    const connection = useAuthStore.getState();
    const sameConnection = () => {
      const current = useAuthStore.getState();
      return (
        current.isAuthenticated === connection.isAuthenticated &&
        current.apiBase === connection.apiBase &&
        current.managementKey === connection.managementKey
      );
    };
    const unsubscribe = useAuthStore.subscribe(() => {
      if (!sameConnection()) {
        active = false;
        attemptRef.current?.invalidate();
        startRef.current?.close();
        closeRef.current();
      }
    });
    authFilesApi
      .list()
      .then((response) => {
        if (!active || !sameConnection()) return;
        const list = listSiwcTargets(response.files);
        setTargets(list);
        if (list.length === 1) setName(list[0].name);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!name) return;
    const attempts = createOAuthAttempts({
      setTimeout: (fn, delay) => window.setTimeout(fn, delay),
      clearTimeout: (timer) => window.clearTimeout(timer),
    });
    const attempt = attempts.begin(name);
    attemptRef.current = attempt;
    const api = captureSiwcBindingApi();
    const startup = createSiwcStart({
      start: () => {
        setPhase('starting');
        return api.start(name);
      },
      cancel: api.cancel,
      onResult: (result) => {
        if (!attempt.isCurrent()) return;
        const state = result.state;
        const url = new URL(result.url);
        if (
          result.status !== 'ok' ||
          result.flow !== 'siwc_bind' ||
          !state ||
          !['https:', 'http:'].includes(url.protocol) ||
          !(result.expires_in > 0)
        ) {
          throw new Error('Invalid binding session');
        }
        setSession(result);
        setPhase('wait');
        const expiresAt = Date.now() + result.expires_in * 1000;
        attempt.poll<{ status: 'wait' | 'ok' | 'error' | 'expired' }>(
          () =>
            Date.now() >= expiresAt
              ? Promise.resolve({ status: 'expired' as const })
              : oauthApi.getAuthStatus(state, attempt.signal),
          (result) => {
            setPhase(result.status);
            if (result.status === 'ok') {
              startup.complete();
              notifyAuthFilesChanged();
            }
            return result.status === 'wait';
          },
          () => setPhase('error'),
          2000
        );
      },
      onError: (error: unknown) => {
        if (!attempt.isCurrent()) return;
        setPhase(
          typeof error === 'object' && error !== null && 'status' in error && error.status === 404
            ? 'unsupported'
            : 'error'
        );
      },
    });
    startRef.current = startup;
    return () => {
      attempt.invalidate();
      startup.close();
      if (attemptRef.current === attempt) attemptRef.current = null;
      if (startRef.current === startup) startRef.current = null;
    };
  }, [name, run]);

  const close = () => {
    attemptRef.current?.invalidate();
    startRef.current?.close();
    onClose();
  };

  /** 失败后原地重来：丢弃旧尝试（effect 清理会取消服务端会话），回到选择视图。 */
  const restart = () => {
    setSession(undefined);
    setCallback('');
    setFeedback('');
    setSubmitting(false);
    setPhase('idle');
    setRun((value) => value + 1);
  };

  const submit = async () => {
    const attempt = attemptRef.current;
    if (!session || !attempt?.isCurrent() || phase !== 'wait' || submitting) return;
    if (!isSiwcCallbackValid(callback, session.state)) {
      setFeedback('invalid_callback');
      return;
    }
    setSubmitting(true);
    setFeedback('');
    try {
      await oauthApi.submitCallback('codex', callback, attempt.signal);
      if (attempt.isCurrent()) setFeedback('submitted');
    } catch {
      if (attempt.isCurrent()) setFeedback('callback_failed');
    } finally {
      if (attempt.isCurrent()) setSubmitting(false);
    }
  };

  const selected = targets?.find((file) => file.name === name);
  const expiresOf = (file: AuthFileItem) =>
    file.siwcExpiresAt ? formatDateTimeValue(file.siwcExpiresAt, i18n.language) : '';
  const view =
    phase === 'idle'
      ? 'pick'
      : phase === 'ok'
        ? 'success'
        : phase === 'starting' || phase === 'wait'
          ? 'flow'
          : 'failed';

  return (
    <FlowDialog
      open={open}
      onClose={close}
      heading={{
        title: t('siwc.title'),
        caption: `Codex · ${t('auth_login.method_browser')}`,
        icon: iconCodex,
        flush: true,
      }}
      footer={
        view === 'flow' ? (
          <FlowFooter
            tone={phase === 'starting' ? 'pending' : 'waiting'}
            label={t(phase === 'starting' ? 'siwc.starting' : 'siwc.wait')}
          >
            <Button variant="outline" onClick={close}>
              {t('siwc.cancel')}
            </Button>
          </FlowFooter>
        ) : undefined
      }
    >
      <FlowView key={view}>
        {view === 'pick' && (
          <>
            <p className="text-sm text-muted-foreground">{t('siwc.intro')}</p>
            <TargetPicker
              targets={targets}
              loadFailed={loadFailed}
              value={name}
              onChange={setName}
              expiresOf={expiresOf}
            />
            <Button
              size="lg"
              className="h-9 w-fit px-4"
              disabled={!name}
              onClick={() => void startRef.current?.start()}
            >
              {t('siwc.start')}
            </Button>
          </>
        )}

        {view === 'flow' && (
          <>
            {selected && <TargetSummary file={selected} />}
            <Steps>
              <Step title={t('siwc.step_open')}>
                <AuthUrlField
                  url={session?.url}
                  copyLabel={t('siwc.copy')}
                  pendingLabel={t('siwc.starting')}
                />
                <OpenLinkButton url={session?.url} label={t('siwc.open')} />
              </Step>
              <CallbackStep
                disabled={!session || phase !== 'wait'}
                value={callback}
                submitting={submitting}
                feedback={feedback}
                onChange={(value) => {
                  setCallback(value);
                  if (feedback && feedback !== 'submitted') setFeedback('');
                }}
                onSubmit={() => void submit()}
              />
            </Steps>
          </>
        )}

        {view === 'failed' && (
          <>
            {selected && <TargetSummary file={selected} />}
            <FlowAlert>{t(`siwc.${phase}`)}</FlowAlert>
            {phase !== 'unsupported' && (
              <Button size="lg" className="h-9 w-fit px-4" onClick={restart}>
                {t('siwc.retry')}
              </Button>
            )}
          </>
        )}

        {view === 'success' && (
          <ResultView
            title={t('siwc.ok')}
            actions={
              <>
                <Button variant="outline" size="lg" className="h-9 px-4" onClick={onViewAuthFiles}>
                  {t('auth_login.view_auth_files')}
                </Button>
                <Button size="lg" className="h-9 px-4" onClick={close}>
                  {t('siwc.done')}
                </Button>
              </>
            }
          >
            {selected && (
              <p className="text-sm text-muted-foreground">
                {t('siwc.ok_hint', { name: deriveAuthFileIdentity(selected).primary })}
              </p>
            )}
          </ResultView>
        )}
      </FlowView>
    </FlowDialog>
  );
}

/* ---------- Credential picker: native radios (keyboard and screen readers for free), shown as tiles ---------- */

function TargetPicker({
  targets,
  loadFailed,
  value,
  onChange,
  expiresOf,
}: {
  targets: AuthFileItem[] | null;
  loadFailed: boolean;
  value: string;
  onChange: (name: string) => void;
  expiresOf: (file: AuthFileItem) => string;
}) {
  const { t } = useTranslation();
  const groupName = useId();

  let content: ReactNode;
  if (loadFailed) {
    content = <FlowAlert>{t('siwc.load_failed')}</FlowAlert>;
  } else if (!targets) {
    content = (
      <div className="grid gap-2" aria-busy="true" aria-label={t('siwc.loading')}>
        <span className="h-15 rounded-xl bg-muted/50" />
        <span className="h-15 rounded-xl bg-muted/50" />
      </div>
    );
  } else if (targets.length === 0) {
    content = (
      <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
        {t('siwc.no_targets')}
      </p>
    );
  } else {
    content = (
      <div className="grid gap-2">
        {targets.map((file) => {
          const identity = deriveAuthFileIdentity(file);
          const expires = expiresOf(file);
          const meta = [expires && t('siwc.expires', { date: expires }), identity.secondary]
            .filter(Boolean)
            .join(' · ');
          return (
            <label
              key={file.name}
              className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors duration-150 ease-out hover:bg-muted/50 has-checked:border-primary/20 has-checked:bg-primary/10 has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input
                type="radio"
                className="grid size-4 shrink-0 appearance-none place-items-center rounded-full border border-input outline-none before:size-2 before:rounded-full before:bg-primary-foreground before:opacity-0 checked:border-primary checked:bg-primary checked:before:opacity-100 dark:bg-input/30 dark:checked:bg-primary"
                name={groupName}
                value={file.name}
                checked={value === file.name}
                onChange={() => onChange(file.name)}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={cn(
                    'truncate text-sm font-medium',
                    identity.kind === 'fileName' && 'font-mono text-xs leading-5'
                  )}
                  title={identity.fullName}
                >
                  {identity.primary || stripJsonExtension(file.name)}
                </span>
                {meta && <span className="truncate text-sm text-muted-foreground">{meta}</span>}
              </span>
              <SiwcStatusBadge status={getSiwcBindingStatus(file)} withLabel={false} />
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <FieldSet className="min-w-0 gap-3">
      <FieldLegend variant="label" className="mb-0">
        {t('siwc.target')}
      </FieldLegend>
      {content}
    </FieldSet>
  );
}

/** The locked target once authorization started: a one-line summary. */
function TargetSummary({ file }: { file: AuthFileItem }) {
  const { t } = useTranslation();
  const identity = deriveAuthFileIdentity(file);
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5">
      <span className="shrink-0 text-sm text-muted-foreground">{t('siwc.target')}</span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm font-medium',
          identity.kind === 'fileName' && 'font-mono text-xs'
        )}
        title={identity.fullName}
      >
        {identity.primary || stripJsonExtension(file.name)}
      </span>
      <SiwcStatusBadge status={getSiwcBindingStatus(file)} withLabel={false} />
    </div>
  );
}

function CallbackStep({
  disabled,
  value,
  submitting,
  feedback,
  onChange,
  onSubmit,
}: {
  disabled: boolean;
  value: string;
  submitting: boolean;
  feedback: Feedback | '';
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const hintId = useId();
  const feedbackId = useId();
  const isError = feedback === 'invalid_callback' || feedback === 'callback_failed';

  return (
    <Step title={t('siwc.callback')} titleFor={inputId}>
      <p className="text-sm text-muted-foreground" id={hintId}>
        {t('siwc.hint')}
      </p>
      <CallbackForm onSubmit={onSubmit}>
        <Input
          id={inputId}
          className="h-9 flex-1 font-mono text-xs md:text-xs"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={CALLBACK_PLACEHOLDER}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={isError}
          aria-describedby={feedback ? `${feedbackId} ${hintId}` : hintId}
        />
        <Button
          type="submit"
          variant="outline"
          size="lg"
          className="h-9 px-4"
          disabled={disabled || submitting || !value.trim()}
        >
          {t('siwc.submit')}
        </Button>
      </CallbackForm>
      {feedback && (
        <CallbackFeedback id={feedbackId} tone={isError ? 'error' : 'success'}>
          {t(`siwc.${feedback}`)}
        </CallbackFeedback>
      )}
    </Step>
  );
}
