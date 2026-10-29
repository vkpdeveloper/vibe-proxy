import { cssColor, DitherShader } from '@/lib/dither';
import type { DitherShaderProps } from '@/lib/dither';

/*
 * Request lanes: gently warped horizontal lines, each carrying bright packets
 * that travel right at their own pace, like traffic moving through the proxy.
 * The tone thins towards the left and the bottom edge.
 */
const FIELD = `
float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  float warp = snoise(vec2(p.x * 0.5 - t * 0.04, 0.7)) * 5.0;
  float lanePos = (uv.y * res.y + warp) / signalGap;
  float laneIndex = floor(lanePos + 0.5);
  float laneOffset = abs(fract(lanePos + 0.5) - 0.5) * signalGap;
  float lane = 1.0 - smoothstep(0.35, 1.35, laneOffset);

  float laneSpeed = 0.1 + 0.16 * hash21(vec2(laneIndex, 1.0));
  float phase = fract(p.x * 0.9 - t * laneSpeed + hash21(vec2(laneIndex, 7.0)));
  float packet = smoothstep(0.0, 0.2, phase) * (1.0 - smoothstep(0.2, 0.26, phase));

  float side = smoothstep(signalClear, 1.0, uv.x);
  float top = smoothstep(0.0, 0.4, uv.y);
  return lane * mix(0.16, 1.0, packet) * side * top * signalIntensity;
}
`;

export type SignalFieldProps = Omit<DitherShaderProps, 'field' | 'uniforms' | 'fallback'> & {
  /** Peak tone, 0 to 1. Default 0.9. */
  intensity?: number;
  /** Cells between lanes. Default 9. */
  gap?: number;
  /** Share of the width, from the left, kept clear. Default 0.35. */
  clear?: number;
};

export function SignalField({
  intensity = 0.9,
  gap = 9,
  clear = 0.35,
  palette = ['transparent', 'ink'],
  ...props
}: SignalFieldProps) {
  return (
    <DitherShader
      {...props}
      field={FIELD}
      palette={palette}
      stillTime={14}
      uniforms={{ signalIntensity: intensity, signalGap: gap, signalClear: clear }}
      fallback={
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(to left, color-mix(in oklch, ${cssColor(palette[palette.length - 1])} 14%, transparent), transparent ${Math.round((1 - clear) * 100)}%)`,
          }}
        />
      }
    />
  );
}
