import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowUp01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import type { UseSourceSearchResult } from '../hooks/useSourceSearch';
import { Hint } from '@/components/ui/tooltip';

const LazyConfigSourceEditor = lazy(() => import('./ConfigSourceEditor'));

export type SourceSearchBarProps = {
  search: UseSourceSearchResult;
  disabled: boolean;
};

/** Search for source mode: takes the toolbar slot the field search uses in visual mode. */
export function SourceSearchBar({ search, disabled }: SourceSearchBarProps) {
  const { t } = useTranslation();
  const {
    searchQuery,
    searchResults,
    lastSearchedQuery,
    handleSearchChange,
    executeSearch,
    handleSearchKeyDown,
  } = search;
  const searched = Boolean(searchQuery) && lastSearchedQuery === searchQuery;
  // Enter or the arrows run the search, so the field needs no search button of its own.
  const stepDisabled = !searchQuery || disabled;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <InputGroup className="h-9 min-w-0 flex-1 max-sm:h-10">
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={1.75} />
        </InputGroupAddon>
        <InputGroupInput
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder={t('config_management.search_placeholder')}
          aria-label={t('config_management.search_placeholder')}
          enterKeyHint="search"
          disabled={disabled}
        />
        {searched ? (
          <InputGroupAddon align="inline-end">
            <span className="text-xs text-muted-foreground">
              {searchResults.total > 0
                ? `${searchResults.current} / ${searchResults.total}`
                : t('config_management.search_no_results')}
            </span>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <ButtonGroup>
        <Hint label={t('config_management.search_prev')}>
          <Button
            variant="outline"
            size="icon-lg"
            className="max-sm:size-10"
            onClick={() => executeSearch('prev')}
            disabled={stepDisabled}
            aria-label={t('config_management.search_prev')}
          >
            <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={1.75} />
          </Button>
        </Hint>
        <Hint label={t('config_management.search_next')}>
          <Button
            variant="outline"
            size="icon-lg"
            className="max-sm:size-10"
            onClick={() => executeSearch('next')}
            disabled={stepDisabled}
            aria-label={t('config_management.search_next')}
          >
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.75} />
          </Button>
        </Hint>
      </ButtonGroup>
    </div>
  );
}

export type SourcePanelProps = {
  search: UseSourceSearchResult;
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
};

/** The YAML source editor: a lazy CodeMirror with highlighting, folding and search keys. */
export function SourcePanel({ search, value, onChange, editable }: SourcePanelProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <Suspense fallback={null}>
        <LazyConfigSourceEditor
          editorRef={search.editorRef}
          value={value}
          onChange={onChange}
          editable={editable}
          placeholder={t('config_management.editor_placeholder')}
        />
      </Suspense>
    </div>
  );
}
