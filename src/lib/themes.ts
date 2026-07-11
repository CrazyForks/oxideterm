// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import { ITheme } from '@xterm/xterm';

// ============================================================================
// Custom Theme Types
// ============================================================================

/** App UI variables that accompany each theme */
export type AppUiColors = {
  // ── Background Layer (背景层级) ──
  bg: string;
  bgPanel: string;
  bgCard: string;
  bgHover: string;
  bgActive: string;
  bgSecondary: string;
  bgElevated: string;
  bgSunken: string;
  // ── Text Layer (文字层级) ──
  text: string;
  textMuted: string;
  textSecondary: string;
  textHeading: string;
  // ── Border Layer (边框层级) ──
  border: string;
  borderStrong: string;
  divider: string;
  // ── Accent Layer (强调色) ──
  accent: string;
  accentHover: string;
  accentText: string;
  accentSecondary: string;
  // ── Semantic Colors (功能色) ──
  success: string;
  warning: string;
  error: string;
  info: string;
  // ── Selection ──
  selection: string;
};

/** A user-created custom theme (terminal colors + app UI colors) */
export type CustomTheme = {
  name: string;            // Display name
  terminalColors: ITheme;  // xterm.js colors
  uiColors: AppUiColors;   // App chrome colors
};

/** localStorage key for custom themes */
const CUSTOM_THEMES_KEY = 'oxide-custom-themes';

// ============================================================================
// Custom Theme Persistence
// ============================================================================

/** Load custom themes from localStorage */
function loadCustomThemes(): Record<string, CustomTheme> {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, CustomTheme>;
  } catch {
    return {};
  }
}

/** Persist custom themes to localStorage */
function saveCustomThemes(ct: Record<string, CustomTheme>): void {
  try {
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(ct));
  } catch (e) {
    console.error('[Themes] Failed to persist custom themes:', e);
  }
}

/** In-memory registry (loaded once, mutated by CRUD helpers) */
let customThemesRegistry: Record<string, CustomTheme> = loadCustomThemes();

// ============================================================================
// Custom Theme CRUD
// ============================================================================

/** Get all custom themes */
export function getCustomThemes(): Record<string, CustomTheme> {
  return customThemesRegistry;
}

/** Save/update a custom theme (id = slug key) */
export function saveCustomTheme(id: string, theme: CustomTheme): void {
  customThemesRegistry = { ...customThemesRegistry, [id]: theme };
  saveCustomThemes(customThemesRegistry);
}

/** Delete a custom theme */
export function deleteCustomTheme(id: string): void {
  const { [id]: _, ...rest } = customThemesRegistry;
  customThemesRegistry = rest;
  saveCustomThemes(customThemesRegistry);
}

/** Check if a theme id belongs to custom themes */
export function isCustomTheme(id: string): boolean {
  return id.startsWith('custom:');
}

// ============================================================================
// Theme Import / Export
// ============================================================================

/** Exported theme file format */
type ExportedTheme = {
  version: 1;
  name: string;
  terminalColors: ITheme;
  uiColors: AppUiColors;
};

/** Export a custom theme as a JSON string */
export function exportTheme(themeId: string): string | null {
  const theme = customThemesRegistry[themeId];
  if (!theme) return null;
  const exported: ExportedTheme = {
    version: 1,
    name: theme.name,
    terminalColors: theme.terminalColors,
    uiColors: theme.uiColors,
  };
  return JSON.stringify(exported, null, 2);
}

/** Import a theme from a JSON string. Returns the new theme id, or throws on invalid input. */
export function importTheme(jsonString: string): { id: string; theme: CustomTheme } {
  const parsed = JSON.parse(jsonString);

  // Validate required fields
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid theme file');
  if (!parsed.name || typeof parsed.name !== 'string') throw new Error('Missing theme name');
  if (!parsed.terminalColors || typeof parsed.terminalColors !== 'object') throw new Error('Missing terminalColors');
  if (!parsed.uiColors || typeof parsed.uiColors !== 'object') throw new Error('Missing uiColors');

  const theme: CustomTheme = {
    name: parsed.name,
    terminalColors: parsed.terminalColors as ITheme,
    uiColors: parsed.uiColors as AppUiColors,
  };

  // Generate unique id
  const slug = parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const id = `custom:${slug}-${Date.now()}`;

  saveCustomTheme(id, theme);
  return { id, theme };
}

