// skins.ts — 换肤引擎（移植自 OpenChatCut src/skins.ts）
// 皮肤 = 一整套 --cc-* CSS 变量覆盖。initSkins() 注入 <style>，
// applySkin() 改 <html data-cc-skin>，Tailwind var() 引用自动生效。
// 持久化 localStorage('honcut.skin')。

export interface SkinTokens {
  bg: string;
  inset: string;
  panel: string;
  panelAlt: string;
  hover: string;
  border: string;
  borderLight: string;
  text: string;
  textMuted: string;
  textDim: string;
  textStrong: string;
  accent: string;
  accentDeep: string;
  accentRgb: string;
  onAccent: string;
  inkRgb: string;
  shadowRgb: string;
  colorScheme: 'dark' | 'light';
  gold: string;
  select: string;
  success: string;
  danger: string;
  tlTrack: string;
  tlSidePanel: string;
  trackVideo: string;
  trackAudioA1: string;
  trackAudioA2: string;
  clipVideo: string;
  clipAudio: string;
  clipMg: string;
  clipText: string;
}

export interface SkinDef {
  id: string;
  nameZh: string;
  tokens: SkinTokens;
}

// ── 石墨 = 默认（与 index.css :root 逐值一致）──────────────────────────
const GRAPHITE: SkinTokens = {
  bg: '#101010', inset: '#141414', panel: '#181818', panelAlt: '#212121', hover: '#2c2c2c',
  border: '#363636', borderLight: '#4a4a4a',
  text: '#e2e2e2', textMuted: '#b0b0b0', textDim: '#808080', textStrong: '#ffffff',
  accent: '#dc7036', accentDeep: '#c45c26', accentRgb: '220,112,54', onAccent: '#ffffff',
  inkRgb: '255,255,255', shadowRgb: '0,0,0', colorScheme: 'dark',
  gold: '#e6ac42', select: '#3b82f6', success: '#3fae6a', danger: '#e06c60',
  tlTrack: '#25262b', tlSidePanel: '#202126',
  trackVideo: '#3b4bd8', trackAudioA1: '#e8993f', trackAudioA2: '#3fae6a',
  clipVideo: '#2d7fb5', clipAudio: '#2f9e5a', clipMg: '#c14d86', clipText: '#c8912f',
};

export const SKINS: readonly SkinDef[] = [
  { id: 'graphite', nameZh: '石墨', tokens: GRAPHITE },
  {
    id: 'midnight', nameZh: '墨黑',
    tokens: {
      ...GRAPHITE,
      bg: '#000000', inset: '#070707', panel: '#0b0b0b', panelAlt: '#161616', hover: '#212121',
      border: '#282828', borderLight: '#3d3d3d',
      text: '#e6e6e6', textMuted: '#ababab', textDim: '#7d7d7d',
      tlTrack: '#131417', tlSidePanel: '#0e0f11',
    },
  },
  {
    id: 'mocha', nameZh: '摩卡',
    tokens: {
      ...GRAPHITE,
      bg: '#11111b', inset: '#181825', panel: '#1e1e2e', panelAlt: '#313244', hover: '#45475a',
      border: '#45475a', borderLight: '#585b70',
      text: '#cdd6f4', textMuted: '#a6adc8', textDim: '#868ba4', textStrong: '#ffffff',
      accent: '#fab387', accentDeep: '#dc976b', accentRgb: '250,179,135', onAccent: '#11111b',
      gold: '#f9e2af', select: '#89b4fa', success: '#a6e3a1', danger: '#f38ba8',
      tlTrack: '#242436', tlSidePanel: '#1b1b2c',
    },
  },
  {
    id: 'nord', nameZh: '北极',
    tokens: {
      ...GRAPHITE,
      bg: '#2e3440', inset: '#3b4252', panel: '#434c5e', panelAlt: '#4c566a', hover: '#5a6577',
      border: '#4c566a', borderLight: '#616e88',
      text: '#eceff4', textMuted: '#d8dee9', textDim: '#a8b2c1', textStrong: '#ffffff',
      accent: '#88c0d0', accentDeep: '#6daabf', accentRgb: '136,192,208', onAccent: '#2e3440',
      gold: '#ebcb8b', select: '#81a1c1', success: '#a3be8c', danger: '#bf616a',
      tlTrack: '#3b4252', tlSidePanel: '#353d4d',
    },
  },
  {
    id: 'latte', nameZh: '拿铁',
    tokens: {
      ...GRAPHITE,
      bg: '#eff1f5', inset: '#e6e9ef', panel: '#dce0e8', panelAlt: '#ccd0da', hover: '#bcc0cc',
      border: '#bcc0cc', borderLight: '#acb0be',
      text: '#4c4f69', textMuted: '#5c5f77', textDim: '#7c7f93', textStrong: '#1e1e2e',
      accent: '#fe640b', accentDeep: '#e05a0a', accentRgb: '254,100,11', onAccent: '#eff1f5',
      inkRgb: '0,0,0', shadowRgb: '76,79,105', colorScheme: 'light',
      gold: '#df8e1d', select: '#1e66f5', success: '#40a02b', danger: '#d20f39',
      tlTrack: '#ccd0da', tlSidePanel: '#dce0e8',
    },
  },
];

