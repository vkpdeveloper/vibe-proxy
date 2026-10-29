import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconSearch, IconTrash2 } from '@/components/ui/icons';
import type {
  AuthFilesSortMode,
  AuthFilesStatusFilterMode,
} from '@/features/authFiles/uiState';
import styles from './AuthFilesToolbar.module.scss';

export type AuthFilesToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilterMode: AuthFilesStatusFilterMode;
  statusFilterOptions: Array<{ value: AuthFilesStatusFilterMode; label: string }>;
  onStatusFilterChange: (mode: AuthFilesStatusFilterMode) => void;
  sortMode: AuthFilesSortMode;
  sortOptions: Array<{ value: string; label: string }>;
  onSortModeChange: (value: string) => void;
  deleteLabel: string;
  deleteDisabled: boolean;
  deleteLoading: boolean;
  onDelete: () => void;
};

/**
 * 工作区工具栏：搜索 · 状态分段 · 排序。
 * 「删除筛选结果」放在工具栏最右端——与限定它作用域的过滤器相邻（映射原则）。
 */
export function AuthFilesToolbar(props: AuthFilesToolbarProps) {
  const {
    search,
    onSearchChange,
    statusFilterMode,
    statusFilterOptions,
    onStatusFilterChange,
    sortMode,
    sortOptions,
    onSortModeChange,
    deleteLabel,
    deleteDisabled,
    deleteLoading,
    onDelete,
  } = props;
  const { t } = useTranslation();

  return (
    <div className={styles.toolbar}>
      <div className={styles.search}>
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('auth_files.search_placeholder')}
          aria-label={t('auth_files.search_label')}
          rightElement={<IconSearch className={styles.searchIcon} size={16} />}
        />
      </div>

      <div
        className={styles.segmented}
        role="group"
        aria-label={t('auth_files.problem_filter_label')}
      >
        {statusFilterOptions.map((option) => {
          const isActive = statusFilterMode === option.value;
          const isProblem = option.value === 'problem';
          return (
            <button
              key={option.value}
              type="button"
              className={`${styles.segment} ${isActive ? styles.segmentActive : ''} ${
                isProblem ? styles.segmentProblem : ''
              }`}
              aria-pressed={isActive}
              onClick={() => onStatusFilterChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className={styles.sort}>
        <Select
          value={sortMode}
          options={sortOptions}
          onChange={onSortModeChange}
          ariaLabel={t('auth_files.sort_label')}
          size="sm"
        />
      </div>

      <button
        type="button"
        className={styles.deleteAction}
        onClick={onDelete}
        disabled={deleteDisabled}
      >
        {deleteLoading ? <LoadingSpinner size={13} /> : <IconTrash2 size={14} />}
        {deleteLabel}
      </button>
    </div>
  );
}
