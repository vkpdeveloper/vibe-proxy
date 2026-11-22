import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import { UnfoldMoreIcon } from '@hugeicons/core-free-icons';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { cn } from '@/lib/utils';

interface AutocompleteInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[] | { value: string; label?: string }[];
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  wrapperClassName?: string;
  wrapperStyle?: React.CSSProperties;
  id?: string;
  rightElement?: ReactNode;
}

const MAX_LIST_HEIGHT = 240;

/** A free-text input with a filtered suggestion list, styled like VM Bridge's select menu. */
export function AutocompleteInput({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  hint,
  error,
  className,
  wrapperClassName,
  wrapperStyle,
  id,
  rightElement,
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);

  const normalizedOptions = options.map((opt) =>
    typeof opt === 'string'
      ? { value: opt, label: opt }
      : { value: opt.value, label: opt.label || opt.value }
  );

  const query = value.toLowerCase();
  const filteredOptions = normalizedOptions.filter(
    (opt) => opt.value.toLowerCase().includes(query) || opt.label.toLowerCase().includes(query)
  );
  const showDropdown = isOpen && filteredOptions.length > 0 && !disabled;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (!showDropdown || !inputWrapRef.current) return;
    const updateDropdownStyle = () => {
      if (!inputWrapRef.current) return;
      const rect = inputWrapRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const opensUp = spaceBelow < 200 && rect.top > spaceBelow;
      setDropdownStyle({
        position: 'fixed',
        ...(opensUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(0, Math.min(MAX_LIST_HEIGHT, opensUp ? rect.top - 12 : spaceBelow)),
      });
    };
    updateDropdownStyle();
    window.addEventListener('resize', updateDropdownStyle);
    window.addEventListener('scroll', updateDropdownStyle, true);

    return () => {
      window.removeEventListener('resize', updateDropdownStyle);
      window.removeEventListener('scroll', updateDropdownStyle, true);
    };
  }, [showDropdown]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setIsOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        e.preventDefault();
        handleSelect(filteredOptions[highlightedIndex].value);
      } else if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  return (
    <Field
      ref={containerRef}
      data-invalid={Boolean(error) || undefined}
      className={cn('gap-2', wrapperClassName)}
      style={wrapperStyle}
    >
      {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      <InputGroup ref={inputWrapRef}>
        <InputGroupInput
          id={id}
          className={className}
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          aria-invalid={Boolean(error) || undefined}
        />
        <InputGroupAddon align="inline-end">
          {rightElement}
          <InputGroupButton
            size="icon-xs"
            tabIndex={-1}
            disabled={disabled}
            aria-hidden="true"
            onClick={() => setIsOpen((open) => !open)}
          >
            <HugeiconsIcon
              icon={UnfoldMoreIcon}
              strokeWidth={2}
              className="text-muted-foreground"
            />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {showDropdown &&
        dropdownStyle &&
        createPortal(
          <div
            ref={dropdownRef}
            role="listbox"
            style={dropdownStyle}
            className="pointer-events-auto z-50 overflow-y-auto rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none"
          >
            {filteredOptions.map((opt, index) => (
              <div
                key={`${opt.value}-${index}`}
                role="option"
                aria-selected={opt.value === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(opt.value)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  'flex cursor-default flex-col rounded-md px-1.5 py-1 select-none',
                  index === highlightedIndex && 'bg-accent text-accent-foreground'
                )}
              >
                <span className="truncate">{opt.value}</span>
                {opt.label !== opt.value && (
                  <span className="truncate text-xs text-muted-foreground">{opt.label}</span>
                )}
              </div>
            ))}
          </div>,
          document.body
        )}
      {hint && <FieldDescription>{hint}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
