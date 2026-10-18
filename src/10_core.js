/* ============================================================
   LA CUEVA · núcleo: utilidades, color, lienzos y pincel pixel
   ============================================================ */
'use strict';
const BR = { forest: '#344C3D', beige: '#EFE5D5', brown: '#3D3028', sand: '#B29A7D' };
const OUT = '#241811';           // contorno de los sprites
const TILE = 32;
/* modo de ejecución: artefacto de Claude (por defecto), navegador con backend o worker del servidor */
const LC_SERVER = !!(typeof window !== 'undefined' && window.LC_SERVER);
const LC_RUNTIME = (typeof window !== 'undefined' && window.LC_RUNTIME) || 'artifact';

function h2r(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function r2h(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function mixc(a, b, t) { const A = h2r(a), B = h2r(b); return r2h(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
function shade(c, t) { return t < 0 ? mixc(c, '#1a100b', -t) : mixc(c, '#fff4de', t); }
function rgba(c, a) { const [r, g, b] = h2r(c); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, y, s) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((s || 0) | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function strSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

function cvs(w, h) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  const x = c.getContext('2d', (w * h < 40000) ? { willReadFrequently: true } : undefined); x.imageSmoothingEnabled = false; return [c, x];
}

/* Pincel de píxeles: todo en coordenadas enteras */
class Pen {
  constructor(ctx, ox, oy) { this.c = ctx; this.ox = ox || 0; this.oy = oy || 0; }
  r(x, y, w, h, col) {
    if (w <= 0 || h <= 0) return this;
    const c = this.c; c.fillStyle = col;
    c.fillRect(Math.round(x) + this.ox, Math.round(y) + this.oy, Math.round(w), Math.round(h)); return this;
  }
  p(x, y, col) { return this.r(x, y, 1, 1, col); }
  /* rectángulo con esquinas recortadas (radio en píxeles) */
  rr(x, y, w, h, rad, col) {
    if (rad <= 0) return this.r(x, y, w, h, col);
    for (let j = 0; j < h; j++) {
      let inset = 0;
      if (j < rad) inset = rad - j; else if (j >= h - rad) inset = rad - (h - 1 - j);
      inset = Math.max(0, Math.min(inset, Math.floor(w / 2) - 1));
      this.r(x + inset, y + j, w - inset * 2, 1, col);
    }
    return this;
  }
  disc(cx, cy, rad, col) {
    for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) if (i * i + j * j <= rad * rad + rad * 0.6) this.p(cx + i, cy + j, col);
    return this;
  }
  ell(cx, cy, rx, ry, col) {
    for (let j = -ry; j <= ry; j++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (j * j) / (ry * ry + 0.5))));
      this.r(cx - w, cy + j, w * 2 + 1, 1, col);
    }
    return this;
  }
  line(x0, y0, x1, y1, col) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    for (;;) { this.p(x0, y0, col); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
    return this;
  }
  /* bloque con cara superior, frente y borde: vista 3/4 típica de RPG */
  box(x, y, w, topH, frontH, top, front, opt) {
    opt = opt || {};
    const edge = opt.edge || shade(front, -0.25), hi = shade(top, 0.14), side = shade(front, -0.1);
    this.r(x, y, w, topH, top);
    this.r(x, y, w, 1, hi);
    if (opt.topShade !== false) this.r(x, y + topH - 1, w, 1, shade(top, -0.1));
    this.r(x, y + topH, w, frontH, front);
    this.r(x, y + topH, w, 1, shade(front, 0.08));
    this.r(x + w - 1, y + topH, 1, frontH, side);
    this.r(x, y + topH + frontH - 1, w, 1, edge);
    if (opt.outline) {
      const o = opt.outline;
      this.r(x - 1, y - 1, w + 2, 1, o); this.r(x - 1, y + topH + frontH, w + 2, 1, o);
      this.r(x - 1, y, 1, topH + frontH, o); this.r(x + w, y, 1, topH + frontH, o);
    }
    return this;
  }
  /* contorno exterior de un sprite ya dibujado */
  static outline(ctx, w, h, col) {
    const id = ctx.getImageData(0, 0, w, h), d = id.data, out = new Uint8ClampedArray(d.length);
    const [R, G, B] = h2r(col);
    const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[(y * w + x) * 4 + 3];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] > 40) { out[i] = d[i]; out[i + 1] = d[i + 1]; out[i + 2] = d[i + 2]; out[i + 3] = d[i + 3]; continue; }
      if (A(x - 1, y) > 100 || A(x + 1, y) > 100 || A(x, y - 1) > 100 || A(x, y + 1) > 100) { out[i] = R; out[i + 1] = G; out[i + 2] = B; out[i + 3] = 255; }
    }
    ctx.putImageData(new ImageData(out, w, h), 0, 0);
  }
}

/* Bus sencillo de eventos para refrescar la interfaz */
const Bus = (() => {
  const m = new Map();
  return {
    on(k, f) { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(f); return () => m.get(k).delete(f); },
    emit(k, a) { const s = m.get(k); if (s) for (const f of [...s]) { try { f(a); } catch (e) { console.error('Bus', k, e); } } }
  };
})();

function uid(p) { return (p || 'x') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function dayKey(t) { const d = new Date(t || Date.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function fmtTime(t) { return new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
function fmtDate(t) { return new Date(t).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }); }
function fmtDT(t) { return fmtDate(t) + ' · ' + fmtTime(t); }
function fmtNum(n) { return new Intl.NumberFormat('es-ES').format(Math.round(n)); }
function estTokens(s) { return Math.ceil((s || '').length / 3.6); }
function trunc(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ago(t) { const s = Math.max(0, (Date.now() - t) / 1000); if (s < 60) return 'hace un momento'; if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min'; if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h'; return 'hace ' + Math.floor(s / 86400) + ' d'; }
