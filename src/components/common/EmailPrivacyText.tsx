import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { animate, useReducedMotion } from 'motion/react';
import styles from './EmailPrivacyText.module.scss';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const AUTH_FILE_SUFFIX_PATTERN = /\.(?:json|ya?ml)$/i;

const revealedEmails = new Set<string>();
const revealListeners = new Set<() => void>();
let revealVersion = 0;

const subscribeToReveals = (listener: () => void) => {
  revealListeners.add(listener);
  return () => {
    revealListeners.delete(listener);
  };
};

const getRevealVersion = () => revealVersion;

const normalizeEmail = (email: string) => email.toLowerCase();

const revealEmail = (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  if (revealedEmails.has(normalizedEmail)) return;

  revealedEmails.add(normalizedEmail);
  revealVersion += 1;
  revealListeners.forEach((listener) => listener());
};

type TextPart = { type: 'text'; value: string } | { type: 'email'; value: string; key: string };

const splitEmailText = (text: string): TextPart[] => {
  const parts: TextPart[] = [];
  let cursor = 0;

  for (const match of text.matchAll(EMAIL_PATTERN)) {
    if (match.index === undefined) continue;

    const rawMatch = match[0];
    const email = rawMatch.replace(AUTH_FILE_SUFFIX_PATTERN, '');
    const matchStart = match.index;
    const matchEnd = matchStart + email.length;

    if (matchStart > cursor) {
      parts.push({ type: 'text', value: text.slice(cursor, matchStart) });
    }

    parts.push({
      type: 'email',
      value: email,
      key: `${matchStart}-${normalizeEmail(email)}`,
    });
    cursor = matchEnd;
  }

  if (cursor < text.length) {
    parts.push({ type: 'text', value: text.slice(cursor) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', value: text }];
};

function PrivateEmail({ email }: { email: string }) {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  useSyncExternalStore(subscribeToReveals, getRevealVersion, getRevealVersion);

  const isRevealed = revealedEmails.has(normalizeEmail(email));
  const revealLabel = t('common.reveal_email');
  const emailRef = useRef<HTMLButtonElement | null>(null);
  const wasRevealedRef = useRef(isRevealed);

  useEffect(() => {
    const wasRevealed = wasRevealedRef.current;
    wasRevealedRef.current = isRevealed;
    if (!isRevealed || wasRevealed || prefersReducedMotion || !emailRef.current) return;

    const controls = animate(
      emailRef.current,
      {
        filter: ['blur(4px)', 'blur(0px)'],
        opacity: [0.68, 1],
        transform: ['scale(0.98)', 'scale(1)'],
      },
      { type: 'spring', duration: 0.3, bounce: 0 }
    );

    return () => controls.stop();
  }, [isRevealed, prefersReducedMotion]);

  return (
    <button
      ref={emailRef}
      type="button"
      className={`${styles.email} ${isRevealed ? styles.revealed : styles.concealed}`}
      onClick={(event) => {
        event.stopPropagation();
        if (!isRevealed) revealEmail(email);
      }}
      aria-label={isRevealed ? email : revealLabel}
      title={isRevealed ? undefined : revealLabel}
      tabIndex={isRevealed ? -1 : 0}
    >
      {email}
    </button>
  );
}

export interface EmailPrivacyTextProps {
  text: string;
  className?: string;
  fallback?: ReactNode;
}

export function EmailPrivacyText({ text, className, fallback = null }: EmailPrivacyTextProps) {
  if (!text) return fallback;

  return (
    <span className={className}>
      {splitEmailText(text).map((part, index) =>
        part.type === 'email' ? (
          <PrivateEmail key={part.key} email={part.value} />
        ) : (
          <span key={`text-${index}`}>{part.value}</span>
        )
      )}
    </span>
  );
}
