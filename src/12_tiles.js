/* ============================================================
   LA CUEVA · suelos, muros y texturas (pixel art procedural)
   ============================================================ */
const FloorArt = (() => {
  const cache = new Map();
  function noise(g, R, base, n, amp, sz) {
    for (let i = 0; i < n; i++) g.r(Math.floor(R() * 32), Math.floor(R() * 32), sz || 1, 1, R() < 0.5 ? shade(base, -amp) : shade(base, amp));
  }
  function make(kind, base, v) {
    const [c, x] = cvs(32, 32), g = new Pen(x), R = mulberry32(strSeed(kind + base) + v * 7919);
    switch (kind) {
      case 'wood': {   // tablones horizontales
        for (let row = 0; row < 4; row++) {
          const y = row * 8, off = Math.floor(R() * 24) + 4, tone = (R() - 0.5) * 0.12;
          const b = shade(base, tone);
          g.r(0, y, 32, 8, b);
          g.r(0, y, 32, 1, shade(b, 0.1)); g.r(0, y + 7, 32, 1, shade(b, -0.2));
          g.r(off, y, 1, 8, shade(b, -0.24)); g.r(off + 1, y, 1, 7, shade(b, 0.06));
          for (let k = 0; k < 3; k++) { const gx = Math.floor(R() * 24), gy = y + 2 + Math.floor(R() * 4); g.r(gx, gy, 3 + Math.floor(R() * 6), 1, shade(b, -0.1)); }
          if (R() < 0.35) { g.p(Math.floor(R() * 28) + 2, y + 3, shade(b, -0.28)); }
        }
        break;
      }
      case 'stone16': {  // pasillos: losas de 16 px alternas
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
          const alt = (i + j + v) % 2, b = shade(base, alt ? -0.045 : 0.025 + (R() - .5) * 0.03);
          g.r(i * 16, j * 16, 16, 16, b);
          g.r(i * 16, j * 16, 16, 1, shade(b, 0.1)); g.r(i * 16, j * 16, 1, 16, shade(b, 0.06));
          g.r(i * 16 + 15, j * 16, 1, 16, shade(b, -0.16)); g.r(i * 16, j * 16 + 15, 16, 1, shade(b, -0.18));
        }
        noise(g, R, base, 10, 0.07);
        break;
      }
      case 'slate': {
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
          const b = shade(base, (R() - .5) * 0.08);
          g.r(i * 16, j * 16, 16, 16, b); g.r(i * 16, j * 16, 16, 1, shade(b, 0.12)); g.r(i * 16, j * 16, 1, 16, shade(b, 0.08));
          g.r(i * 16 + 15, j * 16, 1, 16, shade(b, -0.25)); g.r(i * 16, j * 16 + 15, 16, 1, shade(b, -0.25));
          if (R() < 0.5) g.r(i * 16 + 3, j * 16 + 4, 5, 1, shade(b, 0.07));
        }
        break;
      }
      case 'tile': {   // baldosa cerámica grande
        const b = shade(base, (R() - .5) * 0.04);
        g.r(0, 0, 32, 32, b); g.r(0, 0, 32, 1, shade(b, 0.12)); g.r(0, 0, 1, 32, shade(b, 0.1));
        g.r(31, 0, 1, 32, shade(b, -0.14)); g.r(0, 31, 32, 1, shade(b, -0.16));
        g.line(5, 12, 12, 5, shade(b, 0.1)); g.line(7, 14, 14, 7, shade(b, 0.06));
        noise(g, R, base, 6, 0.05);
        break;
      }
      case 'metal': {
        g.r(0, 0, 32, 32, base);
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
          const b = shade(base, (R() - .5) * 0.06);
          g.r(i * 16, j * 16, 16, 16, b); g.r(i * 16, j * 16, 16, 1, shade(b, 0.14)); g.r(i * 16 + 15, j * 16, 1, 16, shade(b, -0.3)); g.r(i * 16, j * 16 + 15, 16, 1, shade(b, -0.3));
          g.p(i * 16 + 2, j * 16 + 2, shade(b, 0.3)); g.p(i * 16 + 13, j * 16 + 2, shade(b, 0.3)); g.p(i * 16 + 2, j * 16 + 13, shade(b, 0.3)); g.p(i * 16 + 13, j * 16 + 13, shade(b, 0.3));
        }
        if (v % 2 === 0) { g.r(0, 15, 32, 1, rgba('#6ec6d9', .22)); }
        break;
      }
      case 'carpet': {
        g.r(0, 0, 32, 32, base); noise(g, R, base, 70, 0.06);
        break;
      }
      case 'flag': {   // losas irregulares
        g.r(0, 0, 32, 32, shade(base, -0.22));
        const cuts = [[0, 0, 15, 11], [15, 0, 17, 14], [0, 11, 12, 10], [12, 14, 20, 9], [0, 21, 17, 11], [17, 23, 15, 9], [12, 11, 3, 3]];
        for (const [a, b2, w, h] of cuts) { if (w < 4) continue; const t = shade(base, (R() - .5) * 0.1); g.r(a + 1, b2 + 1, w - 1, h - 1, t); g.r(a + 1, b2 + 1, w - 1, 1, shade(t, .12)); g.r(a + 1, b2 + h - 1, w - 1, 1, shade(t, -.12)); }
        break;
      }
      case 'rock': {
        g.r(0, 0, 32, 32, base);
        for (let i = 0; i < 9; i++) { const bx = Math.floor(R() * 30), by = Math.floor(R() * 30), bw = 3 + Math.floor(R() * 6), bh = 2 + Math.floor(R() * 4); g.r(bx, by, bw, bh, shade(base, (R() - .5) * 0.34)); }
        noise(g, R, base, 22, 0.22);
        break;
      }
      case 'gravel': {
        g.r(0, 0, 32, 32, base); noise(g, R, base, 90, 0.16);
        for (let i = 0; i < 8; i++) g.r(Math.floor(R() * 30), Math.floor(R() * 30), 2, 1, shade(base, .22));
        break;
      }
    }
    return c;
  }
  function get(kind, base, i, j) {
    const key = kind + '|' + base;
    let arr = cache.get(key);
    if (!arr) { arr = []; for (let v = 0; v < 4; v++) arr.push(make(kind, base, v)); cache.set(key, arr); }
    return arr[Math.floor(hash2(i, j, 5) * 4) % 4];
  }
  return { get };
})();

