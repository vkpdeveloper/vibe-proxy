import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ProviderFlowState } from '../hooks/useOAuthFlows';
import { resolveFlowView, type FlowView as FlowViewKind } from '../flowView';
import {
  AuthUrlField,
  CallbackFeedback,
  CallbackForm,
  FlowAlert,
  FlowDialog,
  FlowFooter,
  FlowView,
  OpenLinkButton,
  OptionalTag,
  ResultView,
  Step,
  Steps,
  type DialogHeading,
} from './FlowDialogParts';

export type { DialogHeading };

export interface OAuthFlowDialogProps {
  open: boolean;
  providerId: string;
  heading: DialogHeading;
  state: ProviderFlowState;
  /** Provider copy: `auth_login.<id>_<suffix>` or the plugin template. */
  text: (suffix: string) => string;
  supportsCallback: boolean;
  onStart: () => void;
  onCancel: () => void;
  onCallbackChange: (value: string) => void;
  onCallbackSubmit: () => void;
  /** Claude only: an optional display name typed before the login starts. */
  onAccountNameChange?: (value: string) => void;
  onViewAuthFiles: () => void;
  onClose: () => void;
}

export function OAuthFlowDialog(props: OAuthFlowDialogProps) {
  const { open, heading, onClose } = props;
  return (
    <FlowDialog open={open} heading={heading} onClose={onClose}>
      <OAuthFlowContent {...props} />
    </FlowDialog>
  );
}

/** Everything below the dialog header. Exported so it can render without the dialog portal. */
export function OAuthFlowContent(props: OAuthFlowDialogProps) {
  const view = resolveFlowView(props.state);
  return (
    <>
      <FlowView key={view}>
        {view === 'success' ? <SuccessView {...props} /> : <FlowBody {...props} view={view} />}
      </FlowView>
      {view === 'flow' && <FlowStatusBar {...props} />}
    </>
  );
}

function ProviderHint({ text, state }: Pick<OAuthFlowDialogProps, 'text' | 'state'>) {
  const { t } = useTranslation();
  return (
    <p className="text-sm text-muted-foreground">
      {state.reconnect
        ? t('auth_login.anthropic_reconnect_hint', { name: state.reconnect.label })
        : text('oauth_hint')}
    </p>
  );
}

function FlowBody(props: OAuthFlowDialogProps & { view: Exclude<FlowViewKind, 'success'> }) {
  const { t } = useTranslation();
  const { view, providerId, state, text, onStart } = props;
  const isDevin = providerId === 'devin';

  if (view !== 'flow') {
    return (
      <>
        <ProviderHint text={text} state={state} />
        {props.onAccountNameChange && !state.reconnect && (
          <AccountNameField
            value={state.accountName ?? ''}
            onChange={props.onAccountNameChange}
            onSubmit={onStart}
          />
        )}
        {view === 'failed' && (
          <FlowAlert>
            {text('oauth_status_error')} {state.error || ''}
          </FlowAlert>
        )}
        <Button size="lg" className="h-9 w-fit px-4" onClick={onStart}>
          {view === 'failed' ? t('auth_login.restart_login') : text('oauth_button')}
        </Button>
      </>
    );
  }

  return (
    <>
      <ProviderHint text={text} state={state} />
      {isDevin && state.state && state.status === 'error' && (
        <FlowAlert>{t('auth_login.devin_oauth_retry_hint')}</FlowAlert>
      )}
      {state.cancelError && (
        <FlowAlert>
          {t('auth_login.devin_oauth_cancel_error')} {state.cancelError}
        </FlowAlert>
      )}
      <Steps>
        <Step
          title={
            state.secondStep
              ? t('auth_login.anthropic_second_step')
              : t('auth_login.step_open_auth_page')
          }
        >
          <AuthUrlField
            url={state.url}
            copyLabel={text('copy_link')}
            pendingLabel={t('auth_login.generating_link')}
          />
          <OpenLinkButton url={state.url} label={text('open_link')} />
        </Step>
        {state.userCode && (
          <Step title={t('auth_login.step_enter_device_code')}>
            <div className="flex items-center gap-1">
              <output
                className="font-mono text-2xl font-semibold tracking-widest"
                aria-label={t('auth_login.device_code_label')}
              >
                {state.userCode}
              </output>
              <CopyButton value={state.userCode} label={t('auth_login.device_code_copy')} />
            </div>
          </Step>
        )}
        {props.supportsCallback && <CallbackStep {...props} />}
      </Steps>
    </>
  );
}

