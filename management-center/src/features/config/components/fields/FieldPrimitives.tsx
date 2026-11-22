import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { configFieldDomId } from '../../searchIndex';
import { OptionSelect, type SelectOption } from './OptionSelect';

/**
 * Data attribute a search jump sets on the target row for a moment (useFieldJump).
 * Rows and anchors style `data-highlight` themselves.
 */
export const FIELD_HIGHLIGHT_ATTR = 'data-highlight';

/* Setting rows: toggles, inputs, selects and block editors share one skeleton:
   the title, description and error on the left (or on top), the control beside or below. */

type SettingCopy = {
  /** Search anchor: the row itself carries the DOM id (configFieldDomId). */
  fieldId: string;
  label: string;
  description?: ReactNode;
  error?: string;
};

type SettingIds = { controlId: string; labelId: string; hintId: string; errorId: string };

function useSettingIds(fieldId: string): SettingIds {
  const controlId = useId();
  return {
    controlId,
    labelId: `${controlId}-${fieldId}-label`,
    hintId: `${controlId}-hint`,
    errorId: `${controlId}-error`,
  };
}

function describedBy(ids: SettingIds, description: ReactNode, error?: string) {
  return (
    [error ? ids.errorId : '', description ? ids.hintId : ''].filter(Boolean).join(' ') || undefined
  );
}

/** sm = numbers and durations, md = ordinary text, lg = URLs, paths and other long text. */
type ControlSize = 'sm' | 'md' | 'lg';

const rowClass =
  'scroll-mt-24 px-4 py-3.5 transition-colors duration-200 ease-out data-highlight:bg-primary/10 motion-reduce:transition-none';

// Short controls sit beside the copy; long ones (and every control on a phone) go below it.
type RowLayout = ControlSize | 'toggle' | 'block';

const layoutClass: Record<RowLayout, string> = {
  toggle: 'flex items-center justify-between gap-4',
  sm: 'flex items-center justify-between gap-4',
  md: 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6',
  lg: 'flex flex-col gap-3',
  block: 'flex flex-col gap-3',
};

const controlClass: Record<RowLayout, string> = {
  toggle: 'flex shrink-0',
  sm: 'w-28 shrink-0',
  md: 'w-full sm:w-64 sm:shrink-0',
  lg: 'w-full',
  block: 'w-full min-w-0',
};

function SettingRow({
  fieldId,
  label,
  description,
  error,
  ids,
  layout,
  labelFor,
  control,
}: SettingCopy & {
  ids: SettingIds;
  layout: RowLayout;
  /** With a single control the title is its <label>; block editors only get a group name. */
  labelFor?: string;
  control: ReactNode;
}) {
  return (
    <div id={configFieldDomId(fieldId)} className={cn(rowClass, layoutClass[layout])}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {labelFor ? (
          <label id={ids.labelId} htmlFor={labelFor} className="text-sm font-medium">
            {label}
          </label>
        ) : (
          <span id={ids.labelId} className="text-sm font-medium">
            {label}
          </span>
        )}
        {description ? (
          <div id={ids.hintId} className="text-[13px] leading-normal text-muted-foreground">
            {description}
          </div>
        ) : null}
        {error ? (
          <div id={ids.errorId} className="text-[13px] text-destructive">
            {error}
          </div>
        ) : null}
      </div>
      <div className={controlClass[layout]}>{control}</div>
    </div>
  );
}

export function ToggleSetting({
  checked,
  disabled,
  onChange,
  ...copy
}: Omit<SettingCopy, 'error'> & {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const ids = useSettingIds(copy.fieldId);
  return (
    <SettingRow
      {...copy}
      ids={ids}
      layout="toggle"
      labelFor={ids.controlId}
      control={
        <Switch
          id={ids.controlId}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onChange}
          aria-describedby={describedBy(ids, copy.description)}
        />
      }
    />
  );
}

type NativeInputProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'placeholder' | 'min' | 'max' | 'autoComplete'
>;

export function TextSetting({
  value,
  disabled,
  onChange,
  size = 'md',
  adornment,
  type = 'text',
  placeholder,
  min,
  max,
  autoComplete,
  ...copy
}: SettingCopy &
  NativeInputProps & {
    value: string;
    disabled?: boolean;
    onChange: (value: string) => void;
    size?: ControlSize;
    /** A state marker inside the input on the right (such as "Disabled" when keepalive is 0). */
    adornment?: ReactNode;
  }) {
  const ids = useSettingIds(copy.fieldId);
  return (
    <SettingRow
      {...copy}
      ids={ids}
      layout={size}
      labelFor={ids.controlId}
      control={
        <div className="relative">
          <Input
            id={ids.controlId}
            className={cn(
              'h-9',
              (type === 'number' || size === 'lg') && 'font-mono text-[13px] md:text-[13px]',
              adornment && 'pr-20'
            )}
            type={type}
            value={value}
            placeholder={placeholder}
            min={min}
            max={max}
            autoComplete={autoComplete}
            spellCheck={false}
            disabled={disabled}
            aria-invalid={Boolean(copy.error)}
            aria-describedby={describedBy(ids, copy.description, copy.error)}
            onChange={(event) => onChange(event.target.value)}
          />
          {adornment ? (
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-faint">
              {adornment}
            </span>
          ) : null}
        </div>
      }
    />
  );
}

