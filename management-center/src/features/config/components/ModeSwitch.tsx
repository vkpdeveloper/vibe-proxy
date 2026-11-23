import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ConfigEditorMode } from '../constants';

export type ModeSwitchProps = {
  mode: ConfigEditorMode;
  disabled?: boolean;
  onChange: (mode: ConfigEditorMode) => void;
};

const MODES: readonly ConfigEditorMode[] = ['visual', 'source'];

/**
 * Visual / source switch. Source is another view of the whole document, not another
 * section, so it lives in the page header instead of the section tabs.
 */
export function ModeSwitch({ mode, disabled = false, onChange }: ModeSwitchProps) {
  const { t } = useTranslation();
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={mode}
      // Radix sends an empty value when the active item is pressed again; keep the current mode.
      onValueChange={(value) => {
        const next = MODES.find((entry) => entry === value);
        if (next) onChange(next);
      }}
      disabled={disabled}
      aria-label={t('config_management.mode.label')}
    >
      {MODES.map((entry) => (
        <ToggleGroupItem key={entry} value={entry} className="h-9 px-3 max-sm:h-10 max-sm:px-2.5">
          {t(`config_management.mode.${entry}`)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
