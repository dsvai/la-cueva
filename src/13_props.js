/* ============================================================
   LA CUEVA · mobiliario y decoración (sprites procedurales)
   Cada sprite: { c: canvas, ax, ay } con (ax, ay) = punto de apoyo
   (abajo-izquierda de la huella) dentro del lienzo.
   ============================================================ */
const Props = (() => {
  const cache = new Map();
  const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
  const SH = 'rgba(18,10,6,.28)';

  function monitor(g, x, y, w, h, bezel) {
    bezel = bezel || '#1f1b19';
    g.r(x, y, w, h, bezel); g.r(x, y, w, 1, '#3a3431');
    g.r(x + 2, y + 2, w - 4, h - 5, '#15201c');
    g.r(x + 2, y + 2, w - 4, 1, 'rgba(255,255,255,.08)');
    const cx = x + Math.floor(w / 2);
    g.r(cx - 2, y + h, 4, 3, '#2b2623'); g.r(cx - 5, y + h + 3, 10, 2, '#2b2623');
    return { x: x + 2, y: y + 2, w: w - 4, h: h - 5 };
  }
  /* escritorio 2×1 con pantallas; facing='N' (pantalla hacia la cámara) o 'S' (portátil de espaldas) */
  function desk(o) {
    return memo('desk' + JSON.stringify(o), () => {
      const [c, x] = cvs(64, 64), g = new Pen(x), fy = 32;
      const top = o.wood || '#b0855a', front = shade(top, -0.28);
      g.r(3, fy + 29, 60, 3, SH);
      g.box(1, fy + 6, 62, 11, 12, top, front);
      g.r(3, fy + 29, 4, 2, shade(front, -.3)); g.r(57, fy + 29, 4, 2, shade(front, -.3));
      g.r(44, fy + 18, 16, 10, shade(front, -.08)); g.r(44, fy + 22, 16, 1, shade(front, -.3)); g.r(50, fy + 20, 4, 1, '#d9bb6e'); g.r(50, fy + 25, 4, 1, '#d9bb6e');
      const screens = [];
      const kind = o.kind || 'dual';
      if (o.facing === 'S') {
        // portátil de espaldas, lámpara y papeles
        g.r(22, fy - 3, 22, 13, '#3a3633'); g.r(22, fy - 3, 22, 1, '#55504c'); g.disc(33, fy + 3, 2, o.accent || '#b29a7d');
        g.r(20, fy + 10, 26, 3, '#4a4542');
        g.r(5, fy + 8, 9, 6, '#efe5d5'); g.r(6, fy + 9, 7, 1, '#c9bba3'); g.r(6, fy + 11, 5, 1, '#c9bba3');
        g.r(53, fy - 6, 2, 16, '#2b2623'); g.r(49, fy - 9, 10, 5, o.accent || '#344c3d'); g.r(52, fy + 9, 6, 2, '#2b2623');
      } else {
        if (kind === 'dual') { screens.push(monitor(g, 5, fy - 12, 26, 19)); screens.push(monitor(g, 33, fy - 12, 26, 19)); }
        else if (kind === 'wide') { screens.push(monitor(g, 10, fy - 13, 44, 20)); }
        else if (kind === 'tablet') { screens.push(monitor(g, 18, fy - 14, 34, 21, '#d9d4cc')); g.r(5, fy + 9, 12, 8, '#2b2623'); g.r(6, fy + 10, 10, 6, '#47413d'); g.line(8, fy + 15, 13, fy + 11, '#d9bb6e'); }
        else if (kind === 'phone') { screens.push(monitor(g, 16, fy - 12, 30, 19)); g.r(48, fy + 4, 9, 6, '#2b2623'); g.r(49, fy + 2, 7, 3, '#3a3431'); g.disc(52, fy - 2, 3, o.accent || '#e4a89f'); }
        else if (kind === 'code') { screens.push(monitor(g, 3, fy - 12, 22, 19)); screens.push(monitor(g, 25, fy - 15, 24, 21)); screens.push(monitor(g, 49, fy - 12, 13, 19)); }
        else { screens.push(monitor(g, 18, fy - 12, 28, 19)); }
        g.r(20, fy + 11, 22, 4, '#2b2623'); g.r(21, fy + 12, 20, 1, '#4a4440'); g.r(21, fy + 13, 20, 1, '#3a3532');
        g.r(45, fy + 12, 3, 4, '#d9d4cc');
        if (o.mug) { g.r(9, fy + 11, 4, 4, o.mug); g.r(13, fy + 12, 1, 2, o.mug); }
        if (o.sticky) { g.r(4, fy + 8, 3, 3, o.sticky); g.r(57, fy + 9, 3, 3, shade(o.sticky, .2)); }
      }
      return { c, ax: 0, ay: 64, screens };
    });
  }
  function chair(color) {
    return memo('chair' + color, () => {
      const [sc, sx] = cvs(22, 16), g = new Pen(sx);
      g.r(3, 13, 16, 2, SH); g.r(4, 12, 14, 1, '#2b2623'); g.r(3, 13, 2, 2, '#1f1b19'); g.r(17, 13, 2, 2, '#1f1b19'); g.r(10, 13, 2, 2, '#1f1b19');
      g.r(10, 8, 2, 4, '#3a3431');
      g.rr(2, 2, 18, 7, 2, color); g.r(3, 2, 16, 1, shade(color, .2)); g.r(2, 7, 18, 2, shade(color, -.25));
      Pen.outline(sx, 22, 16, OUT);
      const [bc, bx] = cvs(22, 15), b = new Pen(bx);
      b.rr(2, 1, 18, 12, 3, color); b.r(4, 1, 14, 1, shade(color, .22)); b.r(2, 10, 18, 3, shade(color, -.25)); b.r(5, 4, 12, 1, shade(color, -.1));
      Pen.outline(bx, 22, 15, OUT);
      const [tc, tx] = cvs(22, 22), t = new Pen(tx);   // respaldo alto (silla mirando al sur)
      t.rr(2, 1, 18, 19, 3, shade(color, -.1)); t.r(4, 1, 14, 1, shade(color, .15)); t.r(2, 17, 18, 3, shade(color, -.3));
      Pen.outline(tx, 22, 22, OUT);
      return { seat: { c: sc, ax: 11, ay: 16 }, back: { c: bc, ax: 11, ay: 15 }, tall: { c: tc, ax: 11, ay: 22 } };
    });
  }
  function plant(kind, pot) {
    return memo('plant' + kind + pot, () => {
      const tall = kind === 'tall', H = tall ? 60 : 42;
      const [c, x] = cvs(32, H), g = new Pen(x), R = mulberry32(strSeed(kind + pot));
      pot = pot || '#a86b46';
      g.r(7, H - 3, 18, 3, SH);
      g.r(9, H - 13, 14, 11, pot); g.r(8, H - 14, 16, 3, shade(pot, .15)); g.r(20, H - 12, 3, 10, shade(pot, -.2)); g.r(10, H - 3, 12, 1, shade(pot, -.35));
      const greens = ['#2f5a3a', '#3f7346', '#5a9152', '#7fb06a'];
      if (tall) {
        g.r(15, H - 30, 2, 17, '#5a3d26');
        for (let i = 0; i < 22; i++) { const lx = 6 + R() * 20, ly = 4 + R() * (H - 34); g.ell(Math.round(lx), Math.round(ly), 3, 2, greens[Math.floor(R() * 3)]); }
        for (let i = 0; i < 10; i++) g.p(6 + Math.floor(R() * 20), 4 + Math.floor(R() * (H - 34)), greens[3]);
      } else {
        for (let i = 0; i < 14; i++) { const a = -Math.PI * (0.1 + R() * 0.8), len = 7 + R() * 9; g.line(16, H - 14, 16 + Math.cos(a) * len, H - 14 + Math.sin(a) * len, greens[1 + Math.floor(R() * 2)]); }
        for (let i = 0; i < 9; i++) g.ell(7 + Math.floor(R() * 18), H - 30 + Math.floor(R() * 14), 2, 1, greens[Math.floor(R() * 4)]);
      }
      Pen.outline(x, 32, H, OUT);
      return { c, ax: 0, ay: H };
    });
  }
  /* estantería de pared 2×1 */
  function shelf(o) {
    return memo('shelf' + JSON.stringify(o), () => {
      const W = (o.w || 2) * 32, H = 58;
      const [c, x] = cvs(W, H), g = new Pen(x), R = mulberry32(strSeed('shelf' + (o.seed || 0)));
      const wood = o.wood || '#6b4b33';
      g.r(1, H - 3, W - 2, 3, SH);
      g.r(2, 2, W - 4, H - 5, wood); g.r(2, 2, W - 4, 2, shade(wood, .2)); g.r(5, 6, W - 10, H - 13, shade(wood, -.35));
      const books = ['#8a3b2e', '#344c3d', '#c9a03a', '#4f5392', '#efe5d5', '#7e6275', '#3f7f7a', '#b96f52'];
      for (let row = 0; row < 3; row++) {
        const sy = 6 + row * 16;
        g.r(4, sy + 14, W - 8, 2, shade(wood, .08));
        let bx = 6;
        while (bx < W - 8) {
          const kind = R();
          if (kind < 0.12 && bx < W - 16) { g.r(bx, sy + 8, 9, 6, o.box || '#b29a7d'); g.r(bx, sy + 8, 9, 1, '#d4c3a6'); bx += 11; continue; }
          if (kind < 0.18 && bx < W - 14) { g.r(bx + 2, sy + 10, 6, 4, '#a86b46'); g.ell(bx + 5, sy + 7, 3, 2, '#4f8a54'); bx += 10; continue; }
          const bw = 2 + Math.floor(R() * 3), bh = 8 + Math.floor(R() * 5), col = books[Math.floor(R() * books.length)];
          g.r(bx, sy + 14 - bh, bw, bh, col); g.r(bx, sy + 14 - bh, bw, 1, shade(col, .25)); if (bw > 2) g.r(bx, sy + 16 - bh, bw, 1, shade(col, -.3));
          bx += bw + (R() < .2 ? 2 : 0);
        }
      }
      Pen.outline(x, W, H, OUT);
      return { c, ax: 0, ay: H };
    });
  }
  function sofa(color, w, dir) {
    return memo('sofa' + color + w + dir, () => {
      const W = w * 32, H = 40; const [c, x] = cvs(W, H), g = new Pen(x);
      g.r(2, H - 3, W - 4, 3, SH);
      if (dir === 'N') {   // de espaldas
        g.box(2, 10, W - 4, 6, 18, shade(color, .05), shade(color, -.18));
      } else {
        g.rr(3, 6, W - 6, 14, 3, shade(color, -.1)); g.r(5, 6, W - 10, 1, shade(color, .15));
        g.box(4, 17, W - 8, 8, 10, shade(color, .12), shade(color, -.2));
        for (let i = 1; i < w; i++) g.r(4 + i * (W - 8) / w, 18, 1, 6, shade(color, -.15));
        g.box(1, 13, 6, 5, 17, shade(color, .02), shade(color, -.28)); g.box(W - 7, 13, 6, 5, 17, shade(color, .02), shade(color, -.28));
      }
      Pen.outline(x, W, H, OUT);
      return { c, ax: 0, ay: H };
    });
  }
  function table(o) {
    return memo('table' + JSON.stringify(o), () => {
      const W = o.w * 32, D = o.h * 32, H = D + 8;
      const [c, x] = cvs(W, H), g = new Pen(x);
      const top = o.top || '#9a7353';
      g.r(4, H - 4, W - 8, 4, SH);
      const th = Math.round(D * 0.62), fh = 9;
      g.box(2, H - th - fh - 4, W - 4, th, fh, top, shade(top, -.3));
      g.r(6, H - 5, 3, 3, shade(top, -.45)); g.r(W - 9, H - 5, 3, 3, shade(top, -.45));
      if (o.items) {
        const R = mulberry32(W + D); const ty = H - th - fh - 4;
        for (let i = 0; i < o.items; i++) { const ix = 8 + Math.floor(R() * (W - 22)), iy = ty + 3 + Math.floor(R() * (th - 9)); const k = R(); if (k < .4) { g.r(ix, iy, 8, 6, '#efe5d5'); g.r(ix + 1, iy + 1, 6, 1, '#b8a68a'); } else if (k < .7) { g.r(ix, iy, 3, 4, '#efe5d5'); g.r(ix, iy, 3, 1, '#6b4b33'); } else { g.r(ix, iy, 9, 6, '#3a3633'); g.r(ix + 1, iy + 1, 7, 4, '#5c6e66'); } }
      }
      if (o.round) { x.globalCompositeOperation = 'destination-out'; g.r(0, 0, 4, H, '#000'); g.r(W - 4, 0, 4, H, '#000'); x.globalCompositeOperation = 'source-over'; }
      Pen.outline(x, W, H, OUT);
      return { c, ax: 0, ay: H };
    });
  }
  function box(w, h, kind, col) {   // objetos genéricos de 1 baldosa
    return memo('obj' + kind + col + w + h, () => {
      const W = w * 32, H = h; const [c, x] = cvs(W, H), g = new Pen(x);
      g.r(3, H - 3, W - 6, 3, SH);
      switch (kind) {
        case 'coffee': g.box(4, H - 30, 24, 6, 22, '#4a4542', '#2f2b29'); g.r(8, H - 21, 16, 9, '#1b1816'); g.r(13, H - 14, 6, 2, '#efe5d5'); g.r(9, H - 28, 5, 2, '#c94f3a'); g.r(16, H - 28, 3, 2, '#6ec6d9'); break;
        case 'fridge': g.box(3, H - 52, 26, 5, 45, '#d9d4cc', '#c2bcb2'); g.r(3, H - 30, 26, 1, '#9a948a'); g.r(24, H - 44, 2, 9, '#7a746a'); g.r(24, H - 26, 2, 12, '#7a746a'); g.r(7, H - 42, 6, 5, col || '#c9a03a'); break;
        case 'vending': g.box(2, H - 56, 28, 5, 49, '#3d3028', '#2f2620'); g.r(5, H - 49, 16, 32, '#1b2a2a'); for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) g.r(7 + k * 5, H - 47 + r * 8, 3, 5, ['#c94f3a', '#e6c76a', '#6ec6d9', '#7fb06a'][(r + k) % 4]); g.r(23, H - 46, 5, 8, '#57504a'); g.r(6, H - 13, 14, 4, '#141110'); break;
        case 'cooler': g.r(9, H - 38, 14, 12, 'rgba(150,205,230,.75)'); g.r(9, H - 38, 14, 2, '#d9eef5'); g.box(7, H - 27, 18, 4, 20, '#e8e2d8', '#cfc8bc'); g.r(12, H - 21, 3, 2, '#4a7fa0'); g.r(17, H - 21, 3, 2, '#c94f3a'); break;
        case 'printer': g.box(3, H - 25, 26, 7, 15, '#d9d4cc', '#bdb6aa'); g.r(7, H - 27, 18, 3, '#efe5d5'); g.r(7, H - 14, 18, 2, '#3a3633'); g.r(23, H - 20, 3, 1, '#7fb06a'); break;
        case 'rack': g.box(3, H - 60, 26, 4, 53, '#2b2a30', '#1d1c21'); for (let i = 0; i < 7; i++) { g.r(6, H - 53 + i * 7, 20, 5, '#26252b'); g.r(6, H - 53 + i * 7, 20, 1, '#3a3940'); g.r(8, H - 51 + i * 7, 10, 1, '#141317'); } break;
        case 'cabinet': g.box(4, H - 34, 24, 5, 26, col || '#8a8f87', shade(col || '#8a8f87', -.2)); for (let i = 0; i < 3; i++) { g.r(6, H - 27 + i * 8, 20, 1, shade(col || '#8a8f87', -.4)); g.r(13, H - 24 + i * 8, 6, 1, '#d9d4cc'); } break;
        case 'board': g.r(14, H - 18, 3, 16, '#4a4542'); g.r(8, H - 4, 16, 2, '#4a4542'); g.r(3, H - 44, 26, 26, '#4a4542'); g.r(4, H - 43, 24, 24, '#f2ede4'); g.r(6, H - 40, 9, 5, col || '#e6c76a'); g.r(17, H - 38, 8, 5, '#9fd0e6'); g.line(7, H - 27, 24, H - 31, '#c94f3a'); g.line(7, H - 24, 18, H - 24, '#344c3d'); break;
        case 'crates': g.box(3, H - 22, 15, 5, 14, '#c9a36e', '#a8834f'); g.r(9, H - 22, 3, 19, '#e6d3a6'); g.box(15, H - 16, 14, 4, 11, '#d1ad78', '#ad8a56'); g.box(6, H - 34, 13, 4, 9, '#d6b582', '#b39060'); g.r(11, H - 34, 3, 13, '#e9d8ad'); break;
        case 'lamp': g.r(15, H - 44, 2, 40, '#2b2623'); g.r(10, H - 4, 12, 2, '#2b2623'); g.rr(8, H - 52, 16, 10, 3, col || '#e6d3a6'); g.r(9, H - 44, 14, 2, shade(col || '#e6d3a6', -.2)); break;
        case 'bean': g.ell(16, H - 10, 12, 8, col); g.ell(14, H - 13, 8, 4, shade(col, .15)); break;
        case 'armchair': g.rr(6, H - 30, 20, 14, 3, shade(col, -.1)); g.box(5, H - 18, 22, 7, 9, shade(col, .1), shade(col, -.2)); g.box(3, H - 22, 5, 4, 15, col, shade(col, -.28)); g.box(24, H - 22, 5, 4, 15, col, shade(col, -.28)); break;
        case 'globe': g.r(10, H - 6, 12, 3, '#6b4b33'); g.r(15, H - 12, 2, 7, '#6b4b33'); g.disc(16, H - 20, 7, '#4f7fa0'); g.r(12, H - 24, 5, 3, '#7fb06a'); g.r(17, H - 19, 4, 4, '#7fb06a'); break;
        case 'easel': g.line(8, H - 2, 14, H - 44, '#6b4b33'); g.line(24, H - 2, 18, H - 44, '#6b4b33'); g.r(5, H - 42, 22, 20, '#f2ede4'); g.r(7, H - 40, 18, 16, '#efe5d5'); g.ell(13, H - 34, 4, 3, col || '#c2673f'); g.r(17, H - 30, 6, 5, '#344c3d'); g.r(5, H - 22, 22, 2, '#6b4b33'); break;
        case 'counter': g.box(1, H - 30, W - 2, 9, 19, '#d9cbb2', '#8a6a4f'); g.r(1, H - 30, W - 2, 1, '#efe5d5'); break;
        case 'torch': g.r(14, H - 26, 4, 20, '#4a3528'); g.r(12, H - 28, 8, 3, '#2b2623'); g.ell(16, H - 33, 3, 4, '#e8852f'); g.ell(16, H - 32, 2, 2, '#ffd27a'); break;
      }
      Pen.outline(x, W, H, OUT);
      return { c, ax: 0, ay: H };
    });
  }
  function reception() {
    return memo('reception', () => {
      const W = 128, H = 46; const [c, x] = cvs(W, H), g = new Pen(x);
      g.r(3, H - 3, W - 6, 3, SH);
      g.box(2, H - 32, W - 4, 9, 21, '#d9cbb2', BR.forest);
      for (let i = 0; i < 6; i++) g.r(8 + i * 20, H - 21, 12, 1, shade(BR.forest, .2));
      g.r(2, H - 12, W - 4, 1, BR.sand);
      g.r(14, H - 40, 18, 10, '#3a3633'); g.r(15, H - 39, 16, 7, '#5c6e66');
      g.r(96, H - 34, 6, 3, '#d9bb6e'); g.r(98, H - 36, 2, 2, '#d9bb6e');
      g.r(56, H - 33, 14, 3, '#efe5d5'); g.r(57, H - 33, 12, 1, '#b8a68a');
      g.r(110, H - 40, 8, 8, '#a86b46'); g.ell(114, H - 44, 5, 4, '#4f8a54');
      Pen.outline(x, W, H, OUT);
      return { c, ax: 0, ay: H };
    });
  }
  function meetChair(color, dir) { return chair(color); }

  /* ---------- decoración de pared (se dibuja en la capa estática) ---------- */
  function wallDecor(ctx, kind, x, y, o) {
    const g = new Pen(ctx); o = o || {};
    switch (kind) {
      case 'window': {
        const w = o.w || 40, h = 34, sky = o.sky || ['#9fcfe3', '#dcefF5'];
        g.r(x - 2, y - 2, w + 4, h + 6, '#5a4232'); g.r(x - 2, y - 2, w + 4, 1, '#7a5c46');
        const grd = ctx.createLinearGradient(0, y, 0, y + h); grd.addColorStop(0, sky[0]); grd.addColorStop(1, sky[1]); ctx.fillStyle = grd; ctx.fillRect(x, y, w, h);
        if (o.night) { for (let i = 0; i < 6; i++) g.p(x + 3 + ((i * 13) % (w - 6)), y + 3 + ((i * 7) % (h - 12)), '#f5f0d8'); g.disc(x + w - 9, y + 8, 3, '#f1e9c6'); }
        else { g.ell(x + 10, y + 9, 6, 2, 'rgba(255,255,255,.85)'); g.ell(x + w - 12, y + 14, 5, 2, 'rgba(255,255,255,.7)'); }
        g.r(x, y + h - 9, w, 9, o.night ? '#24301f' : '#6f8f55'); g.r(x, y + h - 9, w, 1, o.night ? '#33452c' : '#89a86a');
        g.r(x + w / 2 - 1, y, 2, h, '#5a4232'); g.r(x, y + h / 2 - 1, w, 2, '#5a4232');
        g.r(x - 4, y + h + 2, w + 8, 3, '#7a5c46'); g.r(x - 4, y + h + 4, w + 8, 1, '#3d2c22');
        break;
      }
      case 'board': {
        const w = o.w || 48, h = 30;
        g.r(x - 1, y - 1, w + 2, h + 2, '#5c564f'); g.r(x, y, w, h, '#f2ede4');
        const t = o.t || 'kanban', a = o.accent || '#c9a03a', R = mulberry32(strSeed(t + x));
        if (t === 'kanban') { for (let col = 0; col < 3; col++) { g.r(x + 3 + col * 15, y + 3, 13, 2, '#5c564f'); for (let k = 0; k < 3 - (col === 2 ? 1 : 0); k++) g.r(x + 4 + col * 15, y + 7 + k * 7, 10, 5, [a, '#9fd0e6', '#f0b3a7', '#bccb7e'][(col + k) % 4]); } }
        else if (t === 'chart') { for (let i = 0; i < 7; i++) { const bh = 5 + Math.floor(R() * 18); g.r(x + 4 + i * 6, y + h - 3 - bh, 4, bh, i === 5 ? a : '#8fa6bc'); } g.r(x + 3, y + h - 3, w - 6, 1, '#5c564f'); }
        else if (t === 'strategy') { g.r(x + 4, y + 5, 12, 7, '#9fd0e6'); g.r(x + 30, y + 5, 12, 7, a); g.r(x + 17, y + 18, 12, 7, '#bccb7e'); g.line(x + 16, y + 9, x + 30, y + 9, '#344c3d'); g.line(x + 36, y + 12, x + 26, y + 18, '#344c3d'); g.line(x + 10, y + 12, x + 20, y + 18, '#344c3d'); }
        else if (t === 'mood') { const cs = ['#c2673f', '#e2b89b', '#344c3d', '#efe5d5', '#7e6275', a]; for (let i = 0; i < 8; i++) g.r(x + 3 + (i % 4) * 11, y + 3 + Math.floor(i / 4) * 13, 9, 11, cs[i % cs.length]); }
        else if (t === 'flow') { const pts = [[6, 6], [22, 6], [38, 6], [14, 20], [32, 20]]; g.line(x + 9, y + 8, x + 25, y + 8, '#4f5392'); g.line(x + 25, y + 8, x + 41, y + 8, '#4f5392'); g.line(x + 25, y + 10, x + 17, y + 21, '#4f5392'); g.line(x + 41, y + 10, x + 35, y + 21, '#4f5392'); for (const [px, py] of pts) g.r(x + px, y + py, 7, 5, a); }
        else if (t === 'tickets') { for (let i = 0; i < 4; i++) { g.r(x + 4, y + 4 + i * 6, 32, 4, '#e8e1d4'); g.r(x + 38, y + 4 + i * 6, 4, 4, ['#7fb06a', a, '#c94f3a', '#7fb06a'][i]); } }
        else if (t === 'ranking') { for (let i = 0; i < 4; i++) { g.r(x + 4, y + 4 + i * 6, 4, 4, ['#d9bb6e', '#cfcfca', '#c08a5a', '#8fa6bc'][i]); g.r(x + 10, y + 5 + i * 6, 30 - i * 5, 2, a); } }
        else if (t === 'code') { g.r(x, y, w, h, '#1d2522'); for (let i = 0; i < 6; i++) g.r(x + 4 + (i % 3) * 3, y + 4 + i * 4, 8 + Math.floor(R() * 22), 2, ['#7fc9be', '#e6c76a', '#c9a7b8', '#efe5d5'][i % 4]); }
        else if (t === 'text') { for (let i = 0; i < 6; i++) g.r(x + 4, y + 4 + i * 4, i % 3 === 2 ? 22 : 38, 1, '#7a726a'); g.r(x + 4, y + 3, 18, 2, a); }
        break;
      }
      case 'poster': {
        const w = 20, h = 26, a = o.accent || '#c2673f';
        g.r(x - 1, y - 1, w + 2, h + 2, '#3a2e26'); g.r(x, y, w, h, o.bg || '#efe5d5');
        g.disc(x + 10, y + 10, 5, a); g.r(x + 3, y + 18, 14, 2, '#3d3028'); g.r(x + 3, y + 21, 9, 1, '#7a726a');
        break;
      }
      case 'clock': { g.disc(x + 6, y + 6, 6, '#3d3028'); g.disc(x + 6, y + 6, 5, '#f5efe2'); break; }
      case 'painting': {
        const w = 52, h = 30;
        g.r(x - 2, y - 2, w + 4, h + 4, '#7a5a2f'); g.r(x - 1, y - 1, w + 2, 1, '#b08d4c'); g.r(x, y, w, h, '#d8c4a0');
        const R = mulberry32(42); for (let i = 0; i < 40; i++) g.p(x + Math.floor(R() * w), y + Math.floor(R() * h), '#c9b38c');
        // manos y bisonte esquemáticos, en ocre
        const ochre = '#9b3d22';
        g.r(x + 6, y + 13, 6, 7, ochre); for (let f = 0; f < 4; f++) g.r(x + 6 + f * 2 - (f > 1 ? 0 : 0), y + 7 + (f === 0 || f === 3 ? 2 : 0), 1, 6, ochre); g.r(x + 12, y + 14, 3, 1, ochre);
        g.r(x + 22, y + 12, 18, 8, '#5a3420'); g.r(x + 19, y + 10, 7, 6, '#5a3420'); g.r(x + 18, y + 11, 2, 2, '#5a3420'); g.r(x + 24, y + 9, 10, 3, '#5a3420');
        for (const lx of [23, 27, 34, 38]) g.r(x + lx, y + 20, 2, 5, '#5a3420'); g.r(x + 40, y + 13, 3, 1, '#5a3420');
        g.r(x + 44, y + 8, 2, 14, ochre); g.r(x + 47, y + 10, 2, 10, ochre);
        break;
      }
      case 'screen': {
        const w = o.w || 96, h = 36;
        g.r(x - 2, y - 2, w + 4, h + 4, '#1d1a18'); g.r(x, y, w, h, '#1b2622');
        for (let i = 0; i < 9; i++) { const bh = 6 + ((i * 37) % 20); g.r(x + 8 + i * 9, y + h - 4 - bh, 5, bh, i % 3 ? '#3f6b55' : '#b29a7d'); }
        g.r(x + 6, y + 5, 30, 2, '#efe5d5');
        break;
      }
      case 'plaque': {
        const w = o.w || 64, h = 12;
        g.r(x, y, w, h, '#2a211b'); g.r(x + 1, y + 1, w - 2, h - 2, o.bg || BR.forest); g.r(x + 1, y + 1, w - 2, 1, shade(o.bg || BR.forest, .2));
        ctx.save(); ctx.fillStyle = o.fg || BR.beige; ctx.font = '600 7px "Pixelify Sans","Courier New",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText((o.text || '').toUpperCase(), x + w / 2, y + h / 2 + 0.5); ctx.restore();
        break;
      }
      case 'shelfWall': {
        const w = o.w || 30; g.r(x, y + 10, w, 3, '#6b4b33'); g.r(x, y + 13, w, 1, '#3d2c22');
        g.r(x + 3, y + 3, 3, 7, '#8a3b2e'); g.r(x + 6, y + 4, 2, 6, '#344c3d'); g.r(x + 8, y + 2, 3, 8, '#c9a03a'); g.r(x + 18, y + 5, 6, 5, '#a86b46'); g.ell(x + 21, y + 3, 4, 2, '#4f8a54');
        break;
      }
      case 'neon': {
        const w = o.w || 40; g.r(x, y, w, 12, '#1b1816'); g.r(x + 3, y + 5, w - 6, 2, o.accent || '#6ec6d9'); g.r(x + 3, y + 4, w - 6, 1, rgba(o.accent || '#6ec6d9', .5));
        break;
      }
    }
  }
  return { desk, chair, plant, shelf, sofa, table, box, reception, wallDecor, meetChair };
})();
