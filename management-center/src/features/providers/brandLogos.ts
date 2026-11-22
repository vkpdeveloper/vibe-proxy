import claudeLogo from '@/assets/icons/claude.svg';
import codexLogo from '@/assets/icons/codex.svg';
import metaLogo from '@/assets/icons/meta.svg';
import devinLightLogo from '@/assets/icons/devin.svg';
import devinDarkLogo from '@/assets/icons/devin-dark.svg';
import geminiLogo from '@/assets/icons/gemini.svg';
import openaiLightLogo from '@/assets/icons/openai-light.svg';
import openaiDarkLogo from '@/assets/icons/openai-dark.svg';
import vertexLogo from '@/assets/icons/vertex.svg';
import xaiLightLogo from '@/assets/icons/grok.svg';
import xaiDarkLogo from '@/assets/icons/grok-dark.svg';
import type { ProviderBrand } from './types';

export interface ProviderBrandLogo {
  src: string;
  /** Variant for the dark theme, which is the only theme the app renders. */
  darkSrc?: string;
  /** The artwork carries its own rounded tile, so it is shown flush instead of inset. */
  themeSurface?: boolean;
}

export type ProviderBrandLogoKey = ProviderBrand | 'devin';

export const PROVIDER_LOGOS: Record<ProviderBrandLogoKey, ProviderBrandLogo> = {
  gemini: { src: geminiLogo },
  interactions: { src: geminiLogo },
  claude: { src: claudeLogo },
  codex: { src: codexLogo, themeSurface: true },
  meta: { src: metaLogo },
  devin: { src: devinLightLogo, darkSrc: devinDarkLogo },
  xai: { src: xaiLightLogo, darkSrc: xaiDarkLogo },
  vertex: { src: vertexLogo },
  openaiCompatibility: { src: openaiLightLogo, darkSrc: openaiDarkLogo },
};
