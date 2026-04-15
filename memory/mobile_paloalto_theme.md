---
name: Mobile Palo Alto Theme
description: Mobile UI redesign and Palo Alto theme applied to city filters panel, topbar drawer, FABs, and search bar
type: feature
originSessionId: current
date: 2026-04-13
---

## Overview
Applied "Palo Alto" design system (inspired by BioIntel Explorer at localhost:52167 / kNIHexplorer040526) across the app. The aesthetic features: slate-blue glassmorphic backgrounds, pill-shaped buttons (border-radius: 14-18px), indigo active accents, amber heatmap/gold accents, emerald success states, red danger states, uppercase micro-labels, and backdrop-filter blur throughout.

## Palo Alto CSS Design Tokens
Added to `:root` (dark) and `[data-theme="light"]` in `public/style.css`:
- `--pa-bg` — glassmorphic panel background (dark: `rgba(15,17,23,0.92)`, light: `rgba(255,255,255,0.94)`)
- `--pa-glass` — semi-transparent glass fill (dark: `rgba(30,34,44,0.65)`, light: `rgba(241,245,249,0.75)`)
- `--pa-glass-border` — glass border color (dark: `rgba(71,85,105,0.35)`, light: `rgba(203,213,225,0.5)`)
- `--pa-pill-bg/border` — pill button default (dark: slate-800/50 bg, slate-600/35 border)
- `--pa-pill-active-bg/border/text` — pill active state (dark: indigo-500/25 bg, indigo-500/50 border, #818cf8 text)
- `--pa-pill-hover` — pill hover (dark: `rgba(51,65,85,0.5)`)
- `--pa-section-bg/border` — frosted section dividers
- `--pa-indigo/bg/border` — primary accent (#818cf8 dark, #4f46e5 light)
- `--pa-amber/bg/border` — heatmap/gold accent (#fbbf24 dark, #92400e light)
- `--pa-emerald/bg/border` — success/toggle-on accent (#34d399 dark, #059669 light)
- `--pa-red/bg/border` — danger/reset accent (#f87171 dark, #dc2626 light)

## City Filters Panel (`#filter-panel`) — Completed
All elements restyled with Palo Alto tokens:
- **Panel container**: `var(--pa-bg)` + `backdrop-filter: blur(16px)` + `var(--pa-glass-border)` border
- **Header**: frosted section bg, pill close button (28x28 circle), pill reset button (red accent, uppercase)
- **Section heads**: tight uppercase micro-labels (0.6rem, 0.08em tracking), `pa-section-bg/border`
- **Availability toggle buttons**: pill shape, emerald active state
- **Value filter buckets**: pill shape, indigo active state with glow. AQ buckets use per-color CSS custom properties
- **Heatmap toggle buttons**: pill shape, amber accent
- **Population slider**: indigo/amber gradient track, indigo/amber thumbs with glow, uppercase micro-labels
- **AQ legend**: glassmorphic container, smaller swatches
- **Heat palette chips**: pill shape, indigo active
- **Heat controls**: amber accent slider, uppercase micro labels
- **Footer**: frosted glass strip
- **Census metric select**: pill shape
- **Dot controls section**: `pa-glass-border`, `pa-section-bg`
- Mobile overrides: compact pill shapes (28-32px heights), tighter spacing, same pa-* tokens

## Mobile Topbar & Drawer — Completed
Key fix: Merged mobile layout from `@media (max-width: 768px)` into `@media (max-width: 1024px)`:
- **Hamburger now visible on landscape phones** (tablets 768-1024px also get mobile drawer)
- Old 768px breakpoint now only has `.layer-dot` phone tweak
- **Toggle button**: `var(--pa-glass)` bg + blur(16px), indigo glow when open
- **Topbar drawer**: `var(--pa-bg)` + blur(24px), `pa-glass-border`, max-height 85vh
- **Main toggle buttons** (Cities/Countries/Regions/Economy): pill (18px radius), `pa-pill-*` states, indigo glow active
- **More-layers-btn**: full-width pill, pa-pill-* states
- **Reset-layers-btn**: red accent pill
- **Layer menu buttons**: pill shape, `pa-pill-*` states (hover, active)
- **Dropdown headings**: uppercase micro-labels (0.6rem, 0.08em tracking)
- **Settings row**: basemap select + theme toggle both pill-shaped, pa-pill-* tokens
- **Bottom sheet panels border**: `var(--pa-glass-border)` (updated from `var(--border)`)

## Desktop Elements — Also Updated
- **Topbar**: `var(--pa-bg)` + blur(12px), `pa-glass-border`
- **City search bar**: `var(--pa-glass)` + `pa-glass-border` + border-radius 14px, `pa-indigo-border` focus ring
- **Basemap select**: pill (border-radius 14px), `pa-pill-bg/border`
- **Theme toggle**: pill, `pa-pill-bg/border`
- **FAB buttons**: `var(--pa-glass)` bg + blur(12px) + border-radius 12px
  - FX: amber hover
  - Draw: indigo hover
  - Bookmarks: amber hover  
  - Filter: indigo hover/active
  - Corp: amber hover/active
  - Nations: emerald hover
- **Bottom nav bar**: `var(--pa-bg)` + blur(12px), `pa-glass-border`

## Desktop-only Rules (wrapped in @media min-width:1025px)
- `#more-layers-menu` min-width/max-height (was conflicting with mobile full-width bottom sheet)
- `#more-layers-menu button` compact padding/font (was overriding mobile pill styles)

## Key Files Modified
- `public/style.css` — All CSS changes (tokens, filter panel, topbar, FABs, search)
- No JS changes were needed (class names unchanged, only CSS restyled)
- `src/app-legacy.js` and `public/app.js` — NOT modified (pure CSS changes)

## Reference: BioIntell Explorer (Palo Alto source)
- Project: `C:\Users\kevin\Desktop\kNIHexplorer040526`
- Component: `src/components/search/AdvancedSearchPanel.tsx`
- Key patterns: `bg-slate-800/60 border border-slate-700 rounded-xl`, `px-2.5 py-1 rounded text-[11px]`, `bg-indigo-600 text-white border-indigo-500` (active), `text-[10px] uppercase tracking-wider`, half-transparent bg with border-/40 opacity

## Still To Do (Future Work)
- Apply Palo Alto theme to OTHER panels: wiki sidebar, country panel, corp panel, trade panel, FX sidebar, stats panel, region panel, compare panels, bookmarks, nations
- Apply to modal dialogs (edit city, etc.)
- Apply to custom dropdown components (count-dropdown)
- Apply to toast notifications
- Apply to info chips, weather chips in wiki sidebar
- Test light theme thoroughly (tokens are defined but may need fine-tuning)
- Consider adding `--pa-pill-transition` for consistent transition timing