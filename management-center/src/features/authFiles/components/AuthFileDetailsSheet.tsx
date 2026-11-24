import { useCallback, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Private } from '@/components/ui/private';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useNotificationStore } from '@/stores';
import type {
  PrefixProxyEditorField,
  PrefixProxyEditorFieldValue,
  PrefixProxyEditorState,
} from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import {
  describeAuthFileStatusMessage,
  getAuthFileStatusMessage,
  getTypeLabel,
  hasAuthFileStatusWarning,
  isProblemAuthFile,
  isSignInProblem,
  normalizeProviderKey,
  supportsAuthFileManualRefresh,
  supportsAuthFileSiwc,
  supportsAuthFileUsingApi,
  supportsAuthFileWebsockets,
} from '@/features/authFiles/constants';
import { MAX_CREDENTIAL_WEIGHT } from '@/utils/credentialWeight';
import { AuthFileExcludedModelsField } from './AuthFileExcludedModelsField';
import { AuthFilePolicyFields } from './AuthFilePolicyFields';
import { credentialPolicyError, readCredentialPolicy } from '../credentialPolicy';
import { deriveAuthFileIdentity } from '../identity';
import { getAuthFileRefreshKey } from '../manualRefresh';
import { resolveProblemResetAt } from '../quotaDrain';
import { useNow } from '@/hooks/useNow';
import { usePhone } from '@/components/layout/pageBar';
import { formatDurationNarrow } from '@/utils/quota/relativeTime';
import type { AuthFileItem } from '@/types';

// Phones head each group like Config does: a small muted title, without a rule above it.
const GROUP_SET_CLASS = 'max-sm:mt-1';
const GROUP_LEGEND_CLASS =
  'max-sm:mb-3 max-sm:font-semibold max-sm:text-muted-foreground max-sm:data-[variant=legend]:text-[13px]';

export type AuthFileDetailsSheetProps = {
  disableControls: boolean;
  editor: PrefixProxyEditorState | null;
  /** The listed credential being edited, for its name and health. */
  file: AuthFileItem | null;
  dirty: boolean;
  onClose: () => void;
  onSave: () => void;
  onChange: (field: PrefixProxyEditorField, value: PrefixProxyEditorFieldValue) => void;
  /** The card menu's "Refresh sign-in", offered here when the problem is a sign-in one. */
  onManualRefresh: (file: AuthFileItem) => void;
  manualRefreshing: Record<string, boolean>;
};

type ToggleField = 'disableCooling' | 'websockets' | 'useSiwc' | 'usingApi';

/**
 * Credential details and settings. Closing with unsaved changes (Escape, overlay, close button,
 * cancel) asks first. Desktop text fields (sm:h-9) match the 36px models picker and the policy
 * selects.
 */