export function SelectSetting<T extends string>({
  value,
  options,
  disabled,
  onChange,
  size = 'md',
  ...copy
}: SettingCopy & {
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  disabled?: boolean;
  onChange: (value: T) => void;
  size?: ControlSize;
}) {
  const ids = useSettingIds(copy.fieldId);
  return (
    <SettingRow
      {...copy}
      ids={ids}
      layout={size === 'sm' ? 'md' : size}
      labelFor={ids.controlId}
      control={
        <OptionSelect
          id={ids.controlId}
          value={value}
          options={options}
          disabled={disabled}
          ariaLabelledBy={ids.labelId}
          ariaDescribedBy={describedBy(ids, copy.description, copy.error)}
          ariaInvalid={copy.error ? true : undefined}
          onChange={onChange}
        />
      }
    />
  );
}

export type BlockSettingA11y = { describedBy?: string; invalid: boolean };

/**
 * A row for a block editor (string lists, ICE servers): the title and description on top,
 * the editor below. The editor sits in a role="group" named by the title; when children is
 * a function it receives describedBy to put on its own controls.
 */
export function BlockSetting({
  children,
  ...copy
}: SettingCopy & {
  children: ReactNode | ((a11y: BlockSettingA11y) => ReactNode);
}) {
  const ids = useSettingIds(copy.fieldId);
  const a11y = {
    describedBy: describedBy(ids, copy.description, copy.error),
    invalid: Boolean(copy.error),
  };
  return (
    <SettingRow
      {...copy}
      ids={ids}
      layout="block"
      control={
        <div
          role="group"
          aria-labelledby={ids.labelId}
          aria-describedby={a11y.describedBy}
          aria-invalid={a11y.invalid || undefined}
        >
          {typeof children === 'function' ? children(a11y) : children}
        </div>
      }
    />
  );
}

/** A block with its own heading (such as the API keys editor): only the anchor and the row. */
export function SettingCell({ fieldId, children }: { fieldId: string; children: ReactNode }) {
  return (
    <div id={configFieldDomId(fieldId)} className={cn(rowClass, 'flex flex-col gap-3')}>
      {children}
    </div>
  );
}

/** A group of setting rows: an optional heading and a bordered list. */
export function SettingList({
  title,
  description,
  children,
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const list = <div className="divide-y overflow-hidden rounded-xl border bg-card">{children}</div>;
  if (!title) return list;
  return (
    <section className="flex flex-col gap-2.5">
      <header className="flex flex-col gap-1 px-0.5">
        <h3 className="text-sm font-medium">{title}</h3>
        {description ? (
          <p className="text-[13px] leading-normal text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {list}
    </section>
  );
}

/* ---------- Layout helpers for block editors ---------- */

export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

export function FieldStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

// Stable, stateless anchor around a searchable block that is not a setting row
// (payload rule groups). Search jumps target its DOM id and highlight it.
export function FieldAnchor({ fieldId, children }: { fieldId: string; children: ReactNode }) {
  return (
    <div
      id={configFieldDomId(fieldId)}
      className="scroll-mt-24 rounded-xl transition-shadow duration-200 ease-out data-highlight:ring-2 data-highlight:ring-primary/60 motion-reduce:transition-none"
    >
      {children}
    </div>
  );
}

/** A standalone hint line (such as the note above an editor inside a SettingCell). */
export function FieldHint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <div id={id} className="text-[13px] leading-normal text-muted-foreground">
      {children}
    </div>
  );
}

/** A label-on-top field inside block editors (payload rules and other multi-control forms). */
export function FieldShell({
  label,
  labelId,
  htmlFor,
  hint,
  hintId,
  error,
  errorId,
  children,
}: {
  label: string;
  labelId?: string;
  htmlFor?: string;
  hint?: string;
  hintId?: string;
  error?: string;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label id={labelId} htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <div id={errorId} className="text-[13px] text-destructive">
          {error}
        </div>
      ) : null}
      {hint ? (
        <div id={hintId} className="text-xs leading-normal text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