const WallArt = (() => {
  const capCache = new Map();
  function cap(v) {
    if (capCache.has(v)) return capCache.get(v);
    const [c, x] = cvs(32, 32), g = new Pen(x), R = mulberry32(900 + v);
    const base = BR.brown;
    g.r(0, 0, 32, 32, shade(base, -0.08));
    // sillares: dos hileras de bloques
    for (let row = 0; row < 2; row++) {
      const y = row * 16, off = row ? 8 : 0;
      for (let i = -1; i < 3; i++) {
        const bx = i * 16 + off, t = shade(base, (R() - .5) * 0.16 + 0.04);
        g.r(bx + 1, y + 1, 15, 15, t); g.r(bx + 1, y + 1, 15, 2, shade(t, .2)); g.r(bx + 1, y + 1, 1, 15, shade(t, .1)); g.r(bx + 15, y + 2, 1, 14, shade(t, -.16)); g.r(bx + 1, y + 15, 15, 1, shade(t, -.2));
        if (R() < .6) g.p(bx + 4 + Math.floor(R() * 8), y + 5 + Math.floor(R() * 6), shade(t, .16));
      }
    }
    capCache.set(v, c); return c;
  }
  /* cara del muro (2 filas), x,y en píxeles, w en baldosas */
  function face(ctx, x0, y0, wTiles, color, accent, seed) {
    const g = new Pen(ctx), w = wTiles * 32, R = mulberry32(seed || 7);
    const dark = shade(color, -0.2), light = shade(color, 0.12);
    g.r(x0, y0, w, 64, color);
    for (let i = 0; i < w; i += 8) { if (((i / 8) | 0) % 2 === 0) g.r(x0 + i, y0 + 3, 8, 40, shade(color, 0.035)); }
    // moldura superior con sombra de la cabeza del muro
    g.r(x0, y0, w, 3, rgba('#120a06', 0.38)); g.r(x0, y0 + 3, w, 2, shade(color, .18)); g.r(x0, y0 + 5, w, 1, dark);
    // friso inferior
    g.r(x0, y0 + 40, w, 1, light); g.r(x0, y0 + 41, w, 22, shade(color, -0.1));
    for (let i = 0; i < w; i += 16) { g.r(x0 + i, y0 + 43, 1, 17, shade(color, -0.2)); g.r(x0 + i + 1, y0 + 43, 1, 17, shade(color, -0.02)); }
    g.r(x0, y0 + 42, w, 1, shade(color, -0.22));
    g.r(x0, y0 + 60, w, 4, shade(color, -0.38)); g.r(x0, y0 + 60, w, 1, shade(color, -0.15));
    if (accent) g.r(x0, y0 + 38, w, 1, accent);
    for (let i = 0; i < w / 6; i++) g.p(x0 + Math.floor(R() * w), y0 + 8 + Math.floor(R() * 30), shade(color, R() < .5 ? -.08 : .08));
  }
  return { cap, face };
})();
