// ── Reusable interactive canvas chart (_IYChart) ─────────────────────────────
// points : [{t, v}]  where t = unix timestamp (isTimestamp=true) or year integer
// opts   : { color, height, isTimestamp, autoColor, yFmt, xFmt,
//            showXLabels, showYLabels, ranges:[{label,days}], defaultDays }
// Returns { draw, destroy } — call destroy() to release the ResizeObserver.
export function IYChart(containerEl, points, opts = {}) {
  const {
    color       = '#58a6ff',
    height      = 80,
    isTimestamp = true,
    autoColor   = true,
    yFmt        = v => v.toLocaleString(),
    xFmt        = isTimestamp
      ? t => new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      : t => String(t),
    showXLabels = false,
    showYLabels = false,
    ranges      = null,
    defaultDays = 0,
  } = opts;

  containerEl.innerHTML = '';
  containerEl.style.userSelect = 'none';
  let activeDays = defaultDays;
  let btnRow = null;

  if (ranges?.length) {
    btnRow = document.createElement('div');
    btnRow.className = 'iyc-range-row';
    ranges.forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'iyc-range' + (r.days === activeDays ? ' active' : '');
      btn.textContent = r.label;
      btn.dataset.days = r.days;
      btn.onclick = () => {
        activeDays = r.days;
        btnRow.querySelectorAll('.iyc-range').forEach(b =>
          b.classList.toggle('active', +b.dataset.days === activeDays)
        );
        draw();
      };
      btnRow.appendChild(btn);
    });
    containerEl.appendChild(btnRow);
  }

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;overflow:hidden';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `width:100%;height:${height}px;display:block;cursor:crosshair`;
  const tt = document.createElement('div');
  tt.className = 'iyc-tooltip';
  tt.style.display = 'none';
  wrap.appendChild(canvas);
  wrap.appendChild(tt);
  containerEl.appendChild(wrap);

  const DPR = window.devicePixelRatio || 1;
  let _L = null;

  function getVisible() {
    if (!activeDays) return points;
    if (isTimestamp) {
      const last = points[points.length - 1]?.t || 0;
      return points.filter(p => p.t >= last - activeDays * 86400);
    }
    return points.slice(-Math.max(2, Math.round(activeDays / 365)));
  }

  function draw() {
    const W = wrap.offsetWidth || containerEl.offsetWidth || 280;
    const H = height;
    canvas.width  = W * DPR;
    canvas.height = H * DPR;

    const vis = getVisible();
    if (vis.length < 2) { _L = null; return; }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const PT = 6 * DPR, PB = (showXLabels ? 16 : 4) * DPR;
    const PL = 2 * DPR, PR = (showYLabels ? 48 : 2) * DPR;
    const pW = canvas.width - PL - PR, pH = canvas.height - PT - PB;

    const tMin = vis[0].t, tMax = vis[vis.length - 1].t;
    const vals  = vis.map(p => p.v);
    const vMin  = Math.min(...vals), vMax = Math.max(...vals);
    const vPad  = (vMax - vMin) * 0.1 || Math.abs(vMax) * 0.05 || 1;
    const vLo   = vMin - vPad, vHi = vMax + vPad;

    const xOf = t => PL + (tMax === tMin ? pW / 2 : (t - tMin) / (tMax - tMin) * pW);
    const yOf = v => PT + pH - (vHi === vLo ? pH / 2 : (v - vLo) / (vHi - vLo) * pH);
    const lineClr = autoColor
      ? (vis[vis.length - 1].v >= vis[0].v ? '#3fb950' : '#f85149')
      : color;

    ctx.strokeStyle = 'rgba(48,54,61,0.5)';
    ctx.lineWidth = DPR * 0.5;
    for (let i = 1; i <= 3; i++) {
      const y = PT + pH * i / 4;
      ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(PL + pW, y); ctx.stroke();
    }

    if (showYLabels) {
      ctx.fillStyle = '#484f58';
      ctx.font = `${9 * DPR}px system-ui,sans-serif`;
      ctx.textAlign = 'right';
      [0, 0.5, 1].forEach(f => {
        const v = vLo + (vHi - vLo) * f;
        ctx.fillText(yFmt(v), canvas.width - DPR, PT + pH * (1 - f) + 3 * DPR);
      });
    }

    const grad = ctx.createLinearGradient(0, PT, 0, canvas.height - PB);
    grad.addColorStop(0, lineClr + '33'); grad.addColorStop(1, lineClr + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(xOf(tMin), canvas.height - PB);
    vis.forEach(p => ctx.lineTo(xOf(p.t), yOf(p.v)));
    ctx.lineTo(xOf(tMax), canvas.height - PB);
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = lineClr; ctx.lineWidth = 1.5 * DPR;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
    ctx.beginPath();
    vis.forEach((p, i) => i === 0 ? ctx.moveTo(xOf(p.t), yOf(p.v)) : ctx.lineTo(xOf(p.t), yOf(p.v)));
    ctx.stroke();

    if (showXLabels) {
      ctx.fillStyle = '#484f58'; ctx.textAlign = 'center';
      ctx.font = `${8 * DPR}px system-ui,sans-serif`;
      const n = Math.min(vis.length - 1, Math.max(2, Math.floor(W / 80)));
      for (let i = 0; i <= n; i++) {
        const idx = Math.round(i / n * (vis.length - 1));
        ctx.fillText(xFmt(vis[idx].t), xOf(vis[idx].t), canvas.height - 2 * DPR);
      }
    }

    _L = { vis, xOf, yOf, tMin, tMax, pW, pH, PT, PB, PL, PR, lineClr, DPR, cW: canvas.width, cH: canvas.height, W };
  }

  function _crosshair(pt) {
    if (!_L) return;
    const { xOf, yOf, PT, PB, PL, PR, lineClr, DPR, cW, cH } = _L;
    const ctx = canvas.getContext('2d');
    const cx = xOf(pt.t), cy = yOf(pt.v);
    ctx.setLineDash([3 * DPR, 3 * DPR]);
    ctx.strokeStyle = 'rgba(180,180,180,0.22)'; ctx.lineWidth = DPR;
    ctx.beginPath(); ctx.moveTo(cx, PT); ctx.lineTo(cx, cH - PB); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PL, cy); ctx.lineTo(cW - PR, cy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = lineClr; ctx.strokeStyle = '#0d1117'; ctx.lineWidth = 2 * DPR;
    ctx.beginPath(); ctx.arc(cx, cy, 3.5 * DPR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  function _nearest(mx) {
    if (!_L) return null;
    const { vis, tMin, tMax, pW, PL, DPR } = _L;
    const tAt = tMin + (mx * DPR - PL) / pW * (tMax - tMin);
    let best = null, bestD = Infinity;
    vis.forEach(p => { const d = Math.abs(p.t - tAt); if (d < bestD) { bestD = d; best = p; } });
    return best;
  }

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const pt = _nearest(mx);
    if (!pt || !_L) return;
    draw(); _crosshair(pt);
    const vis = _L.vis;
    const pct = vis.length > 1 ? ((pt.v - vis[0].v) / vis[0].v * 100).toFixed(1) : null;
    const pctHtml = pct != null
      ? ` <span class="iyc-tt-p" style="color:${parseFloat(pct)>=0?'var(--success)':'var(--danger)'}">${parseFloat(pct)>=0?'+':''}${pct}%</span>`
      : '';
    tt.innerHTML = `<span class="iyc-tt-x">${xFmt(pt.t)}</span> <span class="iyc-tt-v">${yFmt(pt.v)}</span>${pctHtml}`;
    tt.style.display = 'block';
    const tw = tt.offsetWidth, th = tt.offsetHeight;
    let tx = mx - tw / 2; if (tx < 0) tx = 0; if (tx + tw > rect.width) tx = rect.width - tw;
    tt.style.left = tx + 'px';
    tt.style.top  = (my < rect.height / 2 ? my + 12 : my - th - 6) + 'px';
  });

  canvas.addEventListener('mouseleave', () => { tt.style.display = 'none'; draw(); });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (!ranges?.length || !btnRow) return;
    const btns = [...btnRow.querySelectorAll('.iyc-range')];
    const cur  = btns.findIndex(b => +b.dataset.days === activeDays);
    const next = Math.max(0, Math.min(btns.length - 1, cur + (e.deltaY > 0 ? 1 : -1)));
    if (next !== cur) btns[next].click();
  }, { passive: false });

  const ro = new ResizeObserver(() => draw());
  ro.observe(containerEl);
  draw();

  return { draw, destroy: () => ro.disconnect() };
}