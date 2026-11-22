import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { makeClientId, type CodexLiveICEServerDraft } from '@/types/visualConfig';
import { FieldGrid, FieldShell } from '../fields/FieldPrimitives';
import { AddButton, RuleCard } from './parts';

/**
 * ICE 服务器列表。标题、说明与校验错误由外层 BlockSetting 渲染；
 * describedBy / invalid 由它传入，挂到每个内部控件上。
 */
export function CodexLiveICEServersEditor({
  value,
  disabled,
  describedBy,
  invalid = false,
  onChange,
}: {
  value: CodexLiveICEServerDraft[];
  disabled?: boolean;
  describedBy?: string;
  invalid?: boolean;
  onChange: (next: CodexLiveICEServerDraft[]) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const updateServer = (serverId: string, patch: Partial<CodexLiveICEServerDraft>) =>
    onChange(value.map((server) => (server.id === serverId ? { ...server, ...patch } : server)));

  return (
    <div className="flex flex-col gap-3">
      {value.map((server, index) => {
        const serverLabel = t('config_management.visual.additions.iceServer', {
          index: index + 1,
        });
        const removeLabel = t('config_management.visual.additions.iceRemove', {
          index: index + 1,
        });
        const urlsId = `${id}-${server.id}-urls`;
        const usernameId = `${id}-${server.id}-username`;
        const credentialId = `${id}-${server.id}-credential`;
        return (
          <RuleCard
            key={server.id}
            role="group"
            aria-label={serverLabel}
            title={serverLabel}
            removeLabel={removeLabel}
            disabled={disabled}
            onRemove={() => onChange(value.filter((item) => item.id !== server.id))}
          >
            <FieldShell label={t('config_management.visual.additions.iceURLs')} htmlFor={urlsId}>
              <Textarea
                id={urlsId}
                className="font-mono text-[13px] md:text-[13px]"
                rows={3}
                value={server.urlsText}
                disabled={disabled}
                spellCheck={false}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                onChange={(event) => updateServer(server.id, { urlsText: event.target.value })}
              />
            </FieldShell>
            <FieldGrid>
              <FieldShell
                label={t('config_management.visual.additions.iceUsername')}
                htmlFor={usernameId}
              >
                <Input
                  id={usernameId}
                  className="h-9"
                  value={server.username}
                  disabled={disabled}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={describedBy}
                  onChange={(event) => updateServer(server.id, { username: event.target.value })}
                />
              </FieldShell>
              <FieldShell
                label={t('config_management.visual.additions.iceCredential')}
                htmlFor={credentialId}
              >
                <Input
                  id={credentialId}
                  className="h-9"
                  type="password"
                  value={server.credential}
                  disabled={disabled}
                  autoComplete="new-password"
                  aria-describedby={describedBy}
                  onChange={(event) => updateServer(server.id, { credential: event.target.value })}
                />
              </FieldShell>
            </FieldGrid>
          </RuleCard>
        );
      })}
      <AddButton
        disabled={disabled}
        onClick={() =>
          onChange([...value, { id: makeClientId(), urlsText: '', username: '', credential: '' }])
        }
      >
        {t('config_management.visual.additions.iceAdd')}
      </AddButton>
    </div>
  );
}