// ── CSS 变量映射 ─────────────────────────────────────────────────────────

const VAR_MAP: [keyof SkinTokens, string][] = [
  ['bg', '--cc-bg'], ['inset', '--cc-inset'], ['panel', '--cc-panel'],
  ['panelAlt', '--cc-panel-alt'], ['hover', '--cc-hover'],
  ['border', '--cc-border'], ['borderLight', '--cc-border-light'],
  ['text', '--cc-text'], ['textMuted', '--cc-text-muted'],
  ['textDim', '--cc-text-dim'], ['textStrong', '--cc-text-strong'],
  ['accent', '--cc-accent'], ['accentDeep', '--cc-accent-deep'],
  ['accentRgb', '--cc-accent-rgb'], ['onAccent', '--cc-on-accent'],
  ['inkRgb', '--cc-ink-rgb'], ['shadowRgb', '--cc-shadow-rgb'],
  ['colorScheme', '--cc-color-scheme'],
  ['gold', '--cc-gold'], ['select', '--cc-select'],
  ['success', '--cc-success'], ['danger', '--cc-danger'],
  ['tlTrack', '--cc-tl-track'], ['tlSidePanel', '--cc-tl-side-panel'],
  ['trackVideo', '--cc-track-video'], ['trackAudioA1', '--cc-track-audio-a1'],
  ['trackAudioA2', '--cc-track-audio-a2'],
  ['clipVideo', '--cc-clip-video'], ['clipAudio', '--cc-clip-audio'],
  ['clipMg', '--cc-clip-mg'], ['clipText', '--cc-clip-text'],
];

function skinToCss(skin: SkinDef): string {
  const vars = VAR_MAP.map(([key, cssVar]) => `  ${cssVar}: ${skin.tokens[key]};`).join('\n');
  return `[data-cc-skin="${skin.id}"] {\n${vars}\n}`;
}

// ── 公共 API ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'honcut.skin';
const STYLE_ID = 'honcut-skins';

/** 启动时调用：注入所有皮肤的 CSS 规则 + 恢复上次选择。 */
export function initSkins(): void {
  // 注入 <style>（石墨是 :root 默认，不需要额外规则）
  const nonDefault = SKINS.filter((s) => s.id !== 'graphite');
  const css = nonDefault.map(skinToCss).join('\n\n');
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;

  // 恢复持久化选择
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && SKINS.some((s) => s.id === saved)) {
    applySkin(saved);
  }
}

/** 切换皮肤：改 <html data-cc-skin> + 持久化。 */
export function applySkin(id: string): void {
  if (id === 'graphite') {
    document.documentElement.removeAttribute('data-cc-skin');
  } else {
    document.documentElement.setAttribute('data-cc-skin', id);
  }
  localStorage.setItem(STORAGE_KEY, id);
}

/** 读取当前皮肤 id。 */
export function getSkin(): string {
  return localStorage.getItem(STORAGE_KEY) ?? 'graphite';
}