// ============================================================================
// Unified Theme Resolution
// ============================================================================

/** Get the terminal ITheme for any theme (built-in or custom) */
export function getTerminalTheme(themeId: string): ITheme {
  if (isCustomTheme(themeId)) {
    const ct = customThemesRegistry[themeId];
    if (ct) return ct.terminalColors;
  }
  return themes[themeId] || themes.default;
}

/** Get the AppUiColors for a custom theme (returns null for built-in themes) */
export function getCustomUiColors(themeId: string): AppUiColors | null {
  if (isCustomTheme(themeId)) {
    const ct = customThemesRegistry[themeId];
    if (ct) return ct.uiColors;
  }
  return null;
}

/** Get all theme names: built-in + custom  */
export function getAllThemeNames(): string[] {
  return [...Object.keys(themes), ...Object.keys(customThemesRegistry)];
}

/**
 * Derive AppUiColors from an ITheme's terminal colors.
 * Used as default when creating a new custom theme from a built-in base.
 */
export function deriveUiColorsFromTerminal(t: ITheme): AppUiColors {
  const bg = (t.background as string) || '#09090b';
  const fg = (t.foreground as string) || '#f4f4f5';
  const cursor = (t.cursor as string) || '#ea580c';
  const muted = (t.brightBlack as string) || '#a1a1aa';

  // Lighten/darken helper
  const shift = (hex: string, amount: number): string => {
    const clamp = (v: number) => Math.max(0, Math.min(255, v));
    const r = clamp(parseInt(hex.slice(1, 3), 16) + amount);
    const g = clamp(parseInt(hex.slice(3, 5), 16) + amount);
    const b = clamp(parseInt(hex.slice(5, 7), 16) + amount);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  // Mix two hex colors
  const mix = (c1: string, c2: string, ratio = 0.5): string => {
    const r = Math.round(parseInt(c1.slice(1, 3), 16) * ratio + parseInt(c2.slice(1, 3), 16) * (1 - ratio));
    const g = Math.round(parseInt(c1.slice(3, 5), 16) * ratio + parseInt(c2.slice(3, 5), 16) * (1 - ratio));
    const b = Math.round(parseInt(c1.slice(5, 7), 16) * ratio + parseInt(c2.slice(5, 7), 16) * (1 - ratio));
    return `#${Math.min(255,r).toString(16).padStart(2, '0')}${Math.min(255,g).toString(16).padStart(2, '0')}${Math.min(255,b).toString(16).padStart(2, '0')}`;
  };

  return {
    // Background
    bg,
    bgPanel: shift(bg, 15),
    bgCard: shift(bg, 20),
    bgHover: shift(bg, 30),
    bgActive: shift(bg, 40),
    bgSecondary: shift(bg, 10),
    bgElevated: shift(bg, 22),
    bgSunken: shift(bg, -10),
    // Text
    text: fg,
    textMuted: muted,
    textSecondary: mix(fg, muted, 0.5),
    textHeading: shift(fg, 8),
    // Border
    border: shift(bg, 30),
    borderStrong: mix(cursor, fg, 0.6),
    divider: shift(bg, 20),
    // Accent
    accent: cursor,
    accentHover: shift(cursor, -20),
    accentText: mix(cursor, bg, 0.7),
    accentSecondary: muted,
    // Semantic
    success: (t.green as string) || '#22c55e',
    warning: (t.yellow as string) || '#eab308',
    error: (t.red as string) || '#ef4444',
    info: (t.blue as string) || '#3b82f6',
    // Selection
    selection: `rgba(${parseInt(cursor.slice(1, 3), 16)}, ${parseInt(cursor.slice(3, 5), 16)}, ${parseInt(cursor.slice(5, 7), 16)}, 0.25)`,
  };
}

/** All CSS custom properties mapped from AppUiColors */
const UI_CSS_PROPS: [keyof AppUiColors, string][] = [
  // Background
  ['bg', '--theme-bg'],
  ['bgPanel', '--theme-bg-panel'],
  ['bgCard', '--theme-bg-card'],
  ['bgHover', '--theme-bg-hover'],
  ['bgActive', '--theme-bg-active'],
  ['bgSecondary', '--theme-bg-secondary'],
  ['bgElevated', '--theme-bg-elevated'],
  ['bgSunken', '--theme-bg-sunken'],
  // Text
  ['text', '--theme-text'],
  ['textMuted', '--theme-text-muted'],
  ['textSecondary', '--theme-text-secondary'],
  ['textHeading', '--theme-text-heading'],
  // Border
  ['border', '--theme-border'],
  ['borderStrong', '--theme-border-strong'],
  ['divider', '--theme-divider'],
  // Accent
  ['accent', '--theme-accent'],
  ['accentHover', '--theme-accent-hover'],
  ['accentText', '--theme-accent-text'],
  ['accentSecondary', '--theme-accent-secondary'],
  // Semantic
  ['success', '--theme-success'],
  ['warning', '--theme-warning'],
  ['error', '--theme-error'],
  ['info', '--theme-info'],
  // Selection
  ['selection', '--theme-selection'],
];

/**
 * Apply custom theme CSS variables to the document.
 * For custom themes, we inject CSS variables dynamically.
 */
export function applyCustomThemeCSS(themeId: string): void {
  const uiColors = getCustomUiColors(themeId);
  if (!uiColors) return;
  
  const root = document.documentElement;
  for (const [key, prop] of UI_CSS_PROPS) {
    if (uiColors[key]) {
      root.style.setProperty(prop, uiColors[key]);
    }
  }
}

/** Clear any inline custom theme CSS variables */
export function clearCustomThemeCSS(): void {
  const root = document.documentElement;
  for (const [, prop] of UI_CSS_PROPS) {
    root.style.removeProperty(prop);
  }
}

/** Resolve the complete UI palette rendered for a built-in or custom theme. */
export function getThemeUiColors(themeId: string): AppUiColors {
  const custom = getCustomUiColors(themeId);
  if (custom) return { ...custom };

  const fallback = deriveUiColorsFromTerminal(getTerminalTheme(themeId));
  if (typeof document === 'undefined') return fallback;

  // Built-in UI colors live in CSS. Sample the root synchronously so theme
  // duplication preserves explicit overrides instead of re-deriving them.
  const root = document.documentElement;
  const previousTheme = root.getAttribute('data-theme');
  const previousInlineValues = UI_CSS_PROPS.map(([, property]) => root.style.getPropertyValue(property));
  for (const [, property] of UI_CSS_PROPS) root.style.removeProperty(property);
  root.setAttribute('data-theme', themeId === 'default' ? 'neutral' : themeId);

  const computed = getComputedStyle(root);
  const resolved = { ...fallback };
  for (const [key, property] of UI_CSS_PROPS) {
    const value = computed.getPropertyValue(property).trim();
    if (value) resolved[key] = value;
  }

  if (previousTheme === null) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', previousTheme);
  for (const [[, property], value] of UI_CSS_PROPS.map((entry, index) => [entry, previousInlineValues[index]] as const)) {
    if (value) root.style.setProperty(property, value);
    else root.style.removeProperty(property);
  }
  return resolved;
}

// ============================================================================
// Built-in Themes
// ============================================================================

export const themes: Record<string, ITheme> = {
  default: {
    background: '#09090b', // Neutral deep void
    foreground: '#f4f4f5', // Neutral text
    cursor: '#ea580c',     // Orange cursor
    selectionBackground: 'rgba(234, 88, 12, 0.3)',
    black: '#09090b',
    red: '#ef4444',
    green: '#22c55e',
    yellow: '#eab308',
    blue: '#3b82f6',
    magenta: '#d946ef',
    cyan: '#06b6d4',
    white: '#f4f4f5',
    brightBlack: '#71717a',
    brightRed: '#f87171',
    brightGreen: '#4ade80',
    brightYellow: '#facc15',
    brightBlue: '#60a5fa',
    brightMagenta: '#e879f9',
    brightCyan: '#22d3ee',
    brightWhite: '#ffffff',
  },
  oxide: {
    background: '#1d1410', // Dark iron-oxide ground
    foreground: '#ded4cc', // Low-chroma warm text
    cursor: '#c9683b',     // Fired rust accent
    selectionBackground: 'rgba(201, 104, 59, 0.28)',
    black: '#1d1410',
    red: '#c76355',
    green: '#7f9a72',
    yellow: '#c29a5b',
    blue: '#6f8fa5',
    magenta: '#9b7893',
    cyan: '#669a98',
    white: '#ded4cc',
    brightBlack: '#705b50',
    brightRed: '#df7b68',
    brightGreen: '#99b58a',
    brightYellow: '#d9b36e',
    brightBlue: '#89a9bd',
    brightMagenta: '#b594ac',
    brightCyan: '#80b4b1',
    brightWhite: '#f4ece6',
  },
  dracula: {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#bd93f9', // Using dracula purple for cursor
    selectionBackground: '#44475a',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#8be9fd',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
  },
  nord: {
    background: '#2e3440',
    foreground: '#d8dee9',
    cursor: '#88c0d0',
    selectionBackground: '#4c566a',
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#4c566a',
    brightRed: '#bf616a',
    brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1',
    brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb',
    brightWhite: '#eceff4',
  },
  'solarized-dark': {
    background: '#002b36',
    foreground: '#839496',
    cursor: '#93a1a1',
    selectionBackground: '#073642',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#002b36',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3',
  },
  'one-dark': {
    background: '#282c34',
    foreground: '#abb2bf',
    cursor: '#528bff',
    selectionBackground: '#3e4451',
    black: '#282c34',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#abb2bf',
    brightBlack: '#5c6370',
    brightRed: '#e06c75',
    brightGreen: '#98c379',
    brightYellow: '#e5c07b',
    brightBlue: '#61afef',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#ffffff',
  },
  monokai: {
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f8f8f0',
    selectionBackground: '#49483e',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#f4bf75',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2',
    brightBlack: '#75715e',
    brightRed: '#f92672',
    brightGreen: '#a6e22e',
    brightYellow: '#f4bf75',
    brightBlue: '#66d9ef',
    brightMagenta: '#ae81ff',
    brightCyan: '#a1efe4',
    brightWhite: '#f9f8f5',
  },
  'catppuccin-mocha': {
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    selectionBackground: '#585b70',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#f5c2e7',
    cyan: '#94e2d5',
    white: '#bac2de',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5',
    brightWhite: '#a6adc8',
  },

  'github-dark': {
    background: '#0d1117',
    foreground: '#c9d1d9',
    cursor: '#58a6ff',
    selectionBackground: 'rgba(56, 139, 253, 0.4)',
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#f0f6fc',
  },
  verdigris: {
    background: '#10201d',
    foreground: '#cedbd6',
    cursor: '#55a996',
    selectionBackground: 'rgba(85, 169, 150, 0.28)',
    black: '#10201d',
    red: '#c66b67',
    green: '#65a889',
    yellow: '#b99b62',
    blue: '#688fa1',
    magenta: '#927b9b',
    cyan: '#5ba89f',
    white: '#cedbd6',
    brightBlack: '#49645d',
    brightRed: '#df817b',
    brightGreen: '#7fc3a3',
    brightYellow: '#d1b477',
    brightBlue: '#82a9ba',
    brightMagenta: '#ac95b4',
    brightCyan: '#75c2b8',
    brightWhite: '#edf4f1',
  },
  'silver-oxide': {
    background: '#191a1b',
    foreground: '#d4d5d2',
    cursor: '#a8aaa7',
    selectionBackground: 'rgba(168, 170, 167, 0.25)',
    black: '#191a1b',
    red: '#ad7472',
    green: '#80977e',
    yellow: '#a79768',
    blue: '#748da2',
    magenta: '#927f98',
    cyan: '#75989b',
    white: '#d4d5d2',
    brightBlack: '#5a5d5d',
    brightRed: '#c98a87',
    brightGreen: '#98af95',
    brightYellow: '#c0af7d',
    brightBlue: '#8da6ba',
    brightMagenta: '#aa97b0',
    brightCyan: '#8eafb2',
    brightWhite: '#f1f2ef',
  },
  cuprite: {
    background: '#211313',
    foreground: '#dfd0cc',
    cursor: '#b94f45',
    selectionBackground: 'rgba(185, 79, 69, 0.28)',
    black: '#211313',
    red: '#bc574f',
    green: '#82906b',
    yellow: '#bd955e',
    blue: '#768b9b',
    magenta: '#9e6f78',
    cyan: '#739495',
    white: '#dfd0cc',
    brightBlack: '#704d49',
    brightRed: '#d66d62',
    brightGreen: '#9aa581',
    brightYellow: '#d4ad72',
    brightBlue: '#8da3b3',
    brightMagenta: '#b6878f',
    brightCyan: '#8babad',
    brightWhite: '#f6ebe7',
  },
  'chromium-oxide': {
    background: '#111b13',
    foreground: '#d0dacf',
    cursor: '#5f9d63',
    selectionBackground: 'rgba(95, 157, 99, 0.28)',
    black: '#111b13',
    red: '#bd6962',
    green: '#679c68',
    yellow: '#aaa05e',
    blue: '#6e8fa3',
    magenta: '#8d7b98',
    cyan: '#629895',
    white: '#d0dacf',
    brightBlack: '#4c604d',
    brightRed: '#d57f76',
    brightGreen: '#80b57f',
    brightYellow: '#c2b874',
    brightBlue: '#87a8bb',
    brightMagenta: '#a694b0',
    brightCyan: '#7bb1ad',
    brightWhite: '#edf3ec',
  },
  'paper-oxide': {
    background: '#f1ede3', // Warm oxidized paper
    foreground: '#393734', // Ink-like neutral text
    cursor: '#8f6251',     // Copper-brown accent
    selectionBackground: 'rgba(143, 98, 81, 0.20)',
    black: '#393734',
    red: '#a94f46',
    green: '#5f7f5c',
    yellow: '#9a792f',
    blue: '#4f718d',
    magenta: '#785b79',
    cyan: '#4f7d7a',
    white: '#e7e1d6',
    brightBlack: '#77716a',
    brightRed: '#c56559',
    brightGreen: '#76966f',
    brightYellow: '#b28f45',
    brightBlue: '#6688a3',
    brightMagenta: '#916f91',
    brightCyan: '#669692',
    brightWhite: '#fffdf8',
  },
  magnetite: {
    background: '#17191a',
    foreground: '#d3d7d6',
    cursor: '#789098',
    selectionBackground: 'rgba(120, 144, 152, 0.27)',
    black: '#17191a',
    red: '#b86662',
    green: '#749176',
    yellow: '#a58c5c',
    blue: '#6f889b',
    magenta: '#89778f',
    cyan: '#6c9092',
    white: '#d3d7d6',
    brightBlack: '#53595b',
    brightRed: '#d07d77',
    brightGreen: '#8ba98d',
    brightYellow: '#bda471',
    brightBlue: '#879fb1',
    brightMagenta: '#a08fa6',
    brightCyan: '#84a8aa',
    brightWhite: '#eff2f1',
  },
  cobalt: {
    background: '#101825', // Deep cobalt glass
    foreground: '#d2d9e2',
    cursor: '#4f79b8',
    selectionBackground: 'rgba(79, 121, 184, 0.28)',
    black: '#101825',
    red: '#bf6b6c',
    green: '#729478',
    yellow: '#aa935f',
    blue: '#527bb6',
    magenta: '#81779f',
    cyan: '#5f8f9e',
    white: '#d2d9e2',
    brightBlack: '#4b5b70',
    brightRed: '#d68181',
    brightGreen: '#89ad8e',
    brightYellow: '#c2aa75',
    brightBlue: '#6d95d0',
    brightMagenta: '#998fb7',
    brightCyan: '#77a8b7',
    brightWhite: '#eef2f6',
  },
  ochre: {
    background: '#1d1811',
    foreground: '#ddd5c7', // Neutral clay-warm text
    cursor: '#bd7b32',     // Earth-pigment accent
    selectionBackground: 'rgba(189, 123, 50, 0.28)',
    black: '#1d1811',
    red: '#b96155',
    green: '#7f8e63',
    yellow: '#b78a38',
    blue: '#6c8496',
    magenta: '#8f7182',
    cyan: '#698d88',
    white: '#ddd5c7',
    brightBlack: '#66594a',
    brightRed: '#d07869',
    brightGreen: '#98a77a',
    brightYellow: '#d09f4b',
    brightBlue: '#849bad',
    brightMagenta: '#a88999',
    brightCyan: '#81a6a0',
    brightWhite: '#f4ede2',
  },
  'tokyo-night': {
    background: '#1a1b26',
    foreground: '#c0caf5',
    cursor: '#c0caf5',
    selectionBackground: '#515c7e',
    black: '#15161e',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#7dcfff',
    white: '#a9b1d6',
    brightBlack: '#414868',
    brightRed: '#f7768e',
    brightGreen: '#9ece6a',
    brightYellow: '#e0af68',
    brightBlue: '#7aa2f7',
    brightMagenta: '#bb9af7',
    brightCyan: '#7dcfff',
    brightWhite: '#c0caf5',
  },
  'gruvbox-dark': {
    background: '#282828',
    foreground: '#ebdbb2',
    cursor: '#ebdbb2',
    selectionBackground: '#665c54',
    black: '#282828',
    red: '#cc241d',
    green: '#98971a',
    yellow: '#d79921',
    blue: '#458588',
    magenta: '#b16286',
    cyan: '#689d6a',
    white: '#a89984',
    brightBlack: '#928374',
    brightRed: '#fb4934',
    brightGreen: '#b8bb26',
    brightYellow: '#fabd2f',
    brightBlue: '#83a598',
    brightMagenta: '#d3869b',
    brightCyan: '#8ec07c',
    brightWhite: '#ebdbb2',
  },
  'rose-pine': {
    background: '#191724',
    foreground: '#e0def4',
    cursor: '#524f67',
    selectionBackground: '#403d52',
    black: '#26233a',
    red: '#eb6f92',
    green: '#31748f',
    yellow: '#f6c177',
    blue: '#9ccfd8',
    magenta: '#c4a7e7',
    cyan: '#ebbcba',
    white: '#e0def4',
    brightBlack: '#6e6a86',
    brightRed: '#eb6f92',
    brightGreen: '#31748f',
    brightYellow: '#f6c177',
    brightBlue: '#9ccfd8',
    brightMagenta: '#c4a7e7',
    brightCyan: '#ebbcba',
    brightWhite: '#524f67',
  },
  kanagawa: {
    background: '#1F1F28',
    foreground: '#DCD7BA',
    cursor: '#C8C093',
    selectionBackground: '#2D4F67',
    black: '#090618',
    red: '#C34043',
    green: '#76946A',
    yellow: '#C0A36E',
    blue: '#7E9CD8',
    magenta: '#957FB8',
    cyan: '#6A9589',
    white: '#C8C093',
    brightBlack: '#727169',
    brightRed: '#E82424',
    brightGreen: '#98BB6C',
    brightYellow: '#E6C384',
    brightBlue: '#7FB4CA',
    brightMagenta: '#938AA9',
    brightCyan: '#7AA89F',
    brightWhite: '#DCD7BA',
  },
  'synthwave-84': {
    background: '#2b213a',
    foreground: '#ffffff',
    cursor: '#f97e72', // Radish
    selectionBackground: '#5c4f75',
    black: '#2b213a',
    red: '#fe4450', // Neon Red
    green: '#72f1b8', // Neon Green
    yellow: '#fede5d', // Neon Yellow
    blue: '#03edf9', // Neon Cyan/Blue
    magenta: '#ff7edb', // Neon Pink
    cyan: '#03edf9', // Same as blue for synthwave vibe
    white: '#ffffff',
    brightBlack: '#6b5e87', // Muted purple
    brightRed: '#fe4450',
    brightGreen: '#72f1b8',
    brightYellow: '#fede5d',
    brightBlue: '#36f9f6', // Bright Cyan
    brightMagenta: '#ff7edb',
    brightCyan: '#36f9f6',
    brightWhite: '#ffffff', // Pure White (Glow)
  },
  azurite: {
    background: '#0c1926', // Deep azurite matrix
    foreground: '#d0d9e0',
    cursor: '#3977a8',
    selectionBackground: 'rgba(57, 119, 168, 0.28)',
    black: '#0c1926',
    red: '#be6966',
    green: '#71927b',
    yellow: '#aa915d',
    blue: '#3977a8',
    magenta: '#80779b',
    cyan: '#4d8c9b',
    white: '#d0d9e0',
    brightBlack: '#455d70',
    brightRed: '#d57f7a',
    brightGreen: '#88aa91',
    brightYellow: '#c1a873',
    brightBlue: '#5591c1',
    brightMagenta: '#988fb3',
    brightCyan: '#66a5b4',
    brightWhite: '#edf2f5',
  },
  malachite: {
    background: '#102019', // Banded mineral green
    foreground: '#d2ddd7',
    cursor: '#4f9b73',
    selectionBackground: 'rgba(79, 155, 115, 0.28)',
    black: '#102019',
    red: '#bf6963',
    green: '#559772',
    yellow: '#aa945d',
    blue: '#698b9e',
    magenta: '#877799',
    cyan: '#57928c',
    white: '#d2ddd7',
    brightBlack: '#486458',
    brightRed: '#d67f78',
    brightGreen: '#6fb18a',
    brightYellow: '#c1ab72',
    brightBlue: '#82a4b6',
    brightMagenta: '#9f8fb1',
    brightCyan: '#70aba4',
    brightWhite: '#edf4f0',
  },
  hematite: {
    background: '#1b191a', // Steel-grey hematite body
    foreground: '#d7d2d2',
    cursor: '#a54f4c',
    selectionBackground: 'rgba(165, 79, 76, 0.28)',
    black: '#1b191a',
    red: '#b55753',
    green: '#778f72',
    yellow: '#a58d5f',
    blue: '#71889b',
    magenta: '#8d7589',
    cyan: '#6c8f91',
    white: '#d7d2d2',
    brightBlack: '#5f5759',
    brightRed: '#ce6e69',
    brightGreen: '#8fa789',
    brightYellow: '#bda475',
    brightBlue: '#89a0b2',
    brightMagenta: '#a58da0',
    brightCyan: '#84a7a8',
    brightWhite: '#f2eeee',
  },
  bismuth: {
    background: '#18151d', // Dark iridescent metal base
    foreground: '#d9d4dc',
    cursor: '#a3679f',
    selectionBackground: 'rgba(163, 103, 159, 0.28)',
    black: '#18151d',
    red: '#ba666f',
    green: '#72917c',
    yellow: '#ad925f',
    blue: '#667fa6',
    magenta: '#9b6999',
    cyan: '#5e9297',
    white: '#d9d4dc',
    brightBlack: '#5c5265',
    brightRed: '#d17c84',
    brightGreen: '#89a992',
    brightYellow: '#c5aa75',
    brightBlue: '#7f98bf',
    brightMagenta: '#b481b1',
    brightCyan: '#77aaaf',
    brightWhite: '#f2eef4',
  },
  'fairy-floss': {
    background: '#5a5475', // Purple haze
    foreground: '#f8f8f2',
    cursor: '#ffb86c',
    selectionBackground: '#8076aa',
    black: '#463c57',
    red: '#ff857f',
    green: '#8cfccf', // Mint
    yellow: '#e6c000',
    blue: '#c5a3ff',
    magenta: '#ff857f', // Pinkish
    cyan: '#c2ffdf',
    white: '#f8f8f0',
    brightBlack: '#605770',
    brightRed: '#ffb8d9', // Hot Pink
    brightGreen: '#8cfccf',
    brightYellow: '#e6c000',
    brightBlue: '#c5a3ff',
    brightMagenta: '#ffb8d9',
    brightCyan: '#c2ffdf',
    brightWhite: '#f8f8f0',
  },
  sakura: {
    background: '#2c242a', // Dark warm grey/pink
    foreground: '#e6d2d9',
    cursor: '#ff79c6',     // Bright pink
    selectionBackground: '#5c434f',
    black: '#3f3238',
    red: '#f55d7a', // Sakura Red
    green: '#9ece6a',
    yellow: '#f9f871',
    blue: '#82aaff',
    magenta: '#ff79c6', // Pink
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#5c434f',
    brightRed: '#ff5555',
    brightGreen: '#50fa7b',
    brightYellow: '#f1fa8c',
    brightBlue: '#6272a4',
    brightMagenta: '#ff92df',
    brightCyan: '#8be9fd',
    brightWhite: '#ffffff',
  },
  'hot-pink': {
    background: '#efdfe5', // Softer/Darker pink for comfort
    foreground: '#8a3a5b', // Readable maroon/pink
    cursor: '#e60073',     // Hot pink
    selectionBackground: 'rgba(230, 0, 115, 0.2)',
    black: '#efdfe5',
    red: '#d00055',
    green: '#00aa55',
    yellow: '#bfa000',
    blue: '#0066cc',
    magenta: '#cc00aa',
    cyan: '#0099aa',
    white: '#8a3a5b',
    brightBlack: '#a05070',
    brightRed: '#ff3388',
    brightGreen: '#33cc88',
    brightYellow: '#dcb000',
    brightBlue: '#3399ff',
    brightMagenta: '#ff66cc',
    brightCyan: '#33ccdd',
    brightWhite: '#401020',
  },
  // ── Spring Rice Theme ──────────────────────────────────────
  // White·Gold·Blue gradient with spring yellow-green as visual center
  // Indigo #191978 / Navy #1e2350 / Sky blue #8ca0b4 / Wheat gold #b49b64 / Spring yellow #dcde78
  'spring-rice': {
    background: '#e8ead0',     // 春日秧田（青黄底）
    foreground: '#1e2350',     // 深藏蓝
    cursor: '#dcde78',         // 春芽黄
    selectionBackground: 'rgba(25, 25, 120, 0.15)', // 靛蓝选区
    black: '#1e2350',          // 深藏蓝
    red: '#a05a3e',            // 深赭
    green: '#3a7a5e',          // 深秧青
    yellow: '#8a8520',         // 深麦黄
    blue: '#191978',           // 深靛蓝
    magenta: '#4a4d8a',        // 深靛紫
    cyan: '#3a6a72',           // 深土青
    white: '#4a6a5a',          // 土青
    brightBlack: '#3a4080',    // 靛灰
    brightRed: '#b86a4a',      // 赭红
    brightGreen: '#4a8a6a',    // 秧苗青
    brightYellow: '#9a9030',   // 麦黄
    brightBlue: '#4a5098',     // 亮靛蓝
    brightMagenta: '#5a5aa0',  // 靛紫
    brightCyan: '#4a7a85',     // 土青
    brightWhite: '#5a7a6a',    // 深土青
  },
  'spring-green': {
    background: '#e2f5e9', // Warmer/Softer Mint
    foreground: '#1a4d33', // Softer Dark Green
    cursor: '#16a34a',     // Vivid Green
    selectionBackground: 'rgba(22, 163, 74, 0.2)',
    black: '#e2f5e9',
    red: '#dc2626',
    green: '#15803d',
    yellow: '#b45309',
    blue: '#2563eb',
    magenta: '#7c3aed',
    cyan: '#0891b2',
    white: '#1a4d33',
    brightBlack: '#a3d9b5',
    brightRed: '#ef4444',
    brightGreen: '#22c55e',
    brightYellow: '#f59e0b',
    brightBlue: '#3b82f6',
    brightMagenta: '#8b5cf6',
    brightCyan: '#06b6d4',
    brightWhite: '#052e16',
  },
};
