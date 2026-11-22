import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import type { AuthFileModelItem } from '@/features/authFiles/constants';
import {
  getTypeLabel,
  isModelExcluded,
  normalizeProviderKey,
} from '@/features/authFiles/constants';
import { namedModels } from '@/utils/modelNames';
import { Hint } from '@/components/ui/tooltip';

export type AuthFileModelsModalProps = {
  open: boolean;
  fileType: string;
  loading: boolean;
  error: 'unsupported' | null;
  models: AuthFileModelItem[];
  excluded: Record<string, string[]>;
  onClose: () => void;
  onCopyText: (text: string) => void;
};

export function AuthFileModelsModal(props: AuthFileModelsModalProps) {
  const { t } = useTranslation();
  const { open, fileType, loading, error, models, excluded, onClose, onCopyText } = props;

  const emptyState = (title: string, description: string) => (
    <Empty className="border border-dashed p-6 md:p-6">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('auth_files.models_title')}</DialogTitle>
          <DialogDescription>{getTypeLabel(t, normalizeProviderKey(fileType))}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-muted-foreground">
            {t('auth_files.models_loading', { defaultValue: '正在加载模型列表...' })}
          </p>
        ) : error === 'unsupported' ? (
          emptyState(
            t('auth_files.models_unsupported', { defaultValue: '当前版本不支持此功能' }),
            t('auth_files.models_unsupported_desc', {
              defaultValue: '请更新 CLI Proxy API 到最新版本后重试',
            })
          )
        ) : models.length === 0 ? (
          emptyState(
            t('auth_files.models_empty', { defaultValue: '该凭证暂无可用模型' }),
            t('auth_files.models_empty_desc', {
              defaultValue: '该认证凭证可能尚未被服务器加载或没有绑定任何模型',
            })
          )
        ) : (
          <ul className="flex max-h-[60vh] flex-col divide-y overflow-y-auto rounded-lg border">
            {namedModels(models).map((model) => {
              const excludedModel = isModelExcluded(model.id, fileType, excluded);
              return (
                <li key={model.id}>
                  <Hint
                    label={
                      excludedModel
                        ? t('auth_files.models_excluded_hint', {
                            defaultValue: '此 OAuth 模型已被禁用',
                          })
                        : t('common.copy', { defaultValue: '点击复制' })
                    }
                  >
                    <button
                      type="button"
                      className={cn(
                        'flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left transition-colors duration-150 ease-out hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none motion-reduce:transition-none',
                        excludedModel && 'text-muted-foreground'
                      )}
                      onClick={() => onCopyText(model.id)}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cn('truncate', excludedModel && 'line-through')}>
                          {model.name}
                        </span>
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {model.id}
                        </span>
                      </span>
                      {excludedModel && (
                        <Badge variant="outline" className="shrink-0 text-warning">
                          {t('auth_files.models_excluded_badge', { defaultValue: '已禁用' })}
                        </Badge>
                      )}
                    </button>
                  </Hint>
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t('common.close')}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
