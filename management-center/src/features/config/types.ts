import type { VisualConfigValidationErrors, VisualConfigValues } from '@/types/visualConfig';

/** 分区组件的统一签名：受控于 useVisualConfig 的表单值 + 补丁式 onChange。 */
export type ConfigSectionProps = {
  values: VisualConfigValues;
  validationErrors?: VisualConfigValidationErrors;
  disabled: boolean;
  onChange: (patch: Partial<VisualConfigValues>) => void;
};
