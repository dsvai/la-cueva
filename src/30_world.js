/* ============================================================
   LA CUEVA · mapa continuo: salas, pasillos, mobiliario, puestos y rutas
   ============================================================ */
const World = (() => {
  const RW = 12, RH = 10, CW = 3, CH = 3, MX = 4, MT = 4;
  const W = MX * 2 + RW * 4 + CW * 3;          // 65
  const H = MT + RH * 3 + CH * 2 + 3 + 1 + 2;  // 46
  const T = { ROCK: 0, FLOOR: 1, COR: 2, CAP: 3, FACE: 4, PORCH: 5 };
  const tt = new Uint8Array(W * H), blocked = new Uint8Array(W * H), roomAt = new Array(W * H).fill(null);
  const rooms = {}, objects = [], stations = {}, pois = { coffee: [], sofa: [] }, lights = [], screensDecor = [], clocks = [], wallItems = [];
  const idx = (x, y) => y * W + x;
  const setT = (x, y, t, room) => { if (x < 0 || y < 0 || x >= W || y >= H) return; tt[idx(x, y)] = t; roomAt[idx(x, y)] = room || null; blocked[idx(x, y)] = (t === T.FLOOR || t === T.COR || t === T.PORCH) ? 0 : 1; };
  const block = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < W && j < H) blocked[idx(i, j)] = 1; };

  /* ---------- trazado ---------- */
  const corridorRowsY = [];
  ROOM_GRID.forEach((row, r) => row.forEach((id, c) => {
    const rx = MX + c * (RW + CW), ry = MT + r * (RH + CH);
    rooms[id] = Object.assign({ id, rx, ry, r, c, ix0: rx + 1, iy0: ry + 3, door: [rx + 5, ry + RH - 1], cx: (rx + RW / 2) * TILE, cy: (ry + RH / 2 + 1) * TILE }, ROOMS[id]);
  }));
  // pasillos horizontales (debajo de cada fila) y verticales
  for (let r = 0; r < 3; r++) { const y0 = MT + r * (RH + CH) + RH; corridorRowsY.push(y0); for (let y = y0; y < y0 + 3; y++) for (let x = MX; x < W - MX; x++) setT(x, y, T.COR, 'COR'); }
  for (let c = 0; c < 3; c++) { const x0 = MX + RW + c * (RW + CW); for (let y = MT; y < MT + RH * 3 + CH * 2 + 3; y++) for (let x = x0; x < x0 + 3; x++) setT(x, y, T.COR, 'COR'); }
  // salas
  for (const id in rooms) {
    const R = rooms[id];
    for (let y = R.ry; y < R.ry + RH; y++) for (let x = R.rx; x < R.rx + RW; x++) {
      const top = y === R.ry, face = y === R.ry + 1 || y === R.ry + 2, bottom = y === R.ry + RH - 1, side = x === R.rx || x === R.rx + RW - 1;
      if (top || bottom || side) setT(x, y, T.CAP, id); else if (face) setT(x, y, T.FACE, id); else setT(x, y, T.FLOOR, id);
    }
    setT(R.door[0], R.door[1], T.FLOOR, id); setT(R.door[0] + 1, R.door[1], T.FLOOR, id);
  }
  // cerramientos del edificio
  const yBottomWall = MT + RH * 3 + CH * 2 + 3;  // 43
  for (let y = MT - 1; y < yBottomWall; y++) { if (tt[idx(MX, y)] === T.COR) setT(MX - 1, y, T.CAP, 'OUT'); if (tt[idx(W - MX - 1, y)] === T.COR) setT(W - MX, y, T.CAP, 'OUT'); }
  for (let x = MX - 1; x <= W - MX; x++) { if (tt[idx(x, MT)] === T.COR) setT(x, MT - 1, T.CAP, 'OUT'); setT(x, yBottomWall, T.CAP, 'OUT'); }
  const RC = rooms.RECEP, entX = RC.door[0];
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
    const back = { spr: ch.back, x: gx - ch.back.ax, y: gy - 3 - ch.back.ay, key: gy + 3, kind: 'chairback', room: R.id, hideWhenEmpty: false };
    objects.push(back);
    block(tx, ty + 1, 2, 1);
    const st = { agentId, room: R.id, seat: { x: gx, y: gy - 1, dir: 'N' }, stand: { tx: tx + (ix % 2 === 0 ? 0 : 1), ty: ty + 2 }, desk: dk, screens: dk.spr.screens.map(s => ({ x: dk.x + s.x, y: dk.y + s.y, w: s.w, h: s.h })) };
    if (agentId) stations[agentId] = st; else st.spare = true;
    return st;
  }
  const spare = [];
  function plantAt(R, ix, iy, kind) { put(Props.plant(kind || 'small', ['#a86b46', '#8a8f87', '#3d3028', '#c9b79b'][(ix + iy) % 4]), R.ix0 + ix, R.iy0 + iy, 1, 1, { room: R.id }); }

  const byDept = {};
  for (const a of DEFAULT_AGENTS) (byDept[a.dept] = byDept[a.dept] || []).push(a.id);

  for (const id in rooms) {
    const R = rooms[id], members = byDept[id] || [];
    if (R.kind === 'dept') {
      const n = members.length;
      const slotsA = n >= 3 && id !== 'PAID' ? [0, 4, 8] : [1, 7];
      slotsA.forEach((ix, i) => { const st = addStation(members[i] || null, R, ix, 0, 'N'); if (!members[i]) spare.push(st); });
      if (id === 'PAID') { [1, 7].forEach((ix, i) => { const st = addStation(members[2 + i] || null, R, ix, 3, 'N'); if (!members[2 + i]) spare.push(st); }); plantAt(R, 4, 3, 'tall'); plantAt(R, 0, 5); plantAt(R, 9, 5); put(Props.box(1, 34, 'cabinet', '#6b5520'), R.ix0 + 4, R.iy0 + 0, 1, 1, { room: id }); }
      else if (n <= 2) {
        // fila trasera temática + un puesto libre para futuras contrataciones
        const st = addStation(null, R, 4, 3, 'N'); spare.push(st);
        plantAt(R, 0, 5); plantAt(R, 9, 5, 'tall');
        if (id === 'AUTO') { put(Props.box(1, 64, 'rack'), R.ix0 + 0, R.iy0 + 3, 1, 1, { room: id }); put(Props.box(1, 64, 'rack'), R.ix0 + 1, R.iy0 + 3, 1, 1, { room: id }); put(Props.box(1, 64, 'rack'), R.ix0 + 8, R.iy0 + 3, 1, 1, { room: id }); lights.push({ x: (R.ix0 + 1) * TILE, y: (R.iy0 + 3) * TILE, r: 70, c: '#6ec6d9', a: .16 }); }
        if (id === 'MKT') { put(Props.box(1, 48, 'board', '#9fb8cc'), R.ix0 + 0, R.iy0 + 3, 1, 1, { room: id }); put(Props.table({ w: 2, h: 1, top: '#c39a6b', items: 3 }), R.ix0 + 7, R.iy0 + 3, 2, 1, { room: id }); put(Props.box(1, 46, 'globe'), R.ix0 + 4, R.iy0 + 0, 1, 1, { room: id, noBlock: false }); }
        if (id === 'VENT') { put(Props.sofa('#73843f', 2, 'S'), R.ix0 + 7, R.iy0 + 3, 2, 1, { room: id }); put(Props.box(1, 48, 'board', '#c4d38a'), R.ix0 + 0, R.iy0 + 3, 1, 1, { room: id }); put(Props.box(1, 44, 'cooler'), R.ix0 + 4, R.iy0 + 0, 1, 1, { room: id }); }
        if (id === 'ATC') { put(Props.box(1, 40, 'cabinet', '#9a8f86'), R.ix0 + 0, R.iy0 + 3, 1, 1, { room: id }); put(Props.box(1, 40, 'cabinet', '#9a8f86'), R.ix0 + 1, R.iy0 + 3, 1, 1, { room: id }); put(Props.box(1, 32, 'printer'), R.ix0 + 8, R.iy0 + 3, 1, 1, { room: id }); put(Props.box(1, 44, 'cooler'), R.ix0 + 4, R.iy0 + 0, 1, 1, { room: id }); }
      } else {
        plantAt(R, 9, 5, 'tall'); plantAt(R, 0, 5);
        if (id === 'DEV') { put(Props.box(1, 40, 'crates'), R.ix0 + 0, R.iy0 + 3, 1, 1, { room: id }); put(Props.box(1, 40, 'crates'), R.ix0 + 1, R.iy0 + 3, 1, 1, { room: id }); put(Props.table({ w: 2, h: 1, top: '#8b6d52', items: 3 }), R.ix0 + 5, R.iy0 + 3, 2, 1, { room: id }); put(Props.box(1, 32, 'printer'), R.ix0 + 9, R.iy0 + 3, 1, 1, { room: id }); }
        if (id === 'DIS') { put(Props.box(1, 48, 'easel', '#c2673f'), R.ix0 + 0, R.iy0 + 3, 1, 1, { room: id }); put(Props.box(1, 48, 'easel', '#344c3d'), R.ix0 + 1, R.iy0 + 3, 1, 1, { room: id }); put(Props.table({ w: 3, h: 1, top: '#e0d4c0', items: 5 }), R.ix0 + 4, R.iy0 + 3, 3, 1, { room: id }); put(Props.box(1, 32, 'printer'), R.ix0 + 9, R.iy0 + 3, 1, 1, { room: id }); }
        if (id === 'CONT') { put(Props.shelf({ w: 2, seed: 3 }), R.ix0 + 0, R.iy0 + 3, 2, 1, { room: id }); put(Props.box(1, 36, 'armchair', '#76596c'), R.ix0 + 7, R.iy0 + 4, 1, 1, { room: id }); put(Props.box(1, 54, 'lamp', '#e6d3a6'), R.ix0 + 8, R.iy0 + 3, 1, 1, { room: id }); lights.push({ x: (R.ix0 + 8.5) * TILE, y: (R.iy0 + 3) * TILE, r: 64, c: '#ffd9a0', a: .2 }); put(Props.table({ w: 2, h: 1, top: '#a8835e', items: 2 }), R.ix0 + 4, R.iy0 + 3, 2, 1, { room: id }); }
      }
    } else if (R.kind === 'dir') {
      addStation('daniel', R, 4, 0, 'S');
      put(Props.shelf({ w: 2, seed: 11, wood: '#5a3d28' }), R.ix0 + 0, R.iy0 + 0, 2, 1, { room: id });
      put(Props.shelf({ w: 2, seed: 12, wood: '#5a3d28' }), R.ix0 + 8, R.iy0 + 0, 2, 1, { room: id });
      const ch = Props.chair('#5a3d28');
      for (const ix of [4, 5]) { const gx = (R.ix0 + ix) * TILE + 16, gy = (R.iy0 + 4) * TILE - 7; objects.push({ spr: ch.seat, x: gx - ch.seat.ax, y: gy - ch.seat.ay, key: gy - 6, kind: 'chair' }); objects.push({ spr: ch.back, x: gx - ch.back.ax, y: gy - 3 - ch.back.ay, key: gy + 3, kind: 'chair' }); block(R.ix0 + ix, R.iy0 + 3, 1, 1); }
      put(Props.box(1, 36, 'armchair', BR.forest), R.ix0 + 0, R.iy0 + 4, 1, 1, { room: id });
      put(Props.box(1, 46, 'globe'), R.ix0 + 9, R.iy0 + 4, 1, 1, { room: id });
      put(Props.box(1, 54, 'lamp', '#e6d3a6'), R.ix0 + 7, R.iy0 + 0, 1, 1, { room: id }); lights.push({ x: (R.ix0 + 7.5) * TILE, y: (R.iy0 + 0.2) * TILE, r: 80, c: '#ffd9a0', a: .22 });
      plantAt(R, 2, 0, 'tall'); plantAt(R, 9, 2); plantAt(R, 0, 2);
    } else if (R.kind === 'meet') {
      put(Props.table({ w: 6, h: 2, top: '#7a5236', items: 6 }), R.ix0 + 2, R.iy0 + 2, 6, 2, { room: id });
      const ch = Props.chair(R.chair);
      for (let i = 0; i < 6; i++) {
        const gx = (R.ix0 + 2 + i) * TILE + 16;
        const gyN = (R.iy0 + 2) * TILE - 4; objects.push({ spr: ch.tall, x: gx - ch.tall.ax, y: gyN - 6 - ch.tall.ay, key: gyN - 8, kind: 'chair' }); block(R.ix0 + 2 + i, R.iy0 + 1, 1, 1);
        const gyS = (R.iy0 + 5) * TILE - 7; objects.push({ spr: ch.seat, x: gx - ch.seat.ax, y: gyS - ch.seat.ay, key: gyS - 6, kind: 'chair' }); objects.push({ spr: ch.back, x: gx - ch.back.ax, y: gyS - 3 - ch.back.ay, key: gyS + 3, kind: 'chair' }); block(R.ix0 + 2 + i, R.iy0 + 4, 1, 1);
      }
      plantAt(R, 0, 0, 'tall'); plantAt(R, 9, 0, 'tall'); plantAt(R, 0, 5); plantAt(R, 9, 5);
      put(Props.box(1, 44, 'cooler'), R.ix0 + 9, R.iy0 + 2, 1, 1, { room: id });
    } else if (R.kind === 'lounge') {
      put(Props.box(3, 40, 'counter'), R.ix0 + 0, R.iy0 + 0, 3, 1, { room: id });
      put(Props.box(1, 40, 'coffee'), R.ix0 + 3, R.iy0 + 0, 1, 1, { room: id });
      put(Props.box(1, 58, 'fridge', '#c9a03a'), R.ix0 + 4, R.iy0 + 0, 1, 1, { room: id });
      put(Props.box(1, 60, 'vending'), R.ix0 + 9, R.iy0 + 0, 1, 1, { room: id });
      for (let i = 0; i < 4; i++) pois.coffee.push({ tx: R.ix0 + i, ty: R.iy0 + 1, dir: 'N', x: (R.ix0 + i) * TILE + 16, y: (R.iy0 + 2) * TILE - 8, taken: null });
      for (const sx of [1, 6]) {
        put(Props.sofa('#5a6e5d', 3, 'S'), R.ix0 + sx, R.iy0 + 2, 3, 1, { room: id });
        put(Props.table({ w: 1, h: 1, top: '#8d6a4a', items: 1 }), R.ix0 + sx + 1, R.iy0 + 3, 1, 1, { room: id });
        for (const k of [0, 2]) pois.sofa.push({ tx: R.ix0 + sx + k, ty: R.iy0 + 3, dir: 'S', x: (R.ix0 + sx + k) * TILE + 16, y: (R.iy0 + 3) * TILE - 6, bias: 10, taken: null });
      }
      put(Props.box(1, 30, 'bean', '#c2673f'), R.ix0 + 4, R.iy0 + 5, 1, 1, { room: id });
      put(Props.box(1, 30, 'bean', '#6ec6d9'), R.ix0 + 5, R.iy0 + 5, 1, 1, { room: id });
      plantAt(R, 0, 5, 'tall'); plantAt(R, 9, 5, 'tall');
      put(Props.box(1, 54, 'lamp', '#e6d3a6'), R.ix0 + 5, R.iy0 + 0, 1, 1, { room: id }); lights.push({ x: (R.ix0 + 5.5) * TILE, y: (R.iy0 + 0.3) * TILE, r: 86, c: '#ffd9a0', a: .2 });
    } else if (R.kind === 'recep') {
      put(Props.reception(), R.ix0 + 3, R.iy0 + 1, 4, 1, { room: id });
      put(Props.sofa('#8a775f', 2, 'S'), R.ix0 + 0, R.iy0 + 3, 2, 1, { room: id });
      put(Props.box(1, 36, 'armchair', BR.forest), R.ix0 + 8, R.iy0 + 3, 1, 1, { room: id });
      put(Props.box(1, 36, 'armchair', BR.forest), R.ix0 + 9, R.iy0 + 3, 1, 1, { room: id });
      plantAt(R, 0, 0, 'tall'); plantAt(R, 9, 0, 'tall'); plantAt(R, 0, 5); plantAt(R, 9, 5);
    }
  }
  // pasillos: plantas en cruces y antorchas en la entrada
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) {
    const x = MX + RW + c * (RW + CW), y = corridorRowsY[r];
    put(Props.plant('tall', '#3d3028'), x, y, 1, 1, {});
    put(Props.plant('small', '#8a775f'), x + 2, y + 2, 1, 1, {});
  }
  for (const tx of [entX - 2, entX + 3]) { put(Props.box(1, 40, 'torch'), tx, yBottomWall + 1, 1, 1, {}); lights.push({ x: tx * TILE + 16, y: (yBottomWall + 1) * TILE + 2, r: 70, c: '#ffb15a', a: .32, flicker: true }); }

  objects.sort((a, b) => a.key - b.key);

  /* ---------- decoración de pared ---------- */
  const DECOR = {
    DIR: [['painting', 1.1, {}], ['window', 6.6, { w: 40 }], ['clock', 9.1, {}]],
    MKT: [['window', 0.6, {}], ['board', 7.4, { t: 'strategy' }], ['clock', 9.3, {}]],
    CONT: [['window', 0.6, {}], ['shelfWall', 7.5, {}], ['poster', 9.0, { accent: '#76596c' }]],
    DIS: [['board', 0.4, { t: 'mood' }], ['window', 7.3, {}], ['poster', 9.2, { accent: '#c2673f' }]],
    VENT: [['board', 0.4, { t: 'ranking' }], ['poster', 7.4, { accent: '#73843f' }], ['clock', 9.3, {}]],
    MEET: [['screen', 2.4, { w: 128 }], ['poster', 0.4, { accent: BR.sand }], ['clock', 9.2, {}]],
    LOUNGE: [['poster', 1.0, { accent: BR.forest }], ['shelfWall', 6.9, {}], ['poster', 9.0, { accent: '#c2673f' }]],
    PAID: [['board', 0.4, { t: 'chart' }], ['board', 7.3, { t: 'kanban' }], ['clock', 9.6, {}]],
    ATC: [['board', 0.4, { t: 'tickets' }], ['clock', 7.4, {}], ['poster', 8.8, { accent: '#ad6c62' }]],
    AUTO: [['board', 0.4, { t: 'flow' }], ['neon', 7.2, { accent: '#6ec6d9', w: 48 }]],
    DEV: [['board', 0.4, { t: 'code' }], ['board', 7.3, { t: 'kanban', accent: '#86d0c4' }]],
    RECEP: [['window', 0.5, {}], ['window', 8.3, {}]]
  };
  function decorPos(R, col, dy) { return [(R.ix0 + col) * TILE, (R.ry + 1) * TILE + dy]; }

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
    // alfombras
    const rug = (R, ix, iy, w, h, col, border) => { const px = (R.ix0 + ix) * TILE + 6, py = (R.iy0 + iy) * TILE + 6, pw = w * TILE - 12, ph = h * TILE - 12; g.r(px, py, pw, ph, border); g.r(px + 3, py + 3, pw - 6, ph - 6, col); g.r(px + 6, py + 6, pw - 12, 1, shade(col, .12)); for (let k = 0; k < pw - 12; k += 6) { g.p(px + 6 + k, py + ph - 8, shade(col, -.15)); } };
    rug(rooms.DIR, 2, 2, 6, 4, BR.forest, BR.sand);
    rug(rooms.LOUNGE, 1, 3, 8, 3, '#8a5a3c', '#c9a96a');
    rug(rooms.RECEP, 3, 3, 4, 3, BR.forest, BR.beige);
    // caras de muro + decoración
    for (const id in rooms) {
      const R = rooms[id];
      WallArt.face(x, (R.rx + 1) * TILE, (R.ry + 1) * TILE, RW - 2, R.wall, R.accent, strSeed(id));
      for (const [kind, col, o] of (DECOR[id] || [])) {
        const dy = kind === 'window' ? 9 : kind === 'clock' ? 12 : kind === 'board' ? 12 : kind === 'screen' ? 10 : kind === 'painting' ? 12 : kind === 'neon' ? 14 : kind === 'shelfWall' ? 16 : 13;
        const [px, py] = decorPos(R, col, dy);
        const opt = Object.assign({ accent: R.accent }, o);
        if (kind === 'window') { opt.night = phase === 'night'; opt.sky = phase === 'day' ? ['#9fcfe3', '#dcf0f6'] : phase === 'dusk' ? ['#e59a6b', '#f3d2a4'] : ['#162238', '#2b3a58']; if (phase !== 'day') lights.push({ x: px + 20, y: py + 40, r: 0, c: '#000', a: 0 }); else wallItems.push({ x: px + 20, y: py + 50 }); }
        Props.wallDecor(x, kind, px, py, opt);
        if (kind === 'clock') clocks.push({ x: px + 6, y: py + 6 });
      }
      // placa con el nombre de la sala (señalética del propio mundo)
      const pw = Math.max(64, Math.min(150, R.short.length * 6 + 16));
      Props.wallDecor(x, 'plaque', (R.rx + RW / 2) * TILE - pw / 2, (R.ry + 1) * TILE + 7, { w: pw, text: R.short, bg: R.wall === BR.forest ? BR.brown : BR.forest });
      // sombra de contacto bajo el muro norte y junto a los laterales
      x.fillStyle = 'rgba(20,12,8,.22)'; x.fillRect((R.rx + 1) * TILE, (R.ry + 3) * TILE, (RW - 2) * TILE, 6);
      x.fillStyle = 'rgba(20,12,8,.14)'; x.fillRect((R.rx + 1) * TILE, (R.ry + 3) * TILE, 5, 6 * TILE); x.fillRect((R.rx + RW - 1) * TILE - 4, (R.ry + 3) * TILE, 4, 6 * TILE);
      // umbral de la puerta
      const [dx, dy2] = R.door; g.r(dx * TILE + 2, dy2 * TILE + 10, 60, 12, shade(R.accent, -.35)); g.r(dx * TILE + 4, dy2 * TILE + 12, 56, 8, shade(R.accent, -.1)); g.r(dx * TILE + 4, dy2 * TILE + 12, 56, 1, shade(R.accent, .2));
      g.r(dx * TILE - 4, dy2 * TILE, 4, 32, '#5a4636'); g.r((dx + 2) * TILE, dy2 * TILE, 4, 32, '#5a4636');
      // tinte suave de cada sala
      x.fillStyle = rgba(R.accent, .045); x.fillRect((R.rx + 1) * TILE, (R.ry + 3) * TILE, (RW - 2) * TILE, 6 * TILE);
    }
    // rótulo de recepción: logotipo oficial si se ha subido; si no, solo el nombre en texto
    const rx = (rooms.RECEP.rx + RW / 2) * TILE, ry = (rooms.RECEP.ry + 1) * TILE + 22;
    const pb = logoImg ? BR.beige : BR.forest;
    g.r(rx - 70, ry - 2, 140, 34, '#2a211b'); g.r(rx - 68, ry, 136, 30, pb); g.r(rx - 68, ry, 136, 1, shade(pb, .2)); g.r(rx - 68, ry + 29, 136, 1, shade(pb, -.2));
    if (logoImg) { try { const s = Math.min(128 / logoImg.width, 26 / logoImg.height); x.imageSmoothingEnabled = true; x.drawImage(logoImg, rx - logoImg.width * s / 2, ry + 15 - logoImg.height * s / 2, logoImg.width * s, logoImg.height * s); x.imageSmoothingEnabled = false; } catch (e) { } }
    else { x.save(); x.fillStyle = BR.beige; x.font = '700 13px "Pixelify Sans","Courier New",monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('LA CUEVA', rx, ry + 15); x.restore(); }
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
  const spawn = { x: (rooms.RECEP.ix0 + 4.5) * TILE, y: (rooms.RECEP.iy0 + 5) * TILE - 6 };
  return { W, H, T, tt, blocked, rooms, objects, stations, spare, pois, lights, clocks, buildStatic, findPath, walk, nearestFree, roomOf, assignSpare, spawn, phaseNow, setLogo, idx };
})();
