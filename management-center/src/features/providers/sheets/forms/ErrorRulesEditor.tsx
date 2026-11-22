import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ERROR_RULE_ACTIONS,
  createErrorMatch,
  createErrorRule,
  isInvalidErrorMatch,
  moveErrorRule,
  validateErrorRule,
  type ErrorRuleDraft,
} from '../../errorRules';
import { FormSelect } from './FormControls';

export interface ErrorRulesEditorProps {
  rules: ErrorRuleDraft[];
  onChange: (rules: ErrorRuleDraft[]) => void;
  disabled: boolean;
}

const actions: readonly string[] = ERROR_RULE_ACTIONS;
const key = 'providersPage.errorRules';

export function ErrorRulesEditor({ rules, onChange, disabled }: ErrorRulesEditorProps) {
  const { t } = useTranslation();
  const id = useId();
  const counter = useRef(0);
  const pendingFocus = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const nextId = () => `${id}-draft-${++counter.current}`;
  const statusId = (ruleId: string) => `${id}-${ruleId}-status`;
  const matchId = (match: string) => `${id}-${match}-value`;

  useEffect(() => {
    if (!pendingFocus.current) return;
    const target = document.getElementById(pendingFocus.current);
    if (target && root.current?.contains(target)) target.focus();
    pendingFocus.current = null;
  }, [rules]);

  const update = (rule: ErrorRuleDraft) => {
    onChange(rules.map((item) => (item.id === rule.id ? rule : item)));
  };

  return (
    <div ref={root} className="@container flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t(`${key}.hint`)}</p>
      {rules.length === 0 && <p className="text-sm text-muted-foreground">{t(`${key}.empty`)}</p>}
      {rules.map((rule, index) => {
        const error = touched.has(rule.id) ? validateErrorRule(rule) : null;
        const errorId = `${id}-${rule.id}-error`;
        const statusError = error === `${key}.invalidStatus`;
        const actionError = error === `${key}.invalidAction`;
        const matchError = error === `${key}.invalidMatch`;
        return (
          <div
            key={rule.id}
            role="group"
            aria-labelledby={`${id}-${rule.id}-title`}
            aria-describedby={error ? errorId : undefined}
            className="flex flex-col gap-3 rounded-lg border p-3"
            onBlur={() => setTouched((previous) => new Set(previous).add(rule.id))}
          >
            <div className="flex items-center justify-between gap-2">
              <span id={`${id}-${rule.id}-title`} className="text-sm font-medium">
                {t(`${key}.rule`, { number: index + 1 })}
              </span>
              <div className="flex items-center gap-0.5">
                {([-1, 1] as const).map((direction) => (
                  <Button
                    key={direction}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={
                      disabled || (direction === -1 ? index === 0 : index === rules.length - 1)
                    }
                    aria-label={t(`${key}.${direction === -1 ? 'moveUp' : 'moveDown'}`)}
                    title={t(`${key}.${direction === -1 ? 'moveUp' : 'moveDown'}`)}
                    onClick={() => {
                      pendingFocus.current = statusId(rule.id);
                      onChange(moveErrorRule(rules, rule.id, direction));
                    }}
                  >
                    <HugeiconsIcon
                      icon={direction === -1 ? ArrowUp01Icon : ArrowDown01Icon}
                      strokeWidth={1.75}
                    />
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={disabled}
                  aria-label={t(`${key}.removeRule`)}
                  title={t(`${key}.removeRule`)}
                  onClick={() => {
                    const neighbor = rules[index + 1] ?? rules[index - 1];
                    pendingFocus.current = neighbor ? statusId(neighbor.id) : `${id}-add-rule`;
                    onChange(rules.filter((item) => item.id !== rule.id));
                  }}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 @sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <Field>
                <FieldLabel htmlFor={statusId(rule.id)}>{t(`${key}.status`)}</FieldLabel>
                <Input
                  id={statusId(rule.id)}
                  type="text"
                  inputMode="numeric"
                  className="font-mono"
                  value={rule.status}
                  disabled={disabled}
                  aria-invalid={statusError || undefined}
                  aria-describedby={statusError ? errorId : undefined}
                  onChange={(event) => update({ ...rule, status: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-${rule.id}-action`}>{t(`${key}.action`)}</FieldLabel>
                <FormSelect
                  id={`${id}-${rule.id}-action`}
                  ariaLabel={t(`${key}.action`)}
                  value={rule.action}
                  disabled={disabled}
                  ariaInvalid={actionError || undefined}
                  ariaDescribedBy={actionError ? errorId : undefined}
                  options={[
                    { value: '', label: t(`${key}.selectAction`) },
                    ...(rule.action && !actions.includes(rule.action)
                      ? [{ value: rule.action, label: rule.action }]
                      : []),
                    ...actions.map((action) => ({
                      value: action,
                      label: t(`${key}.actions.${action}`),
                    })),
                  ]}
                  onChange={(action) => update({ ...rule, action })}
                />
              </Field>
            </div>
            {rule.matches.map((match, matchIndex) => {
              const invalid = matchError && isInvalidErrorMatch(rule, match);
              return (
                <div
                  key={match.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-3 @sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
                >
                  <Field className="col-span-2 @sm:col-span-1">
                    <FieldLabel htmlFor={`${id}-${match.id}-kind`}>
                      {t(`${key}.matchType`)}
                    </FieldLabel>
                    <FormSelect
                      id={`${id}-${match.id}-kind`}
                      ariaLabel={t(`${key}.matchType`)}
                      value={match.kind}
                      disabled={disabled}
                      options={[
                        { value: 'text', label: t(`${key}.text`) },
                        { value: 'regex', label: t(`${key}.regex`) },
                      ]}
                      onChange={(kind) =>
                        update({
                          ...rule,
                          matches: rule.matches.map((item) =>
                            item.id === match.id
                              ? { ...item, kind: kind as 'text' | 'regex' }
                              : item
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={matchId(match.id)}>{t(`${key}.matchValue`)}</FieldLabel>
                    <Textarea
                      id={matchId(match.id)}
                      className="min-h-8 resize-y py-1.5 font-mono"
                      rows={1}
                      value={match.value}
                      disabled={disabled}
                      spellCheck={false}
                      aria-invalid={invalid || undefined}
                      aria-describedby={
                        [
                          match.kind === 'regex' ? `${id}-${match.id}-hint` : '',
                          invalid ? errorId : '',
                        ]
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                      onChange={(event) =>
                        update({
                          ...rule,
                          matches: rule.matches.map((item) =>
                            item.id === match.id ? { ...item, value: event.target.value } : item
                          ),
                        })
                      }
                    />
                    {match.kind === 'regex' && (
                      <FieldDescription id={`${id}-${match.id}-hint`} className="text-xs">
                        {t(`${key}.regexHint`)}
                      </FieldDescription>
                    )}
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-6 text-muted-foreground hover:text-destructive"
                    disabled={disabled}
                    aria-label={t(`${key}.removeMatch`)}
                    title={t(`${key}.removeMatch`)}
                    onClick={() => {
                      const neighbor = rule.matches[matchIndex + 1] ?? rule.matches[matchIndex - 1];
                      pendingFocus.current = neighbor
                        ? matchId(neighbor.id)
                        : `${id}-${rule.id}-add-match`;
                      update({
                        ...rule,
                        matches: rule.matches.filter((item) => item.id !== match.id),
                      });
                    }}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} />
                  </Button>
                </div>
              );
            })}
            <Button
              id={`${id}-${rule.id}-add-match`}
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              disabled={disabled}
              onClick={() => {
                const match = createErrorMatch(nextId());
                pendingFocus.current = matchId(match.id);
                update({ ...rule, matches: [...rule.matches, match] });
              }}
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} />
              {t(`${key}.addMatch`)}
            </Button>
            {error && (
              <div id={errorId} role="status" className="text-sm text-destructive">
                {t(error)}
              </div>
            )}
          </div>
        );
      })}
      <Button
        id={`${id}-add-rule`}
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={disabled}
        onClick={() => {
          const rule = createErrorRule(nextId());
          pendingFocus.current = statusId(rule.id);
          onChange([...rules, rule]);
        }}
      >
        <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} />
        {t(`${key}.addRule`)}
      </Button>
    </div>
  );
}
