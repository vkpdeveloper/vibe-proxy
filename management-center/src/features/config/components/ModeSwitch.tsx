import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
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
    <ButtonGroup aria-label={t('config_management.mode.label')}>
      {MODES.map((entry) => (
        <Button
          key={entry}
          variant={mode === entry ? 'secondary' : 'outline'}
          className="h-9 px-3"
          aria-pressed={mode === entry}
          disabled={disabled}
          onClick={() => onChange(entry)}
        >
          {t(`config_management.mode.${entry}`)}
        </Button>
      ))}
    </ButtonGroup>
  );
}
