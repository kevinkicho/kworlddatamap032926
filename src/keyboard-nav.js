import { S } from './state.js';

let _closeCountryCompare = () => {};
let _closeComparePanel = () => {};
let _closeWikiSidebar = () => {};
let _closeCountryPanel = () => {};
let _closeCorpPanel = () => {};
let _closeStatsPanel = () => {};
let _closeTradePanelFn = () => {};
let _toggleFilterPanel = () => {};
let _toggleFxSidebar = () => {};
let _toggleBookmarksPanel = () => {};
let _toggleTheme = () => {};
let _switchWikiTab = () => {};

export function initKeyboardNav(callbacks) {
  _closeCountryCompare = callbacks.closeCountryCompare || _closeCountryCompare;
  _closeComparePanel = callbacks.closeComparePanel || _closeComparePanel;
  _closeWikiSidebar = callbacks.closeWikiSidebar || _closeWikiSidebar;
  _closeCountryPanel = callbacks.closeCountryPanel || _closeCountryPanel;
  _closeCorpPanel = callbacks.closeCorpPanel || _closeCorpPanel;
  _closeStatsPanel = callbacks.closeStatsPanel || _closeStatsPanel;
  _closeTradePanelFn = callbacks.closeTradePanelFn || _closeTradePanelFn;
  _toggleFilterPanel = callbacks.toggleFilterPanel || _toggleFilterPanel;
  _toggleFxSidebar = callbacks.toggleFxSidebar || _toggleFxSidebar;
  _toggleBookmarksPanel = callbacks.toggleBookmarksPanel || _toggleBookmarksPanel;
  _toggleTheme = callbacks.toggleTheme || _toggleTheme;
  _switchWikiTab = callbacks.switchWikiTab || _switchWikiTab;
}

export function setupKeyboardNav() {
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.isComposing) return;

    switch (e.key) {
      case 'Escape': {
        const panels = [
          { el: 'country-compare-panel', close: () => _closeCountryCompare() },
          { el: 'compare-panel', close: () => _closeComparePanel() },
          { el: 'wiki-sidebar', check: 'open', close: () => _closeWikiSidebar() },
          { el: 'country-panel', check: 'open', close: () => _closeCountryPanel() },
          { el: 'corp-panel', check: 'open', close: () => _closeCorpPanel() },
          { el: 'stats-panel', check: 'open', close: () => _closeStatsPanel() },
          { el: 'trade-panel', check: 'open', close: () => _closeTradePanelFn() },
          { el: 'filter-panel', check: 'open', close: () => _toggleFilterPanel() },
          { el: 'fx-sidebar', check: 'open', close: () => _toggleFxSidebar() },
          { el: 'bookmarks-panel', check: 'visible', close: () => _toggleBookmarksPanel() },
        ];
        for (const p of panels) {
          const el = document.getElementById(p.el);
          if (!el) continue;
          if (p.check === 'open' && el.classList.contains('open')) { p.close(); e.preventDefault(); return; }
          if (p.check === 'visible' && el.classList.contains('visible')) { p.close(); e.preventDefault(); return; }
          if (!p.check && el.classList.contains('visible')) { p.close(); e.preventDefault(); return; }
        }
        break;
      }
      case '/':
        e.preventDefault();
        document.getElementById('city-search-input')?.focus();
        break;
      case '?':
        toggleKeyboardHelp();
        break;
      case 't':
        _toggleTheme();
        break;
      case '1': case '2': case '3': case '4': {
        const tabs = ['info', 'overview', 'economy', 'finance'];
        const idx = parseInt(e.key) - 1;
        if (document.getElementById('wiki-sidebar')?.classList.contains('open')) {
          _switchWikiTab(tabs[idx]);
          e.preventDefault();
        }
        break;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        const sel = document.getElementById('choro-select');
        if (sel && S.choroOn) {
          const dir = e.key === 'ArrowLeft' ? -1 : 1;
          const newIdx = Math.max(0, Math.min(sel.options.length - 1, sel.selectedIndex + dir));
          if (newIdx !== sel.selectedIndex) {
            sel.selectedIndex = newIdx;
            sel.dispatchEvent(new Event('change'));
          }
          e.preventDefault();
        }
        break;
      }
    }
  });
}

export function toggleKeyboardHelp() {
  let overlay = document.getElementById('keyboard-help');
  if (overlay) {
    overlay.remove();
    return;
  }
  overlay = document.createElement('div');
  overlay.id = 'keyboard-help';
  overlay.className = 'keyboard-help-overlay';
  overlay.innerHTML = '<div class="keyboard-help-card">'
    + '<h3>Keyboard Shortcuts</h3>'
    + '<div class="kb-row"><kbd>Esc</kbd> Close topmost panel</div>'
    + '<div class="kb-row"><kbd>/</kbd> Focus search</div>'
    + '<div class="kb-row"><kbd>?</kbd> Toggle this help</div>'
    + '<div class="kb-row"><kbd>t</kbd> Toggle dark/light theme</div>'
    + '<div class="kb-row"><kbd>1-4</kbd> Switch sidebar tabs</div>'
    + '<div class="kb-row"><kbd>← →</kbd> Cycle choropleth indicator</div>'
    + '<button onclick="document.getElementById(\'keyboard-help\').remove()">Close</button>'
    + '</div>';
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}