// shaders.ts — P7 GL 特效 GLSL ES 1.0 shader 源码
// 合并方案：所有特效在一个 fragment shader 中，uniform 控制开关

export const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// 合并 fragment shader：所有特效通过 uniform 开关控制
export const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_time;

// 特效开关 (0.0 = off, 1.0 = on)
uniform float u_blur;
uniform float u_blurIntensity;   // 0-20, default 5
uniform float u_sharpen;
uniform float u_vignette;
uniform float u_vignetteStrength; // 0-1, default 0.5
uniform float u_chromatic;
uniform float u_glow;
uniform float u_noise;
uniform float u_noiseAmount;     // 0-1, default 0.3

// 简单 hash 用于噪点
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = v_texCoord;
  vec2 texel = 1.0 / u_resolution;
  vec4 color = texture2D(u_image, uv);

  // ── Blur: 9-tap 高斯模糊 ──
  if (u_blur > 0.5) {
    float r = u_blurIntensity * 0.5;
    vec4 sum = vec4(0.0);
    sum += texture2D(u_image, uv + vec2(-texel.x, -texel.y) * r) * 0.0625;
    sum += texture2D(u_image, uv + vec2(0.0, -texel.y) * r) * 0.125;
    sum += texture2D(u_image, uv + vec2(texel.x, -texel.y) * r) * 0.0625;
    sum += texture2D(u_image, uv + vec2(-texel.x, 0.0) * r) * 0.125;
    sum += texture2D(u_image, uv) * 0.25;
    sum += texture2D(u_image, uv + vec2(texel.x, 0.0) * r) * 0.125;
    sum += texture2D(u_image, uv + vec2(-texel.x, texel.y) * r) * 0.0625;
    sum += texture2D(u_image, uv + vec2(0.0, texel.y) * r) * 0.125;
    sum += texture2D(u_image, uv + vec2(texel.x, texel.y) * r) * 0.0625;
    color = sum;
  }

  // ── Sharpen: 锐化卷积核 ──
  if (u_sharpen > 0.5) {
    vec4 neighbors = texture2D(u_image, uv + vec2(0.0, texel.y))
                   + texture2D(u_image, uv + vec2(0.0, -texel.y))
                   + texture2D(u_image, uv + vec2(texel.x, 0.0))
                   + texture2D(u_image, uv + vec2(-texel.x, 0.0));
    color = color * 5.0 - neighbors;
    color = clamp(color, 0.0, 1.0);
  }

  // ── Chromatic Aberration: RGB 通道偏移 ──
  if (u_chromatic > 0.5) {
    float offset = 0.003;
    vec2 dir = uv - vec2(0.5);
    float d = length(dir);
    color.r = texture2D(u_image, uv + dir * offset * d).r;
    color.b = texture2D(u_image, uv - dir * offset * d).b;
  }

  // ── Glow: 亮度增强 + 轻微模糊叠加 ──
  if (u_glow > 0.5) {
    float brightness = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    vec4 glowColor = color * (1.0 + brightness * 0.6);
    // 轻微模糊
    vec4 blurSum = vec4(0.0);
    blurSum += texture2D(u_image, uv + vec2(-texel.x, 0.0) * 2.0);
    blurSum += texture2D(u_image, uv + vec2(texel.x, 0.0) * 2.0);
    blurSum += texture2D(u_image, uv + vec2(0.0, -texel.y) * 2.0);
    blurSum += texture2D(u_image, uv + vec2(0.0, texel.y) * 2.0);
    blurSum *= 0.25;
    color = mix(color, glowColor + blurSum * 0.3, 0.5);
    color = clamp(color, 0.0, 1.0);
  }

  // ── Vignette: 暗角 ──
  if (u_vignette > 0.5) {
    vec2 center = uv - vec2(0.5);
    float dist = length(center);
    float vig = 1.0 - smoothstep(0.3, 0.9, dist) * u_vignetteStrength;
    color.rgb *= vig;
  }

  // ── Noise: 随机噪点 ──
  if (u_noise > 0.5) {
    float n = hash(uv * u_resolution + u_time * 100.0) * 2.0 - 1.0;
    color.rgb += n * u_noiseAmount * 0.3;
    color = clamp(color, 0.0, 1.0);
  }

  gl_FragColor = color;
}
`;

// 特效参数定义（用于 InspectorPanel 滑块）
export interface EffectParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export const EFFECT_PARAMS: Record<string, EffectParam[]> = {
  Blur: [{ key: "intensity", label: "强度", min: 0, max: 20, step: 0.5, default: 5 }],
  Vignette: [{ key: "strength", label: "强度", min: 0, max: 1, step: 0.05, default: 0.5 }],
  Noise: [{ key: "amount", label: "数量", min: 0, max: 1, step: 0.05, default: 0.3 }],
};

// 特效名 → shader uniform 映射
export const EFFECT_UNIFORM_MAP: Record<string, { toggle: string; params: Record<string, string> }> = {
  Blur: { toggle: "u_blur", params: { intensity: "u_blurIntensity" } },
  Sharpen: { toggle: "u_sharpen", params: {} },
  Vignette: { toggle: "u_vignette", params: { strength: "u_vignetteStrength" } },
  "Chromatic Aberration": { toggle: "u_chromatic", params: {} },
  Glow: { toggle: "u_glow", params: {} },
  Noise: { toggle: "u_noise", params: { amount: "u_noiseAmount" } },
};
