export type LayerStatus = 'current' | 'exiting' | 'stacked';

export type PageTransitionLayerContextValue = {
  status: LayerStatus;
  isCurrentLayer: boolean;
  isAnimating: boolean;
};

const CURRENT_LAYER: PageTransitionLayerContextValue = {
  status: 'current',
  isCurrentLayer: true,
  isAnimating: false,
};

/**
 * Views swap instantly now, like VM Bridge, so the rendered page is always the current layer.
 * Kept so pages that gated work on an exiting layer keep compiling.
 */
export function usePageTransitionLayer() {
  return CURRENT_LAYER;
}
