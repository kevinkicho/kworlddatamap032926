#!/usr/bin/env node
/**
 * Replace hardcoded hex colors in style.css with CSS custom properties.
 * Also prepends the variable definitions for dark/light themes.
 */
const fs = require('fs');
const path = require('path');

const CSS_PATH = path.join(__dirname, '..', 'public', 'style.css');
let css = fs.readFileSync(CSS_PATH, 'utf8');

// Color → variable name mapping (dark theme values)
const COLOR_MAP = {
  '#0d1117': 'var(--bg-deep)',
  '#161b22': 'var(--bg-primary)',
  '#21262d': 'var(--bg-elevated)',
  '#30363d': 'var(--border)',
  '#374151': 'var(--border-strong)',
  '#484f58': 'var(--text-muted)',
  '#6e7681': 'var(--text-faint)',
  '#8b949e': 'var(--text-secondary)',
  '#c9d1d9': 'var(--text-body)',
  '#e6edf3': 'var(--text-primary)',
  '#58a6ff': 'var(--accent)',
  '#f9fafb': 'var(--text-bright)',
  '#1f2937': 'var(--bg-tooltip)',
};

// rgba patterns to replace
const RGBA_MAP = {
  'rgba(0,0,0,0.5)': 'var(--shadow-md)',
  'rgba(0,0,0,0.6)': 'var(--shadow-lg)',
  'rgba(0,0,0,0.4)': 'var(--shadow-sm)',
  'rgba(0,0,0,0.7)': 'var(--shadow-xl)',
  'rgba(13,17,23,0.55)': 'var(--bg-attribution)',
  'rgba(255,255,255,0.03)': 'var(--hover-overlay)',
  'rgba(88,166,255,0.04)': 'var(--accent-glow)',
  'rgba(88,166,255,0.08)': 'var(--accent-subtle)',
  'rgba(88,166,255,0.15)': 'var(--accent-muted)',
};

// Variable definitions for both themes
const THEME_VARS = `/* ── Theme variables ───────────────────────────────────────────────────────── */
:root, [data-theme="dark"] {
  color-scheme: dark;
  --bg-deep: #0d1117;
  --bg-primary: #161b22;
  --bg-elevated: #21262d;
  --bg-tooltip: #1f2937;
  --bg-attribution: rgba(13,17,23,0.55);
  --border: #30363d;
  --border-strong: #374151;
  --text-muted: #484f58;
  --text-faint: #6e7681;
  --text-secondary: #8b949e;
  --text-body: #c9d1d9;
  --text-primary: #e6edf3;
  --text-bright: #f9fafb;
  --accent: #58a6ff;
  --accent-hover: #79c0ff;
  --accent-glow: rgba(88,166,255,0.04);
  --accent-subtle: rgba(88,166,255,0.08);
  --accent-muted: rgba(88,166,255,0.15);
  --hover-overlay: rgba(255,255,255,0.03);
  --shadow-sm: rgba(0,0,0,0.4);
  --shadow-md: rgba(0,0,0,0.5);
  --shadow-lg: rgba(0,0,0,0.6);
  --shadow-xl: rgba(0,0,0,0.7);
  --scrollbar-thumb: #30363d;
  --scrollbar-track: #0d1117;
}
[data-theme="light"] {
  color-scheme: light;
  --bg-deep: #ffffff;
  --bg-primary: #f6f8fa;
  --bg-elevated: #eaeef2;
  --bg-tooltip: #ffffff;
  --bg-attribution: rgba(255,255,255,0.75);
  --border: #d0d7de;
  --border-strong: #afb8c1;
  --text-muted: #8c959f;
  --text-faint: #6e7781;
  --text-secondary: #57606a;
  --text-body: #1f2328;
  --text-primary: #1f2328;
  --text-bright: #1f2328;
  --accent: #0969da;
  --accent-hover: #0550ae;
  --accent-glow: rgba(9,105,218,0.04);
  --accent-subtle: rgba(9,105,218,0.08);
  --accent-muted: rgba(9,105,218,0.15);
  --hover-overlay: rgba(0,0,0,0.03);
  --shadow-sm: rgba(0,0,0,0.12);
  --shadow-md: rgba(0,0,0,0.15);
  --shadow-lg: rgba(0,0,0,0.2);
  --shadow-xl: rgba(0,0,0,0.25);
  --scrollbar-thumb: #afb8c1;
  --scrollbar-track: #f6f8fa;
}
`;

// Replace the first line (:root { color-scheme: dark; }) with theme vars
css = css.replace(':root { color-scheme: dark; }', THEME_VARS);

// Replace hex colors
let replaceCount = 0;
for (const [hex, varRef] of Object.entries(COLOR_MAP)) {
  const re = new RegExp(hex.replace('#', '#'), 'gi');
  const matches = css.match(re);
  if (matches) {
    replaceCount += matches.length;
    css = css.replace(re, varRef);
  }
}

// Replace rgba patterns (need exact match)
for (const [rgba, varRef] of Object.entries(RGBA_MAP)) {
  const escaped = rgba.replace(/[().,]/g, '\\$&');
  const re = new RegExp(escaped, 'g');
  const matches = css.match(re);
  if (matches) {
    replaceCount += matches.length;
    css = css.replace(re, varRef);
  }
}

// Replace scrollbar colors
css = css.replace(
  /scrollbar-color:\s*var\(--border\)\s*var\(--bg-deep\)/g,
  'scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track)'
);

fs.writeFileSync(CSS_PATH, css, 'utf8');
console.log('Replaced ' + replaceCount + ' color references with CSS variables');
console.log('Written: ' + CSS_PATH);
