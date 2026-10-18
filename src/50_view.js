/* ============================================================
   LA CUEVA · vista: cámara, dibujo, personajes, tu avatar y entrada
   ============================================================ */
const View = (() => {
  let cv, ctx, studio = null, staticLayer = null, phase = null, dpr = 1, vw = 0, vh = 0;
  const cam = { x: 0, y: 0, z: 2, follow: true, tx: null, ty: null };
  const ents = new Map();               // agentes visibles
  let player = null, selected = null, hover = null;
  const keys = new Set();
  let showNames = true, ambient = true, reduced = false;
  let statusOf = () => ({ state: 'idle' });
  let onSelect = () => { }, onOpenChat = () => { };
  const Z_STEPS = [0.2, 0.35, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
  function clearHover() { if (hover) { hover = null; Bus.emit('view:hover', null); } }

  /* ---------- entidades ---------- */
  function mkEnt(id, P, x, y, dir) {
    return { id, P, sheet: buildSheet(P), x, y, dir: dir || 'S', pose: 'stand', t: Math.random() * 10, path: [], mode: 'seat', wait: 0, sitBias: 0, poi: null, bubble: null, bubbleT: 0 };
  }
  function setAgents(list) {
    const keep = new Set();
    for (const a of list) {
      keep.add(a.id);
      let st = World.stations[a.id];
      if (!st) st = World.assignSpare(a.id, a.dept);
      const e = ents.get(a.id);
      const P = Object.assign({}, a.avatar);
      if (!e) {
        const ne = st ? mkEnt(a.id, P, st.seat.x, st.seat.y, st.seat.dir) : mkEnt(a.id, P, World.spawn.x, World.spawn.y, 'S');
        if (st) { ne.pose = 'sit'; ne.mode = 'seat'; } else ne.mode = 'free';
        ne.name = a.name; ne.role = a.role; ents.set(a.id, ne);
      } else { e.P = P; e.sheet = buildSheet(P); e.name = a.name; e.role = a.role; }
    }
    for (const id of [...ents.keys()]) if (!keep.has(id)) ents.delete(id);
  }

  /* ---------- movimiento ---------- */
  const SPEED = 62;     // px/s de los agentes
  function goTo(e, tx, ty, then) {
    const sx = Math.floor(e.x / TILE), sy = Math.floor((e.y - 4) / TILE);
    const start = World.walk(sx, sy) ? { x: sx, y: sy } : World.nearestFree(sx, sy);
    if (!start) return false;
    const path = World.findPath(start.x, start.y, tx, ty);
    if (!path) return false;
    e.path = path.map(p => ({ x: p.x * TILE + 16, y: p.y * TILE + 26 }));
    if (!World.walk(sx, sy)) e.path.unshift({ x: start.x * TILE + 16, y: start.y * TILE + 26 });
    e.pose = 'walk'; e.then = then || null; e.mode = 'walk';
    return true;
  }
  function stepPath(e, dt) {
    if (!e.path.length) return true;
    const p = e.path[0], dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy), s = SPEED * dt;
    if (Math.abs(dx) > Math.abs(dy)) e.dir = dx > 0 ? 'E' : 'W'; else if (d > 0.5) e.dir = dy > 0 ? 'S' : 'N';
    if (d <= s) { e.x = p.x; e.y = p.y; e.path.shift(); return !e.path.length; }
    e.x += dx / d * s; e.y += dy / d * s; return false;
  }
  function sendHome(e) {
    const st = World.stations[e.id]; if (!st) { e.mode = 'free'; e.pose = 'stand'; return; }
    if (e.poi) { e.poi.taken = null; e.poi = null; }
    e.sitBias = 0;
    goTo(e, st.stand.tx, st.stand.ty, () => { e.slideTo = { x: st.seat.x, y: st.seat.y, dir: st.seat.dir }; });
  }
  function takeBreak(e) {
    const r = Math.random();
    const pool = r < 0.55 ? World.pois.coffee : World.pois.sofa;
    const free = pool.filter(p => !p.taken); if (!free.length) return;
    const poi = free[Math.floor(Math.random() * free.length)];
    poi.taken = e.id; e.poi = poi;
    const ok = goTo(e, poi.tx, poi.ty, () => {
      if (poi.bias) { e.slideTo = { x: poi.x, y: poi.y, dir: poi.dir, sit: true, bias: poi.bias }; }
      else { e.dir = poi.dir; e.pose = 'stand'; }
      e.mode = 'break'; e.wait = poi.bias ? 18 + Math.random() * 20 : 9 + Math.random() * 8;
      e.bubble = poi.bias ? 'pausa' : 'café'; e.bubbleT = 3.5;
    });
    if (!ok) { poi.taken = null; e.poi = null; }
  }
  function visit(e, targetId) {
    const st = World.stations[targetId]; if (!st) return;
    const tx = st.stand.tx + (st.stand.tx % 2 ? -1 : 1), ty = st.stand.ty;
    const spot = World.nearestFree(tx, ty); if (!spot) return;
    if (e.poi) { e.poi.taken = null; e.poi = null; }
    goTo(e, spot.x, spot.y, () => { e.pose = 'stand'; e.dir = 'N'; e.mode = 'visit'; e.visiting = targetId; });
  }

  let lastAmbient = 0;
  function updateAgent(e, dt, now) {
    e.t += dt;
    const S = statusOf(e.id); e.status = S;
    const busyAtDesk = S.state === 'working' || S.state === 'waiting' || S.state === 'stopped';
    // estado real manda: si trabaja, vuelve a su puesto
    if (busyAtDesk && (e.mode === 'break' || e.mode === 'visit' || (e.mode === 'walk' && e.purpose !== 'home'))) { e.purpose = 'home'; sendHome(e); }
    if (S.state === 'collab' && S.with && e.mode === 'seat' && S.visitor && e.visiting !== S.with) { e.purpose = 'visit'; visit(e, S.with); }
    if (S.state !== 'collab' && e.mode === 'visit') { e.visiting = null; e.purpose = 'home'; sendHome(e); }
    if (e.slideTo) {
      const t = e.slideTo, dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy), s = 40 * dt;
      if (d <= s) { e.x = t.x; e.y = t.y; e.dir = t.dir; e.pose = 'sit'; e.sitBias = t.bias || 0; e.slideTo = null; if (!t.sit) { e.mode = 'seat'; e.purpose = null; } }
      else { e.x += dx / d * s; e.y += dy / d * s; }
      return;
    }
    if (e.mode === 'walk') { if (stepPath(e, dt)) { e.pose = 'stand'; e.mode = 'idle'; const f = e.then; e.then = null; if (f) f(); else e.mode = 'free'; } return; }
    if (e.mode === 'break') { e.wait -= dt; if (e.wait <= 0) { e.purpose = 'home'; sendHome(e); } return; }
    if (e.mode === 'seat' && S.state === 'idle' && ambient && !reduced && now - lastAmbient > 2.5) {
      // vida ambiental solo para agentes disponibles: café o sofá, nunca simulan trabajar
      if (Math.random() < dt * 0.012 && [...ents.values()].filter(x => x.mode === 'break' || (x.mode === 'walk' && x.purpose === 'break')).length < 3) { lastAmbient = now; e.purpose = 'break'; takeBreak(e); }
    }
  }

  /* ---------- tu avatar ---------- */
  function updatePlayer(dt) {
    if (!player) return;
    let mx = 0, my = 0;
    if (keys.has('arrowleft') || keys.has('a')) mx -= 1;
    if (keys.has('arrowright') || keys.has('d')) mx += 1;
    if (keys.has('arrowup') || keys.has('w')) my -= 1;
    if (keys.has('arrowdown') || keys.has('s')) my += 1;
    if (pad.x || pad.y) { mx = pad.x; my = pad.y; }
    player.t += dt;
    if (!mx && !my) { player.pose = 'stand'; return; }
    cam.follow = true; cam.tx = null;
    const l = Math.hypot(mx, my); mx /= l; my /= l;
    if (studio) { const d = studio.direction(mx, my); mx = d.x; my = d.y; }
    const sp = 120 * dt * ((pad.x || pad.y) ? Math.min(1, l) : 1);
    if (Math.abs(mx) > Math.abs(my)) player.dir = mx > 0 ? 'E' : 'W'; else player.dir = my > 0 ? 'S' : 'N';
    player.pose = 'walk';
    const free = (x, y) => { const pts = [[x - 7, y - 5], [x + 7, y - 5], [x - 7, y], [x + 7, y]]; return pts.every(([px, py]) => World.walk(Math.floor(px / TILE), Math.floor(py / TILE))); };
    const nx = player.x + mx * sp, ny = player.y + my * sp;
    if (free(nx, player.y)) player.x = nx;
    if (free(player.x, ny)) player.y = ny;
  }
  function nearAgent() {
    if (!player) return null; let best = null, bd = 46;
    for (const e of ents.values()) { const d = Math.hypot(e.x - player.x, e.y - player.y); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  /* ---------- dibujo ---------- */
  function frameFor(e) {
    const dir = e.dir === 'W' ? 'E' : e.dir;
    if (e.pose === 'walk') return { key: 'walk-' + dir, f: Math.floor(e.t * 8) % 4 };
    if (e.pose === 'sit') {
      const working = e.status && e.status.state === 'working' && e.mode === 'seat';
      const key = 'sit-' + (dir === 'E' ? 'E' : dir);
      return { key, f: working ? 1 + (Math.floor(e.t * 6) % 2) : 0 };
    }
    return { key: 'stand-' + dir, f: reduced ? 0 : Math.floor(e.t * 1.6) % 2 };
  }
  function drawEnt(e) {
    const { key, f } = frameFor(e), row = e.sheet.row(key);
    const x = Math.round(e.x), y = Math.round(e.y);
    if (e.pose !== 'sit') { ctx.fillStyle = 'rgba(18,10,6,.3)'; ctx.beginPath(); ctx.ellipse(x, y - 1, 9, 3.5, 0, 0, Math.PI * 2); ctx.fill(); }
    if (e === selected || e === hover) { ctx.strokeStyle = e === selected ? BR.beige : rgba(BR.beige, .55); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, y - 1, 13, 5, 0, 0, Math.PI * 2); ctx.stroke(); }
    if (e.dir === 'W') { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(e.sheet.canvas, f * FR, row * FR, FR, FR, -24, y - FEET, FR, FR); ctx.restore(); }
    else ctx.drawImage(e.sheet.canvas, f * FR, row * FR, FR, FR, x - 24, y - FEET, FR, FR);
  }
  const STATE_COL = { idle: '#7fb06a', working: '#e6b24a', collab: '#6ec6d9', waiting: '#c79be0', stopped: '#d0614a', break: '#b29a7d' };
  function drawTag(e, isPlayer) {
    const x = Math.round(e.x), y = Math.round(e.y) - (e.pose === 'sit' ? 44 : 47);
    const s = e.status || {};
    if (!isPlayer) {
      // icono de estado real sobre la cabeza
      const st = s.state || 'idle';
      if (st === 'working') { for (let i = 0; i < 3; i++) { const on = Math.floor(e.t * 3) % 3 === i; ctx.fillStyle = on ? '#ffe2a0' : '#b08a3e'; ctx.fillRect(x - 5 + i * 4, y - 6, 2, 2); } }
      else if (st === 'waiting') { ctx.fillStyle = '#2a211b'; ctx.fillRect(x - 4, y - 12, 8, 9); ctx.fillStyle = '#c79be0'; ctx.fillRect(x - 3, y - 11, 6, 7); ctx.fillStyle = '#2a211b'; ctx.fillRect(x - 1, y - 10, 2, 3); ctx.fillRect(x - 1, y - 6, 2, 1); }
      else if (st === 'stopped') { ctx.fillStyle = '#2a211b'; ctx.fillRect(x - 4, y - 12, 8, 8); ctx.fillStyle = '#d0614a'; ctx.fillRect(x - 3, y - 11, 6, 6); ctx.fillStyle = '#efe5d5'; ctx.fillRect(x - 2, y - 9, 4, 2); }
      else if (st === 'collab') { ctx.fillStyle = '#2a211b'; ctx.fillRect(x - 6, y - 12, 12, 8); ctx.fillStyle = '#6ec6d9'; ctx.fillRect(x - 5, y - 11, 10, 6); ctx.fillStyle = '#2a211b'; ctx.fillRect(x - 3, y - 9, 2, 2); ctx.fillRect(x + 1, y - 9, 2, 2); }
    }
    if (!(showNames && cam.z >= 1) && e !== selected && e !== hover && !isPlayer) return;
    const label = isPlayer ? 'Tú' : e.name;
    ctx.font = '600 7px "Pixelify Sans","Courier New",monospace';
    const w = Math.ceil(ctx.measureText(label).width) + 8;
    ctx.fillStyle = 'rgba(30,22,17,.82)'; ctx.fillRect(x - w / 2, y + 1, w, 10);
    ctx.fillStyle = isPlayer ? '#f2d38a' : BR.beige; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y + 6.5);
    if (!isPlayer) { ctx.fillStyle = STATE_COL[e.mode === 'break' ? 'break' : (s.state || 'idle')]; ctx.fillRect(x - w / 2 + 2, y + 4, 3, 3); }
  }
  /* pantallas: contenido animado solo si el agente trabaja de verdad */
  function drawScreens(st, now) {
    const e = ents.get(st.agentId), S = e && e.status, working = S && (S.state === 'working') && e.mode === 'seat';
    const kind = SCREEN_KIND[st.room] || 'text';
    for (const r of st.screens) {
      if (!st.agentId) continue;
      if (!working) {   // en espera: pantalla apagada con un piloto
        ctx.fillStyle = 'rgba(70,90,80,.25)'; ctx.fillRect(r.x, r.y, r.w, r.h);
        if (Math.floor(now * 0.8 + r.x) % 3 === 0) { ctx.fillStyle = '#5c7a6a'; ctx.fillRect(r.x + r.w - 3, r.y + r.h - 3, 1, 1); }
        continue;
      }
      ctx.fillStyle = '#1c2b26'; ctx.fillRect(r.x, r.y, r.w, r.h);
      const t = now;
      if (kind === 'code') { for (let i = 0; i < Math.floor(r.h / 3); i++) { const len = 3 + Math.floor(hash2(i, Math.floor(t * 2) + r.x, 1) * (r.w - 6)); ctx.fillStyle = ['#7fc9be', '#e6c76a', '#c9a7b8', '#efe5d5'][i % 4]; ctx.fillRect(r.x + 2 + (i % 3) * 2, r.y + 2 + i * 3, Math.min(len, r.w - 4), 1); } }
      else if (kind === 'chart') { const n = Math.floor(r.w / 4); for (let i = 0; i < n; i++) { const hh = 2 + Math.floor((Math.sin(t * 1.5 + i * 0.9) * 0.5 + 0.5) * (r.h - 5)); ctx.fillStyle = i === n - 1 ? '#e6c76a' : '#6fa088'; ctx.fillRect(r.x + 2 + i * 4, r.y + r.h - 2 - hh, 3, hh); } }
      else if (kind === 'design') { ctx.fillStyle = '#efe5d5'; ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4); ctx.fillStyle = '#c2673f'; ctx.fillRect(r.x + 4 + Math.floor((Math.sin(t) * 0.5 + 0.5) * (r.w - 14)), r.y + 4, 6, 6); ctx.fillStyle = '#344c3d'; ctx.fillRect(r.x + 4, r.y + r.h - 6, Math.floor((t * 6) % (r.w - 8)), 2); }
      else if (kind === 'flow') { const pts = [[3, 3], [r.w - 7, 4], [Math.floor(r.w / 2) - 2, r.h - 7]]; ctx.fillStyle = '#4f5392'; ctx.fillRect(r.x + 5, r.y + 5, r.w - 10, 1); ctx.fillRect(r.x + Math.floor(r.w / 2), r.y + 5, 1, r.h - 10); for (const [px, py] of pts) { ctx.fillStyle = '#6ec6d9'; ctx.fillRect(r.x + px, r.y + py, 4, 3); } const k = Math.floor(t * 8) % (r.w - 10); ctx.fillStyle = '#ffe2a0'; ctx.fillRect(r.x + 5 + k, r.y + 4, 2, 3); }
      else if (kind === 'sheet') { for (let j = 0; j < Math.floor(r.h / 3); j++) for (let i = 0; i < 3; i++) { ctx.fillStyle = (j === Math.floor(t * 2) % Math.floor(r.h / 3)) ? '#c4d38a' : '#3e5248'; ctx.fillRect(r.x + 2 + i * Math.floor((r.w - 4) / 3), r.y + 2 + j * 3, Math.floor((r.w - 4) / 3) - 1, 2); } }
      else if (kind === 'chat') { for (let i = 0; i < 4; i++) { const left = (i + Math.floor(t)) % 2; ctx.fillStyle = left ? '#efb2a8' : '#efe5d5'; ctx.fillRect(r.x + (left ? 2 : r.w - 2 - (r.w * 0.5 | 0)), r.y + 2 + i * 3, r.w * 0.5 | 0, 2); } }
      else { for (let i = 0; i < Math.floor(r.h / 3); i++) { ctx.fillStyle = i === 0 ? '#e6c76a' : '#c9bfae'; const w2 = i === Math.floor(r.h / 3) - 1 ? Math.floor((t * 8) % (r.w - 4)) : r.w - 4 - (i % 3) * 4; ctx.fillRect(r.x + 2, r.y + 2 + i * 3, w2, 1); } }
      ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(r.x, r.y, r.w, 1);
    }
  }
  function drawLights(now) {
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    const night = hour < 7 || hour >= 20 ? 1 : hour < 8.5 ? (8.5 - hour) / 1.5 : hour > 18.5 ? (hour - 18.5) / 1.5 : 0;
    // ambiente general
    ctx.fillStyle = 'rgba(30,20,40,' + (0.05 + night * 0.25).toFixed(3) + ')';
    ctx.fillRect(cam.vx, cam.vy, cam.vw, cam.vh);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const L of World.lights) {
      if (!L.r) continue;
      if (L.x < cam.vx - L.r || L.x > cam.vx + cam.vw + L.r || L.y < cam.vy - L.r || L.y > cam.vy + cam.vh + L.r) continue;
      const a = L.a * (0.6 + night * 0.7) * (L.flicker ? 0.85 + Math.sin(now * 9 + L.x) * 0.1 : 1);
      const g = ctx.createRadialGradient(L.x, L.y, 2, L.x, L.y, L.r);
      g.addColorStop(0, rgba(L.c, a)); g.addColorStop(1, rgba(L.c, 0)); ctx.fillStyle = g; ctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    // brillo de pantallas activas
    for (const st of Object.values(World.stations)) {
      const e = ents.get(st.agentId); if (!e || !e.status || e.status.state !== 'working' || e.mode !== 'seat') continue;
      for (const r of st.screens) { const g = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 1, r.x + r.w / 2, r.y + r.h / 2, 26); g.addColorStop(0, 'rgba(120,200,190,' + (0.12 + night * 0.12).toFixed(3) + ')'); g.addColorStop(1, 'rgba(120,200,190,0)'); ctx.fillStyle = g; ctx.fillRect(r.x - 26, r.y - 26, r.w + 52, r.h + 52); }
    }
    ctx.restore();
  }
  function drawClocks() {
    const d = new Date(), h = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * Math.PI * 2, m = d.getMinutes() / 60 * Math.PI * 2;
    ctx.strokeStyle = '#2a1b14'; ctx.lineWidth = 1;
    for (const c of World.clocks) { ctx.beginPath(); ctx.moveTo(c.x + .5, c.y + .5); ctx.lineTo(c.x + .5 + Math.sin(h) * 2.6, c.y + .5 - Math.cos(h) * 2.6); ctx.moveTo(c.x + .5, c.y + .5); ctx.lineTo(c.x + .5 + Math.sin(m) * 4, c.y + .5 - Math.cos(m) * 4); ctx.stroke(); }
  }

  let lastT = 0, raf = 0, phaseCheck = 0;
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const now = ts / 1000, dt = Math.min(0.05, lastT ? now - lastT : 0.016); lastT = now;
    if (!studio && now - phaseCheck > 30) { phaseCheck = now; const p = World.phaseNow(); if (p !== phase) { phase = p; staticLayer = World.buildStatic(p); } }
    for (const e of ents.values()) updateAgent(e, dt, now);
    updatePlayer(dt);
    // cámara
    if (cam.tx != null) { cam.x = lerp(cam.x, cam.tx, Math.min(1, dt * 5)); cam.y = lerp(cam.y, cam.ty, Math.min(1, dt * 5)); if (Math.hypot(cam.x - cam.tx, cam.y - cam.ty) < 1) cam.tx = null; }
    else if (cam.follow && player) { cam.x = lerp(cam.x, player.x, Math.min(1, dt * 6)); cam.y = lerp(cam.y, player.y - 16, Math.min(1, dt * 6)); }
    clampCam();
    if (studio) {
      studio.render(cam, ents, player, selected && selected.id, hover && hover.id, showNames, reduced, now);
      Bus.emit('view:frame'); return;
    }
    const s = cam.z * dpr;
    cam.vw = vw / cam.z; cam.vh = vh / cam.z; cam.vx = cam.x - cam.vw / 2; cam.vy = cam.y - cam.vh / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#1e1712'; ctx.fillRect(0, 0, cv.width, cv.height);
    const ox = Math.round(-cam.vx * s), oy = Math.round(-cam.vy * s);
    ctx.setTransform(s, 0, 0, s, ox, oy); ctx.imageSmoothingEnabled = false;
    if (staticLayer) {
      const sx = Math.max(0, Math.floor(cam.vx) - 1), sy = Math.max(0, Math.floor(cam.vy) - 1);
      const sw = Math.min(staticLayer.width - sx, Math.ceil(cam.vw) + 3), sh = Math.min(staticLayer.height - sy, Math.ceil(cam.vh) + 3);
      if (sw > 0 && sh > 0) ctx.drawImage(staticLayer, sx, sy, sw, sh, sx, sy, sw, sh);
    }
    drawClocks();
    // objetos y personajes por profundidad
    const people = [...ents.values()].map(e => ({ e, key: e.y + (e.pose === 'sit' ? e.sitBias : 0) }));
    if (player) people.push({ e: player, key: player.y, me: true });
    people.sort((a, b) => a.key - b.key);
    const objs = World.objects; let pi = 0;
    const deskSt = deskIndex();
    const x0 = cam.vx - 80, x1 = cam.vx + cam.vw + 80, y0 = cam.vy - 20, y1 = cam.vy + cam.vh + 90;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      while (pi < people.length && people[pi].key < o.key) { const p = people[pi++]; if (p.e.x > x0 && p.e.x < x1 && p.e.y > y0 && p.e.y < y1) drawEnt(p.e); }
      if (o.x > x1 || o.x + o.spr.c.width < x0 || o.y > y1 || o.y + o.spr.c.height < y0) continue;
      ctx.drawImage(o.spr.c, o.x, o.y);
      const st = deskSt.get(o); if (st) drawScreens(st, now);
    }
    while (pi < people.length) { const p = people[pi++]; drawEnt(p.e); }
    drawLights(now);
    for (const e of ents.values()) if (e.x > x0 && e.x < x1 && e.y > y0 && e.y < y1) drawTag(e, false);
    if (player) drawTag(player, true);
    Bus.emit('view:frame');
  }
  let _deskIdx = null;
  function deskIndex() { if (!_deskIdx) { _deskIdx = new Map(); for (const st of Object.values(World.stations)) _deskIdx.set(st.desk, st); for (const st of World.spare) _deskIdx.set(st.desk, st); } return _deskIdx; }
  function clampCam() {
    if (studio) { cam.x = clamp(cam.x, 0, World.W * TILE); cam.y = clamp(cam.y, 0, World.H * TILE); return; }
    const ww = World.W * TILE, wh = World.H * TILE, hw = vw / cam.z / 2, hh = vh / cam.z / 2;
    cam.x = ww < hw * 2 ? ww / 2 : clamp(cam.x, hw, ww - hw); cam.y = wh < hh * 2 ? wh / 2 : clamp(cam.y, hh, wh - hh);
  }
  function resize() {
    const r = cv.getBoundingClientRect(); dpr = Math.min(3, window.devicePixelRatio || 1);
    vw = r.width; vh = r.height;
    if (studio) studio.resize(vw, vh, dpr);
    else { cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr); }
  }
  function screenToWorld(sx, sy) { return studio ? studio.screenToWorld(sx, sy, cam) : { x: cam.x + (sx - vw / 2) / cam.z, y: cam.y + (sy - vh / 2) / cam.z }; }
  function pick(sx, sy) {
    if (studio) return ents.get(studio.pick(sx, sy)) || null;
    const p = screenToWorld(sx, sy); let best = null, bd = 1e9;
    for (const e of ents.values()) { const cx = e.x, cy = e.y - 20; if (Math.abs(p.x - cx) < 13 && p.y > e.y - 44 && p.y < e.y + 2) { const d = Math.abs(p.y - cy); if (d < bd) { bd = d; best = e; } } }
    return best;
  }
  function zoomBy(dir, sx, sy) {
    clearHover();
    const next = (dir > 0 ? Z_STEPS : [...Z_STEPS].reverse()).find(z => dir > 0 ? z > cam.z + 1e-6 : z < cam.z - 1e-6);
    if (next == null) return;
    if (sx != null) { const before = screenToWorld(sx, sy); cam.z = next; const after = screenToWorld(sx, sy); cam.x += before.x - after.x; cam.y += before.y - after.y; if (dir > 0 || !cam.follow) cam.follow = false; }
    else cam.z = next;
    Bus.emit('view:zoom', cam.z);
  }
  const pad = { x: 0, y: 0 };

  function init(canvas, opts) {
    cv = canvas;
    statusOf = opts.statusOf || statusOf; onSelect = opts.onSelect || onSelect; onOpenChat = opts.onOpenChat || onOpenChat;
    try { studio = window.LC_STUDIO && window.LC_STUDIO.create(cv, World, { onSelect: id => select(id), onOpenChat: id => { select(id); onOpenChat(id); } }); }
    catch (e) { console.warn('Vista 3D no disponible; se conserva el modo compatible.', e); }
    if (!studio) {
      // A canvas that acquired WebGL cannot switch back to 2D; replace it before fallback.
      const replacement = cv.cloneNode(false); cv.replaceWith(replacement); cv = replacement;
      cv.dataset.renderer = 'canvas'; ctx = cv.getContext('2d');
    }
    reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resize(); window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
    phase = World.phaseNow(); if (!studio) staticLayer = World.buildStatic(phase);
    player = mkEnt('__me', PLAYER_LOOK, World.spawn.x, World.spawn.y, 'N'); player.mode = 'player';
    // Estudio: núcleo de dirección en escritorio; móvil: siguiendo a tu personaje.
    if (studio && vw >= 700) { cam.follow = false; cam.x = World.rooms.DIR.cx; cam.y = World.rooms.DIR.cy; cam.z = 1.25; }
    else if (vw >= 700) { cam.follow = false; const mh = World.H * TILE; cam.z = mh <= vh ? 1 : 0.75; cam.x = World.W * TILE / 2; cam.y = Math.min(mh / 2, vh / cam.z / 2 + 4); }
    else { cam.x = player.x; cam.y = player.y - 60; cam.z = 1; }
    // entrada: teclado
    window.addEventListener('keydown', ev => {
      const tg = ev.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return;
      const k = ev.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) { keys.add(k); ev.preventDefault(); }
      else if (k === 'e' || k === 'enter') { const n = nearAgent(); if (n) { select(n.id); onOpenChat(n.id); ev.preventDefault(); } }
      else if (k === '+' || k === '=') zoomBy(1); else if (k === '-') zoomBy(-1);
    });
    window.addEventListener('keyup', ev => keys.delete(ev.key.toLowerCase()));
    window.addEventListener('blur', () => keys.clear());
    Bus.on('ui:overlay', () => { keys.clear(); pad.x = 0; pad.y = 0; clearHover(); });
    // entrada: puntero (arrastrar = mover cámara, clic = seleccionar, rueda/pellizco = zoom)
    const ptrs = new Map(); let drag = null, pinch = null;
    cv.addEventListener('pointerdown', ev => { cv.setPointerCapture(ev.pointerId); ptrs.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY }); if (ptrs.size === 1) drag = { x: ev.offsetX, y: ev.offsetY, cx: cam.x, cy: cam.y, moved: false }; else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; } });
    cv.addEventListener('pointermove', ev => {
      if (ptrs.has(ev.pointerId)) ptrs.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
      if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (d / pinch.d > 1.35) { zoomBy(1); pinch.d = d; } else if (d / pinch.d < 0.74) { zoomBy(-1); pinch.d = d; } return; }
      if (drag) { const dx = ev.offsetX - drag.x, dy = ev.offsetY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true; if (drag.moved) {
        cam.follow = false; cam.tx = null; clearHover();
        if (studio) { const startCam = { x: drag.cx, y: drag.cy, z: cam.z }, a = studio.screenToWorld(drag.x, drag.y, startCam), b = studio.screenToWorld(ev.offsetX, ev.offsetY, startCam); cam.x = drag.cx + a.x - b.x; cam.y = drag.cy + a.y - b.y; }
        else { cam.x = drag.cx - dx / cam.z; cam.y = drag.cy - dy / cam.z; }
      } return; }
      const h = pick(ev.offsetX, ev.offsetY); if (h !== hover) { hover = h; cv.style.cursor = h ? 'pointer' : 'grab'; Bus.emit('view:hover', h ? { id: h.id, x: ev.offsetX, y: ev.offsetY } : null); }
    });
    const end = ev => { ptrs.delete(ev.pointerId); if (ptrs.size < 2) pinch = null; if (drag && !drag.moved && ev.type === 'pointerup') { const h = pick(ev.offsetX, ev.offsetY); select(h ? h.id : null); } drag = null; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', clearHover);
    cv.addEventListener('dblclick', ev => { const h = pick(ev.offsetX, ev.offsetY); if (h) onOpenChat(h.id); });
    cv.addEventListener('wheel', ev => { ev.preventDefault(); zoomBy(ev.deltaY < 0 ? 1 : -1, ev.offsetX, ev.offsetY); }, { passive: false });
    raf = requestAnimationFrame(frame);
  }
  function select(id) { selected = id ? ents.get(id) || null : null; onSelect(id); }
  function focusAgent(id) { const e = ents.get(id); if (!e) return; clearHover(); cam.follow = false; cam.tx = e.x; cam.ty = e.y - 20; if (cam.z < 2) cam.z = 2; select(id); }
  function focusRoom(rid) { const R = World.rooms[rid]; if (!R) return; clearHover(); cam.follow = false; cam.tx = R.cx; cam.ty = R.cy; if (cam.z < 1.5) cam.z = 1.5; }
  function centerMe() { clearHover(); cam.follow = true; cam.tx = null; if (studio && cam.z < 1.25) cam.z = 1.5; }
  function overview() { clearHover(); cam.follow = false; if (studio) { const s = studio.overview(); cam.tx = s.x; cam.ty = s.y; cam.z = s.z; } else { cam.tx = World.W * TILE / 2; cam.ty = World.H * TILE / 2; const fit = Math.min(vw / (World.W * TILE), vh / (World.H * TILE)); cam.z = [...Z_STEPS].reverse().find(z => z <= fit) || Z_STEPS[0]; } Bus.emit('view:zoom', cam.z); }
  function screenPosOf(id) { const e = ents.get(id); if (!e) return null; if (studio) return studio.project(e.x, e.y, e.pose === 'sit' ? 1.62 : 1.94); return { x: (e.x - cam.x) * cam.z + vw / 2, y: (e.y - 46 - cam.y) * cam.z + vh / 2 }; }
  function setPad(x, y) { pad.x = x; pad.y = y; }
  function rebuildStatic() { if (!studio) staticLayer = World.buildStatic(phase); }
  return { init, setAgents, select, focusAgent, focusRoom, centerMe, overview, zoomBy, screenPosOf, setPad, rebuildStatic, get selected() { return selected && selected.id; }, set showNames(v) { showNames = v; }, set ambient(v) { ambient = v; }, cam, ents, _player: () => player };
})();
