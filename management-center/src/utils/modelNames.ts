import type { AuthFileModelItem } from '@/features/authFiles/constants';

const CLAUDE_FAMILIES = ['fable', 'opus', 'sonnet', 'haiku'];
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * One naming scheme for every model. Upstream registries mix "Claude 4.5 Haiku"
 * with "Claude Opus 4.7" and "GPT 6.0"; Claude names are rebuilt from the id
 * and GPT versions use OpenAI's own "GPT-6" form.
 */
export function modelDisplayName(model: AuthFileModelItem): string {
  const id = model.id.toLowerCase();
  // claude-opus-4-7, claude-haiku-4-5-20251001
  const current = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/);
  // claude-3-7-sonnet-20250219
  const legacy = id.match(/^claude-(\d+)(?:-(\d{1,2}))?-([a-z]+)(?:-\d{8})?$/);
  if (current && CLAUDE_FAMILIES.includes(current[1])) {
    const version = current[3] ? `${current[2]}.${current[3]}` : current[2];
    return `Claude ${capitalize(current[1])} ${version}`;
  }
  if (legacy && CLAUDE_FAMILIES.includes(legacy[3])) {
    const version = legacy[2] ? `${legacy[1]}.${legacy[2]}` : legacy[1];
    return `Claude ${capitalize(legacy[3])} ${version}`;
  }

  // gpt-6.1-sol without a registry name reads as "GPT-6.1 Sol".
  const gpt = id.match(/^gpt-(\d+(?:\.\d+)?)((?:-[a-z]+)*)$/);
  if (!model.display_name?.trim() && gpt) {
    const words = gpt[2].split('-').filter(Boolean).map(capitalize);
    return [`GPT-${gpt[1]}`, ...words].join(' ');
  }

  const name = model.display_name?.trim() || model.id;
  return name.replace(/^GPT (\d+(?:\.\d+)?)/, (_, version: string) =>
    `GPT-${version.replace(/\.0$/, '')}`
  );
}

const versionOf = (name: string) => Number(name.match(/\d+(?:\.\d+)?/)?.[0] ?? 0);

/** Named models, newest version first. */
export function namedModels<T extends AuthFileModelItem>(models: T[]) {
  return models
    .map((model) => ({ ...model, name: modelDisplayName(model) }))
    .sort((a, b) => versionOf(b.name) - versionOf(a.name) || a.name.localeCompare(b.name));
}
