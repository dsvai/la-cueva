/* ============================================================
   LA CUEVA · planta única y concentrada: islas de trabajo por departamento
   alrededor del núcleo de Daniel, zonas comunes y recepción en la franja inferior.
   Un solo muro exterior; cada espacio se distingue por su suelo, su borde y su rótulo.
   ============================================================ */
const World = (() => {
  const ZW = 8, ZH = 6, GAP = 2, M = 2;                // zona 8×6, pasillos de 2, márgenes de 2
  const TOP = 3;                                        // muro norte: 1 remate + 2 de cara
  const W = M * 2 + ZW * 3 + GAP * 2 + 1;               // 33
  const ROWS = 4;                                       // 3 filas de islas + franja de servicios
  const yBottomWall = TOP + ROWS * ZH + (ROWS - 1) * GAP + 1;
  const H = yBottomWall + 3;                            // porche de entrada
  const T = { ROCK: 0, FLOOR: 1, COR: 2, CAP: 3, FACE: 4, PORCH: 5 };
  const tt = new Uint8Array(W * H), blocked = new Uint8Array(W * H), roomAt = new Array(W * H).fill(null);
  const rooms = {}, objects = [], stations = {}, pois = { coffee: [], sofa: [] }, lights = [], clocks = [], wallItems = [];
  const idx = (x, y) => y * W + x;
  const setT = (x, y, t, room) => { if (x < 0 || y < 0 || x >= W || y >= H) return; tt[idx(x, y)] = t; roomAt[idx(x, y)] = room || null; blocked[idx(x, y)] = (t === T.FLOOR || t === T.COR || t === T.PORCH) ? 0 : 1; };
  const block = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < W && j < H) blocked[idx(i, j)] = 1; };

  /* ---------- trazado ---------- */
  const LAYOUT = [['MKT', 'CONT', 'DIS'], ['VENT', 'DIR', 'PAID'], ['ATC', 'AUTO', 'DEV'], ['LOUNGE', 'RECEP', 'MEET']];
  // suelo general (pasillos) dentro del edificio
  for (let y = 3; y < yBottomWall; y++) for (let x = 1; x < W - 1; x++) setT(x, y, T.COR, 'COR');
  // muro exterior: norte con cara alta, resto solo remate
  for (let x = 0; x < W; x++) { setT(x, 0, T.CAP, 'OUT'); setT(x, 1, T.FACE, 'OUT'); setT(x, 2, T.FACE, 'OUT'); setT(x, yBottomWall, T.CAP, 'OUT'); }
  for (let y = 0; y <= yBottomWall; y++) { setT(0, y, T.CAP, 'OUT'); setT(W - 1, y, T.CAP, 'OUT'); }
  LAYOUT.forEach((row, r) => row.forEach((id, c) => {
    const rx = M + c * (ZW + GAP), ry = TOP + r * (ZH + GAP);
    rooms[id] = Object.assign({ id, rx, ry, r, c, w: ZW, h: ZH, ix0: rx, iy0: ry, cx: (rx + ZW / 2) * TILE, cy: (ry + ZH / 2) * TILE }, ROOMS[id]);
    for (let y = ry; y < ry + ZH; y++) for (let x = rx; x < rx + ZW; x++) setT(x, y, T.FLOOR, id);
  }));
  // entrada por la recepción
  const RC = rooms.RECEP, entX = RC.rx + 3;
  setT(entX, yBottomWall, T.PORCH, 'OUT'); setT(entX + 1, yBottomWall, T.PORCH, 'OUT');
  for (let y = yBottomWall + 1; y < H; y++) for (let x = entX - 3; x <= entX + 4; x++) setT(x, y, T.PORCH, 'OUT');

  /* ---------- objetos ---------- */
  function put(spr, tx, ty, fw, fh, o) {
    o = o || {};
    const x = tx * TILE + (o.dx || 0), yb = (ty + fh) * TILE + (o.dy || 0);
    const ob = { spr, x: x - spr.ax, y: yb - spr.ay, key: yb + (o.bias || 0), kind: o.kind || 'prop', room: o.room };
    if (!o.noBlock) block(tx, ty, fw, fh);
    objects.push(ob); return ob;
  }
  function addStation(agentId, R, ix, iy, facing) {
    const tx = R.ix0 + ix, ty = R.iy0 + iy;
    const ch = Props.chair(R.chair);
    if (facing === 'S') {      // escritorio delante, silla detrás (el agente mira a la cámara)
      const dk = put(Props.desk({ wood: R.desk, accent: R.accent, facing: 'S' }), tx, ty + 1, 2, 1, { room: R.id });
      const gx = (tx + 1) * TILE, gy = (ty + 1) * TILE - 5;
      objects.push({ spr: ch.tall, x: gx - ch.tall.ax, y: gy - 6 - ch.tall.ay, key: gy - 8, kind: 'chair', room: R.id });
      block(tx, ty, 2, 1);
      const st = { agentId, room: R.id, seat: { x: gx, y: gy, dir: 'S' }, stand: { tx: tx + 2, ty }, desk: dk, screens: [] };
      if (agentId) stations[agentId] = st; return st;
    }
    const dk = put(Props.desk({ wood: R.desk, accent: R.accent, kind: DESK_KIND[R.id] || 'single', mug: ['#efe5d5', '#c94f3a', '#344c3d', '#e6c76a'][(ix + iy) % 4], sticky: R.accent }), tx, ty, 2, 1, { room: R.id });
    const gx = (tx + 1) * TILE, gy = (ty + 2) * TILE - 7;
    objects.push({ spr: ch.seat, x: gx - ch.seat.ax, y: gy - ch.seat.ay, key: gy - 6, kind: 'chair', room: R.id });
    objects.push({ spr: ch.back, x: gx - ch.back.ax, y: gy - 3 - ch.back.ay, key: gy + 3, kind: 'chairback', room: R.id, hideWhenEmpty: false });
    block(tx, ty + 1, 2, 1);
    const st = { agentId, room: R.id, seat: { x: gx, y: gy - 1, dir: 'N' }, stand: { tx: tx + (ix <= 2 ? 0 : 1), ty: ty + 2 }, desk: dk, screens: dk.spr.screens.map(s => ({ x: dk.x + s.x, y: dk.y + s.y, w: s.w, h: s.h })) };
    if (agentId) stations[agentId] = st; else st.spare = true;
    return st;
  }
  const spare = [];
  function plantAt(R, ix, iy, kind) { put(Props.plant(kind || 'small', ['#a86b46', '#8a8f87', '#3d3028', '#c9b79b'][(ix + iy) % 4]), R.ix0 + ix, R.iy0 + iy, 1, 1, { room: R.id }); }
  const box = (R, ix, iy, h, kind, col, w) => put(Props.box(w || 1, h, kind, col), R.ix0 + ix, R.iy0 + iy, w || 1, 1, { room: R.id });

  const byDept = {};
  for (const a of DEFAULT_AGENTS) (byDept[a.dept] = byDept[a.dept] || []).push(a.id);
  // cada isla: fila del fondo con objetos del oficio, dos filas de 2 puestos (4 por isla; los libres sirven para contrataciones)
  const SEATS = [[1, 1], [5, 1], [1, 4], [5, 4]];
  const BACK = {
    MKT: R => { box(R, 0, 0, 48, 'board', '#9fb8cc'); box(R, 3, 0, 46, 'globe'); put(Props.table({ w: 2, h: 1, top: '#c39a6b', items: 2 }), R.ix0 + 5, R.iy0, 2, 1, { room: R.id }); },
    CONT: R => { put(Props.shelf({ w: 2, seed: 3 }), R.ix0, R.iy0, 2, 1, { room: R.id }); box(R, 3, 0, 54, 'lamp', '#e6d3a6'); lights.push({ x: (R.ix0 + 3.5) * TILE, y: R.iy0 * TILE, r: 60, c: '#ffd9a0', a: .18 }); box(R, 5, 0, 36, 'armchair', '#76596c'); },
    DIS: R => { box(R, 0, 0, 48, 'easel', '#c2673f'); box(R, 1, 0, 48, 'easel', '#344c3d'); put(Props.table({ w: 2, h: 1, top: '#e0d4c0', items: 4 }), R.ix0 + 3, R.iy0, 2, 1, { room: R.id }); box(R, 6, 0, 32, 'printer'); },
    VENT: R => { box(R, 0, 0, 48, 'board', '#c4d38a'); put(Props.sofa('#73843f', 2, 'S'), R.ix0 + 3, R.iy0, 2, 1, { room: R.id }); box(R, 6, 0, 44, 'cooler'); },
    PAID: R => { box(R, 0, 0, 48, 'board', '#ecd283'); box(R, 3, 0, 34, 'cabinet', '#6b5520'); box(R, 4, 0, 34, 'cabinet', '#6b5520'); box(R, 6, 0, 48, 'board', '#ecd283'); },
    ATC: R => { box(R, 0, 0, 40, 'cabinet', '#9a8f86'); box(R, 1, 0, 40, 'cabinet', '#9a8f86'); box(R, 3, 0, 44, 'cooler'); box(R, 6, 0, 32, 'printer'); },
    AUTO: R => { box(R, 0, 0, 64, 'rack'); box(R, 1, 0, 64, 'rack'); box(R, 6, 0, 64, 'rack'); lights.push({ x: (R.ix0 + 1) * TILE, y: R.iy0 * TILE + 8, r: 64, c: '#6ec6d9', a: .16 }); box(R, 3, 0, 48, 'board', '#6ec6d9'); },
    DEV: R => { box(R, 0, 0, 40, 'crates'); box(R, 1, 0, 40, 'crates'); box(R, 3, 0, 48, 'board', '#86d0c4'); box(R, 6, 0, 32, 'printer'); }
  };
  for (const id in rooms) {
    const R = rooms[id], members = byDept[id] || [];
    if (R.kind === 'dept') {
      if (BACK[id]) BACK[id](R);
      SEATS.forEach(([ix, iy], i) => { const st = addStation(members[i] || null, R, ix, iy, 'N'); if (!members[i]) spare.push(st); });
      plantAt(R, 3, 1, (R.c + R.r) % 2 ? 'small' : 'tall'); plantAt(R, 4, 4);
      if (R.c === 0) plantAt(R, 7, 0); else if (R.c === 2) plantAt(R, 7, 3);
    } else if (R.kind === 'dir') {
      // núcleo: Daniel de cara a su equipo, con mesa de invitados y estanterías
      addStation('daniel', R, 3, 0, 'S');
      put(Props.shelf({ w: 2, seed: 11, wood: '#5a3d28' }), R.ix0 + 0, R.iy0 + 0, 2, 1, { room: id });
      put(Props.shelf({ w: 2, seed: 12, wood: '#5a3d28' }), R.ix0 + 6, R.iy0 + 0, 2, 1, { room: id });
      const ch = Props.chair('#5a3d28');
      for (const ix of [3, 4]) { const gx = (R.ix0 + ix) * TILE + 16, gy = (R.iy0 + 4) * TILE - 7; objects.push({ spr: ch.seat, x: gx - ch.seat.ax, y: gy - ch.seat.ay, key: gy - 6, kind: 'chair' }); objects.push({ spr: ch.back, x: gx - ch.back.ax, y: gy - 3 - ch.back.ay, key: gy + 3, kind: 'chair' }); block(R.ix0 + ix, R.iy0 + 3, 1, 1); }
      box(R, 0, 4, 36, 'armchair', BR.forest); box(R, 7, 4, 46, 'globe');
      box(R, 6, 2, 54, 'lamp', '#e6d3a6'); lights.push({ x: (R.ix0 + 6.5) * TILE, y: (R.iy0 + 2.2) * TILE, r: 90, c: '#ffd9a0', a: .2 });
      plantAt(R, 0, 2, 'tall'); plantAt(R, 7, 2);
    } else if (R.kind === 'meet') {
      put(Props.table({ w: 6, h: 2, top: '#7a5236', items: 6 }), R.ix0 + 1, R.iy0 + 2, 6, 2, { room: id });
      const ch = Props.chair(R.chair);
      for (let i = 0; i < 6; i++) {
        const gx = (R.ix0 + 1 + i) * TILE + 16;
        const gyN = (R.iy0 + 2) * TILE - 4; objects.push({ spr: ch.tall, x: gx - ch.tall.ax, y: gyN - 6 - ch.tall.ay, key: gyN - 8, kind: 'chair' }); block(R.ix0 + 1 + i, R.iy0 + 1, 1, 1);
        const gyS = (R.iy0 + 5) * TILE - 7; objects.push({ spr: ch.seat, x: gx - ch.seat.ax, y: gyS - ch.seat.ay, key: gyS - 6, kind: 'chair' }); objects.push({ spr: ch.back, x: gx - ch.back.ax, y: gyS - 3 - ch.back.ay, key: gyS + 3, kind: 'chair' }); block(R.ix0 + 1 + i, R.iy0 + 4, 1, 1);
      }
      box(R, 0, 0, 48, 'board', BR.sand); plantAt(R, 7, 0, 'tall'); box(R, 3, 0, 44, 'cooler');
    } else if (R.kind === 'lounge') {
      put(Props.box(3, 40, 'counter'), R.ix0 + 0, R.iy0 + 0, 3, 1, { room: id });
      box(R, 3, 0, 40, 'coffee'); box(R, 4, 0, 58, 'fridge', '#c9a03a'); box(R, 7, 0, 60, 'vending');
      for (let i = 0; i < 4; i++) pois.coffee.push({ tx: R.ix0 + i, ty: R.iy0 + 1, dir: 'N', x: (R.ix0 + i) * TILE + 16, y: (R.iy0 + 2) * TILE - 8, taken: null });
      put(Props.sofa('#5a6e5d', 3, 'S'), R.ix0 + 0, R.iy0 + 3, 3, 1, { room: id });
      put(Props.table({ w: 1, h: 1, top: '#8d6a4a', items: 1 }), R.ix0 + 1, R.iy0 + 4, 1, 1, { room: id });
      put(Props.sofa('#5a6e5d', 3, 'S'), R.ix0 + 5, R.iy0 + 3, 3, 1, { room: id });
      put(Props.table({ w: 1, h: 1, top: '#8d6a4a', items: 1 }), R.ix0 + 6, R.iy0 + 4, 1, 1, { room: id });
      for (const sx of [0, 5]) for (const k of [0, 2]) pois.sofa.push({ tx: R.ix0 + sx + k, ty: R.iy0 + 4, dir: 'S', x: (R.ix0 + sx + k) * TILE + 16, y: (R.iy0 + 4) * TILE - 6, bias: 10, taken: null });
      box(R, 3, 5, 30, 'bean', '#c2673f'); box(R, 4, 5, 30, 'bean', '#6ec6d9');
      box(R, 5, 0, 54, 'lamp', '#e6d3a6'); lights.push({ x: (R.ix0 + 5.5) * TILE, y: (R.iy0 + 0.3) * TILE, r: 80, c: '#ffd9a0', a: .2 });
    } else if (R.kind === 'recep') {
      put(Props.reception(), R.ix0 + 2, R.iy0 + 1, 4, 1, { room: id });
      put(Props.sofa('#8a775f', 2, 'S'), R.ix0 + 0, R.iy0 + 3, 2, 1, { room: id });
      box(R, 7, 3, 36, 'armchair', BR.forest);
      plantAt(R, 0, 0, 'tall'); plantAt(R, 7, 0, 'tall');
    }
  }
  // plantas en los cruces de pasillos y antorchas en la entrada
  for (let c = 0; c < 2; c++) for (let r = 0; r < ROWS - 1; r++) {
    const x = M + ZW + c * (ZW + GAP), y = TOP + ZH + r * (ZH + GAP);
    put(Props.plant(r % 2 ? 'small' : 'tall', '#3d3028'), x, y, 1, 1, {});
  }
  for (const tx of [entX - 2, entX + 3]) { put(Props.box(1, 40, 'torch'), tx, yBottomWall + 1, 1, 1, {}); lights.push({ x: tx * TILE + 16, y: (yBottomWall + 1) * TILE + 2, r: 70, c: '#ffb15a', a: .32, flicker: true }); }

  objects.sort((a, b) => a.key - b.key);

  /* ---------- muro norte: ventanas, tableros y el logotipo en el centro ---------- */
  const NORTH = [['window', 2.4, {}], ['board', 5.4, { t: 'strategy', accent: '#9fb8cc' }], ['clock', 8.4, {}], ['shelfWall', 9.6, {}], ['window', 19.6, {}], ['board', 22.4, { t: 'mood', accent: '#efc3a4' }], ['poster', 26.4, { accent: '#c2673f' }], ['window', 28.2, {}]];

  /* ---------- capa estática ---------- */
  function phaseNow() { const h = new Date().getHours(); return h >= 8 && h < 19 ? 'day' : (h >= 19 && h < 21) || (h >= 6 && h < 8) ? 'dusk' : 'night'; }
  let logoImg = null;
  function setLogo(img) { logoImg = img; }
  let baseLights = -1;
  function buildStatic(phase) {
    phase = phase || phaseNow();
    if (baseLights < 0) baseLights = lights.length; else lights.length = baseLights;
    wallItems.length = 0; clocks.length = 0;
    const [c, x] = cvs(W * TILE, H * TILE), g = new Pen(x);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const t = tt[idx(i, j)], rid = roomAt[idx(i, j)], px = i * TILE, py = j * TILE;
      if (t === T.ROCK) x.drawImage(FloorArt.get('rock', '#2a211b', i, j), px, py);
      else if (t === T.COR) x.drawImage(FloorArt.get('stone16', '#d6c8ad', i, j), px, py);
      else if (t === T.PORCH) x.drawImage(FloorArt.get('gravel', '#7d6a55', i, j), px, py);
      else if (t === T.FLOOR) { const R = ROOMS[rid]; x.drawImage(FloorArt.get(R.floor[0], R.floor[1], i, j), px, py); }
      else if (t === T.CAP) x.drawImage(WallArt.cap(Math.floor(hash2(i, j, 3) * 3)), px, py);
    }
    // muro norte continuo
    WallArt.face(x, TILE, TILE, W - 2, '#5a4636', BR.sand, 7);
    x.fillStyle = 'rgba(20,12,8,.22)'; x.fillRect(TILE, 3 * TILE, (W - 2) * TILE, 6);
    for (const [kind, col, o] of NORTH) {
      const dy = kind === 'window' ? 9 : kind === 'clock' ? 12 : kind === 'board' ? 12 : kind === 'shelfWall' ? 16 : 13;
      const px = col * TILE, py = TILE + dy;
      const opt = Object.assign({ accent: BR.sand }, o);
      if (kind === 'window') { opt.night = phase === 'night'; opt.sky = phase === 'day' ? ['#9fcfe3', '#dcf0f6'] : phase === 'dusk' ? ['#e59a6b', '#f3d2a4'] : ['#162238', '#2b3a58']; if (phase === 'day') wallItems.push({ x: px + 20, y: py + 50 }); }
      Props.wallDecor(x, kind, px, py, opt);
      if (kind === 'clock') clocks.push({ x: px + 6, y: py + 6 });
    }
    // cada espacio: borde, sombra suave, tinte y rótulo pintado en el suelo
    const rug = (R, ix, iy, w, h, col, border) => { const px = (R.ix0 + ix) * TILE + 6, py = (R.iy0 + iy) * TILE + 6, pw = w * TILE - 12, ph = h * TILE - 12; g.r(px, py, pw, ph, border); g.r(px + 3, py + 3, pw - 6, ph - 6, col); g.r(px + 6, py + 6, pw - 12, 1, shade(col, .12)); };
    for (const id in rooms) {
      const R = rooms[id], px = R.rx * TILE, py = R.ry * TILE, pw = ZW * TILE, ph = ZH * TILE;
      x.fillStyle = rgba(R.accent, .06); x.fillRect(px, py, pw, ph);
      x.fillStyle = 'rgba(20,12,8,.18)'; x.fillRect(px + 2, py + ph, pw, 4); x.fillRect(px + pw, py + 2, 4, ph);
      x.strokeStyle = shade(R.wall, -.15); x.lineWidth = 3; x.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);
      x.strokeStyle = rgba(R.accent, .65); x.lineWidth = 1; x.strokeRect(px + 4.5, py + 4.5, pw - 9, ph - 9);
      // rótulo del espacio en el pasillo, debajo de la zona (como señalética de suelo)
      const label = R.short.toUpperCase(), lw = Math.max(56, label.length * 7 + 14), lx = px + pw / 2 - lw / 2, ly = py + ph + 8;
      g.r(lx, ly, lw, 15, shade(R.wall, -.2)); g.r(lx + 1, ly + 1, lw - 2, 13, R.wall); g.r(lx + 1, ly + 1, lw - 2, 1, shade(R.wall, .2));
      x.save(); x.fillStyle = BR.beige; x.font = '700 10px "Pixelify Sans","Courier New",monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, px + pw / 2, ly + 8); x.restore();
    }
    rug(rooms.DIR, 1, 1, 6, 5, BR.forest, BR.sand);
    rug(rooms.LOUNGE, 0, 2, 8, 4, '#8a5a3c', '#c9a96a');
    rug(rooms.RECEP, 1, 3, 6, 3, BR.forest, BR.beige);
    // logotipo en el centro del muro norte, sobre el núcleo
    const rx = (rooms.DIR.rx + ZW / 2) * TILE, ry = TILE + 18;
    const pb = logoImg ? BR.beige : BR.forest;
    g.r(rx - 76, ry - 2, 152, 38, '#2a211b'); g.r(rx - 74, ry, 148, 34, pb); g.r(rx - 74, ry, 148, 1, shade(pb, .2)); g.r(rx - 74, ry + 33, 148, 1, shade(pb, -.2));
    if (logoImg) { try { const s = Math.min(136 / logoImg.width, 28 / logoImg.height); x.imageSmoothingEnabled = true; x.drawImage(logoImg, rx - logoImg.width * s / 2, ry + 17 - logoImg.height * s / 2, logoImg.width * s, logoImg.height * s); x.imageSmoothingEnabled = false; } catch (e) { } }
    else { x.save(); x.fillStyle = BR.beige; x.font = '700 13px "Pixelify Sans","Courier New",monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('LA CUEVA', rx, ry + 17); x.restore(); }
    // umbral de la entrada
    g.r(entX * TILE + 2, yBottomWall * TILE + 10, 60, 12, shade(BR.sand, -.35)); g.r(entX * TILE + 4, yBottomWall * TILE + 12, 56, 8, shade(BR.sand, -.1));
    return c;
  }

  /* ---------- rutas (A* en rejilla, 4 direcciones) ---------- */
  const walk = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !blocked[idx(x, y)];
  function findPath(sx, sy, ex, ey) {
    sx |= 0; sy |= 0; ex |= 0; ey |= 0;
    if (sx === ex && sy === ey) return [];
    if (!walk(ex, ey)) return null;
    const N = W * H, g = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [];
    const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const s = idx(sx, sy); g[s] = 0; push(Math.abs(sx - ex) + Math.abs(sy - ey), s);
    let guard = 0;
    while (heap.length && guard++ < 9000) {
      const cur = pop()[1]; if (closed[cur]) continue; closed[cur] = 1;
      const cx = cur % W, cy = (cur / W) | 0;
      if (cx === ex && cy === ey) { const out = []; let k = cur; while (k !== s) { out.push({ x: k % W, y: (k / W) | 0 }); k = from[k]; } return out.reverse(); }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy; if (!walk(nx, ny)) continue;
        const ni = idx(nx, ny); if (closed[ni]) continue;
        const ng = g[cur] + 1; if (ng < g[ni]) { g[ni] = ng; from[ni] = cur; push(ng + Math.abs(nx - ex) + Math.abs(ny - ey), ni); }
      }
    }
    return null;
  }
  function nearestFree(tx, ty) {
    if (walk(tx, ty)) return { x: tx, y: ty };
    for (let r = 1; r < 6; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (walk(tx + i, ty + j)) return { x: tx + i, y: ty + j };
    return null;
  }
  function roomOf(px, py) { const i = Math.floor(px / TILE), j = Math.floor(py / TILE); if (i < 0 || j < 0 || i >= W || j >= H) return null; const r = roomAt[idx(i, j)]; return rooms[r] ? r : null; }
  /* asigna un puesto libre a un agente nuevo (contrataciones) */
  function assignSpare(agentId, dept) {
    let st = spare.find(s => !s.agentId && s.room === dept) || spare.find(s => !s.agentId);
    if (!st) return null;
    st.agentId = agentId; st.spare = false; stations[agentId] = st; return st;
  }
  const spawn = { x: (rooms.RECEP.ix0 + 4) * TILE, y: (rooms.RECEP.iy0 + 5) * TILE + 20 };
  return { W, H, T, tt, blocked, rooms, objects, stations, spare, pois, lights, clocks, buildStatic, findPath, walk, nearestFree, roomOf, assignSpare, spawn, phaseNow, setLogo, idx };
})();