function AccountNameField({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Field>
        <FieldLabel htmlFor={inputId}>
          {t('auth_login.account_name_label')}
          <OptionalTag />
        </FieldLabel>
        <Input
          id={inputId}
          className="h-9"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t('auth_login.account_name_placeholder')}
          maxLength={64}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
    </form>
  );
}

function CallbackStep({
  providerId,
  state,
  onCallbackChange,
  onCallbackSubmit,
}: OAuthFlowDialogProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const hintId = useId();
  const feedbackId = useId();
  const isXai = providerId === 'xai';
  const isDevin = providerId === 'devin';
  const disabled = !state.url || (isDevin && (state.cancelling || state.status !== 'waiting'));
  const hintKey = isXai
    ? 'auth_login.xai_callback_hint'
    : isDevin
      ? 'auth_login.devin_callback_hint'
      : 'auth_login.oauth_callback_hint';
  const placeholderKey = isXai
    ? 'auth_login.xai_callback_placeholder'
    : isDevin
      ? 'auth_login.devin_callback_placeholder'
      : 'auth_login.oauth_callback_placeholder';

  const feedback = state.callbackValidation
    ? { tone: 'error' as const, message: state.callbackValidation }
    : state.callbackStatus === 'error'
      ? {
          tone: 'error' as const,
          message: `${t('auth_login.oauth_callback_status_error')} ${state.callbackError || ''}`,
        }
      : state.callbackStatus === 'success' && state.status === 'waiting'
        ? { tone: 'success' as const, message: t('auth_login.oauth_callback_status_success') }
        : null;

  return (
    <Step
      title={t(isXai ? 'auth_login.xai_callback_label' : 'auth_login.oauth_callback_label')}
      titleFor={inputId}
      aside={<OptionalTag />}
    >
      <p className="text-sm text-muted-foreground" id={hintId}>
        {t(hintKey)}
      </p>
      <CallbackForm onSubmit={onCallbackSubmit}>
        <Input
          id={inputId}
          className="h-9 flex-1 font-mono text-xs md:text-xs"
          value={state.callbackUrl || ''}
          onChange={(event) => onCallbackChange(event.target.value)}
          placeholder={t(placeholderKey)}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={feedback?.tone === 'error'}
          aria-describedby={feedback ? `${feedbackId} ${hintId}` : hintId}
        />
        <Button
          type="submit"
          variant="outline"
          size="lg"
          className="h-9 px-4"
          disabled={disabled || state.callbackSubmitting}
        >
          {t('auth_login.oauth_callback_button')}
        </Button>
      </CallbackForm>
      {feedback && (
        <CallbackFeedback id={feedbackId} tone={feedback.tone}>
          {feedback.message}
        </CallbackFeedback>
      )}
    </Step>
  );
}

function FlowStatusBar({ providerId, state, text, onStart, onCancel }: OAuthFlowDialogProps) {
  const { t } = useTranslation();
  const isDevin = providerId === 'devin';
  const failed = state.status === 'error';
  const generating = !failed && !state.url;
  // A Devin session may still be open on the server: it has to be cancelled before a restart.
  const canCancel = isDevin && Boolean(state.state);

  return (
    <FlowFooter
      tone={generating ? 'pending' : failed ? 'error' : 'waiting'}
      label={
        generating
          ? t('auth_login.generating_link')
          : failed
            ? `${text('oauth_status_error')} ${state.error || ''}`
            : text('oauth_status_waiting')
      }
    >
      {canCancel ? (
        <Button variant="outline" onClick={onCancel} disabled={state.cancelling}>
          {t('auth_login.devin_oauth_cancel')}
        </Button>
      ) : failed ? (
        <Button variant="outline" onClick={onStart}>
          {t('auth_login.restart_login')}
        </Button>
      ) : (
        <span className="text-xs text-faint">{t('auth_login.waiting_background_hint')}</span>
      )}
    </FlowFooter>
  );
}

function SuccessView({ text, onStart, onViewAuthFiles }: OAuthFlowDialogProps) {
  const { t } = useTranslation();
  return (
    <ResultView
      title={text('oauth_status_success')}
      actions={
        <>
          <Button variant="outline" size="lg" className="h-9 px-4" onClick={onViewAuthFiles}>
            {t('auth_login.view_auth_files')}
          </Button>
          <Button size="lg" className="h-9 px-4" onClick={onStart}>
            {t('auth_login.login_another_account')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">{t('auth_login.success_saved_hint')}</p>
    </ResultView>
  );
}