export function AuthFileDetailsSheet(props: AuthFileDetailsSheetProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const {
    disableControls,
    editor,
    file,
    dirty,
    onClose,
    onSave,
    onChange,
    onManualRefresh,
    manualRefreshing,
  } = props;
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const phone = usePhone();
  const saving = editor?.saving === true;

  const confirmClose = useCallback((): Promise<boolean> => {
    if (!dirty || saving) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      showConfirmation({
        title: t('providersPage.unsavedChanges.title'),
        message: t('providersPage.unsavedChanges.message'),
        variant: 'danger',
        confirmText: t('providersPage.unsavedChanges.discard'),
        cancelText: t('providersPage.unsavedChanges.keepEditing'),
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }, [dirty, saving, showConfirmation, t]);

  const requestClose = useCallback(() => {
    if (saving) return;
    void confirmClose().then((ok) => {
      if (ok) onClose();
    });
  }, [confirmClose, onClose, saving]);

  // In-sheet links leave the page, so unsaved changes get the same question as closing.
  const handleLeaveLinkClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (saving) return;
      const to = event.currentTarget.getAttribute('href')?.replace(/^#/, '');
      if (!to) return;
      void confirmClose().then((ok) => {
        if (ok) void navigate(to);
      });
    },
    [confirmClose, navigate, saving]
  );

  const fieldDisabled = disableControls || saving || !editor?.json;

  const identity = file ? deriveAuthFileIdentity(file) : null;
  const typeLabel = file
    ? getTypeLabel(t, normalizeProviderKey(String(file.type ?? file.provider ?? '')))
    : '';
  // Opening a card should answer "what's wrong" before showing settings.
  const problem = file && isProblemAuthFile(file) ? file : null;
  const problemMessage =
    problem && hasAuthFileStatusWarning(problem)
      ? describeAuthFileStatusMessage(getAuthFileStatusMessage(problem))
      : null;
  const problemFailures = problem?.failureCount ?? 0;
  const now = useNow(Boolean(problem));
  const problemResetAt = problem ? resolveProblemResetAt(problem, now) : null;
  // A sign-in problem gets the fix inline: refresh the token where the provider supports it,
  // otherwise sign in again on the OAuth page.
  const signInProblem = problem && isSignInProblem(problem) ? problem : null;
  const canRefreshSignIn =
    signInProblem !== null &&
    supportsAuthFileManualRefresh(signInProblem.type ?? signInProblem.provider);
  const refreshingSignIn = signInProblem
    ? manualRefreshing[getAuthFileRefreshKey(signInProblem)] === true
    : false;

  const toggle = (field: ToggleField, label: string, hint: string): ReactNode =>
    editor && (
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor={`auth-file-${field}`}>{label}</FieldLabel>
          <FieldDescription>{hint}</FieldDescription>
        </FieldContent>
        <Switch
          id={`auth-file-${field}`}
          checked={editor[field]}
          onCheckedChange={(value) => onChange(field, value)}
          disabled={fieldDisabled}
        />
      </Field>
    );

  return (
    <Sheet open={Boolean(editor)} onOpenChange={(open) => !open && requestClose()}>
      <SheetContent
        side="right"
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        // Desktop starts in the note field (autoFocus, once the file has loaded) rather than on
        // the title's reveal button. Phones keep the default so the keyboard stays down.
        onOpenAutoFocus={(event) => {
          if (phone) return;
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
        }}
      >
        <SheetHeader className="pr-12 sm:border-b">
          {/* Named like the card. overflow-x-clip, not truncate: hiding overflow would cut
              Private's 40px tap target. */}
          <SheetTitle className="overflow-x-clip text-ellipsis whitespace-nowrap">
            {identity?.kind === 'email' ? (
              <Private>{identity.primary}</Private>
            ) : (
              identity?.primary || typeLabel || t('auth_files.prefix_proxy_button')
            )}
          </SheetTitle>
          <SheetDescription>
            {typeLabel
              ? t('auth_files.details_caption', { provider: typeLabel })
              : t('auth_files.prefix_proxy_button')}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {editor &&
            (editor.loading ? (
              <p className="text-muted-foreground">{t('auth_files.prefix_proxy_loading')}</p>
            ) : (
              <FieldGroup className="gap-5">
                {editor.error && (
                  <p role="alert" className="text-destructive">
                    {editor.error}
                  </p>
                )}
                {!editor.json ? (
                  <p role="alert" className="text-destructive">
                    {t('auth_files.prefix_proxy_invalid_content_label')}
                  </p>
                ) : (
                  <>
                    {problem && (
                      <div
                        role="status"
                        className="flex flex-col gap-1 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm"
                      >
                        <p className="flex items-center gap-2 font-medium text-warning">
                          <HugeiconsIcon
                            icon={Alert02Icon}
                            strokeWidth={1.75}
                            className="size-4 shrink-0"
                          />
                          {t('auth_files.problem_filter_problem')}
                        </p>
                        {problemMessage && (
                          <p className="break-words">
                            {problemMessage.kind && (
                              <span className="font-medium">{problemMessage.kind}: </span>
                            )}
                            {problemMessage.message}
                          </p>
                        )}
                        {problemResetAt !== null && (
                          <p>
                            {t('auth_files.quota_drain_resets', {
                              span: formatDurationNarrow(problemResetAt, now, i18n.language),
                            })}
                          </p>
                        )}
                        {problemFailures > 0 && (
                          <p className="text-muted-foreground">
                            {t('auth_files.count_failure', { count: problemFailures })} ·{' '}
                            {t('auth_files.count_since_restart')}
                          </p>
                        )}
                        {signInProblem &&
                          (canRefreshSignIn ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2 self-start max-sm:h-10 sm:h-8"
                              disabled={disableControls || refreshingSignIn}
                              onClick={() => onManualRefresh(signInProblem)}
                            >
                              <HugeiconsIcon
                                icon={RefreshIcon}
                                strokeWidth={1.75}
                                data-icon="inline-start"
                              />
                              {t('auth_files.manual_refresh_button')}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2 self-start max-sm:h-10 sm:h-8"
                              asChild
                            >
                              <Link to="/oauth" onClick={handleLeaveLinkClick}>
                                {t('auth_files.sign_in_again')}
                              </Link>
                            </Button>
                          ))}
                      </div>
                    )}
                    <Field>
                      <FieldLabel htmlFor="auth-file-note">{t('auth_files.note_label')}</FieldLabel>
                      <Input
                        id="auth-file-note"
                        className="sm:h-9"
                        autoFocus={!phone}
                        value={editor.note}
                        placeholder={t('auth_files.note_placeholder')}
                        disabled={fieldDisabled}
                        onChange={(e) => onChange('note', e.target.value)}
                      />
                      <FieldDescription>{t('auth_files.note_hint')}</FieldDescription>
                    </Field>

                    <FieldSeparator className="max-sm:hidden" />
                    <FieldSet className={GROUP_SET_CLASS}>
                      <FieldLegend className={GROUP_LEGEND_CLASS}>
                        {t('auth_files.details_group_routing')}
                      </FieldLegend>
                      <FieldGroup className="gap-5">
                        <div className="grid gap-5 sm:grid-cols-2">
                          <Field>
                            <FieldLabel htmlFor="auth-file-priority">
                              {t('auth_files.priority_label')}
                            </FieldLabel>
                            <Input
                              id="auth-file-priority"
                              className="sm:h-9"
                              value={editor.priority}
                              placeholder={t('auth_files.priority_placeholder')}
                              disabled={fieldDisabled}
                              onChange={(e) => onChange('priority', e.target.value)}
                            />
                            <FieldDescription>{t('auth_files.priority_hint')}</FieldDescription>
                          </Field>
                          <Field data-invalid={Boolean(editor.weightError) || undefined}>
                            <FieldLabel htmlFor="auth-file-weight">
                              {t('auth_files.weight_label')}
                            </FieldLabel>
                            <Input
                              id="auth-file-weight"
                              className="sm:h-9"
                              type="number"
                              step="1"
                              max={MAX_CREDENTIAL_WEIGHT}
                              value={editor.weight}
                              placeholder="1"
                              aria-invalid={Boolean(editor.weightError)}
                              disabled={fieldDisabled}
                              onChange={(e) => onChange('weight', e.target.value)}
                            />
                            {editor.weightError ? (
                              <FieldError>{editor.weightError}</FieldError>
                            ) : (
                              <FieldDescription>
                                <Trans
                                  i18nKey="auth_files.weight_hint"
                                  components={{
                                    settingsLink: (
                                      // The pseudo-element pads the inline link to a 40px tap target.
                                      <Link
                                        to="/config?field=routingStrategy"
                                        onClick={handleLeaveLinkClick}
                                        className="relative after:absolute after:-inset-x-1 after:-inset-y-[11px]"
                                      />
                                    ),
                                  }}
                                />
                              </FieldDescription>
                            )}
                          </Field>
                        </div>
                        {toggle(
                          'disableCooling',
                          t('auth_files.disable_cooling_label'),
                          t('auth_files.disable_cooling_hint')
                        )}
                        <AuthFilePolicyFields
                          draft={editor.policy ?? readCredentialPolicy(editor.json)}
                          fields={['requestRetry']}
                          disabled={disableControls || saving}
                          onChange={onChange}
                        />
                      </FieldGroup>
                    </FieldSet>

                    <FieldSeparator className="max-sm:hidden" />
                    <FieldSet className={GROUP_SET_CLASS}>
                      <FieldLegend className={GROUP_LEGEND_CLASS}>
                        {t('auth_files.details_group_models')}
                      </FieldLegend>
                      <FieldGroup className="gap-5">
                        <AuthFileExcludedModelsField
                          fileName={editor.fileName}
                          value={editor.excludedModelsText}
                          disabled={fieldDisabled}
                          onChange={(value) => onChange('excludedModelsText', value)}
                        />
                        <AuthFilePolicyFields
                          draft={editor.policy ?? readCredentialPolicy(editor.json)}
                          fields={['modelAliases']}
                          disabled={disableControls || saving}
                          onChange={onChange}
                        />
                      </FieldGroup>
                    </FieldSet>

                    <FieldSeparator className="max-sm:hidden" />
                    <FieldSet className={GROUP_SET_CLASS}>
                      <FieldLegend className={GROUP_LEGEND_CLASS}>
                        {t('auth_files.details_group_advanced')}
                      </FieldLegend>
                      <FieldGroup className="gap-5">
                        <Field>
                          <FieldLabel htmlFor="auth-file-prefix">
                            {t('auth_files.prefix_label')}
                          </FieldLabel>
                          <Input
                            id="auth-file-prefix"
                            className="sm:h-9"
                            value={editor.prefix}
                            disabled={fieldDisabled}
                            onChange={(e) => onChange('prefix', e.target.value)}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="auth-file-proxy">
                            {t('auth_files.proxy_url_label')}
                          </FieldLabel>
                          <Input
                            id="auth-file-proxy"
                            className="sm:h-9"
                            value={editor.proxyUrl}
                            placeholder={t('auth_files.proxy_url_placeholder')}
                            disabled={fieldDisabled}
                            onChange={(e) => onChange('proxyUrl', e.target.value)}
                          />
                        </Field>
                        {supportsAuthFileWebsockets(editor.providerKey) &&
                          toggle(
                            'websockets',
                            t('auth_files.websockets_label'),
                            t('auth_files.websockets_hint')
                          )}
                        {supportsAuthFileSiwc(editor.providerKey) &&
                          toggle(
                            'useSiwc',
                            t('auth_files.use_siwc_label'),
                            t('auth_files.use_siwc_hint')
                          )}
                        {supportsAuthFileUsingApi(editor.providerKey) &&
                          toggle(
                            'usingApi',
                            t('auth_files.using_api_label'),
                            t('auth_files.using_api_hint')
                          )}
                        <Field data-invalid={Boolean(editor.headersError) || undefined}>
                          <FieldLabel htmlFor="auth-file-headers">
                            {t('auth_files.headers_label')}
                          </FieldLabel>
                          <Textarea
                            id="auth-file-headers"
                            className="min-h-24 font-mono text-xs max-sm:text-base"
                            value={editor.headersText}
                            placeholder={t('auth_files.headers_placeholder')}
                            rows={4}
                            aria-invalid={Boolean(editor.headersError)}
                            disabled={fieldDisabled}
                            onChange={(e) => onChange('headersText', e.target.value)}
                          />
                          {editor.headersError && <FieldError>{editor.headersError}</FieldError>}
                          <FieldDescription>{t('auth_files.headers_hint')}</FieldDescription>
                        </Field>
                        <AuthFilePolicyFields
                          draft={editor.policy ?? readCredentialPolicy(editor.json)}
                          fields={['errorRules']}
                          disabled={disableControls || saving}
                          onChange={onChange}
                        />
                      </FieldGroup>
                    </FieldSet>
                  </>
                )}
              </FieldGroup>
            ))}
        </div>

        <SheetFooter className="flex-row justify-end border-t">
          <Button variant="outline" onClick={requestClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={onSave}
            disabled={
              disableControls ||
              saving ||
              !dirty ||
              !editor?.json ||
              Boolean(editor?.headersTouched && editor.headersError) ||
              Boolean(editor?.weightError) ||
              Boolean(credentialPolicyError(editor?.policy))
            }
          >
            {t('common.save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
