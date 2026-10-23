import * as T from 'three';
import { buildOffice } from './office.js';
import { character, poseCharacter, disposeCharacter } from './characters.js';
import { studioCamera, updateCamera, groundPoint, projectPoint, screenDirection, fitOffice } from './camera.js';

const states = { idle: ['Disponible', '#64835a'], working: ['Trabajando', '#ac7d2e'], collab: ['Colaborando', '#4d827a'], waiting: ['Esperando', '#8b6e9e'], stopped: ['Requiere atención', '#a85c45'] };
let active = null;

/* Estado visible de cada agente, a partir de su estado real (nunca simulado). */
export function emblemOf(status) {
  const st = status || {};
  if (st.state === 'working') return 'work';
  if (st.state === 'waiting') return 'approval';
  if (st.state === 'stopped') return 'stop';
  if (st.state === 'collab') return 'collab';
  if (st.queued) return 'queued';
  if (st.done) return 'done';
  return '';
}
const EMO_TITLE = { work: 'Trabajando', approval: 'Pendiente de tu aprobación', stop: 'Necesita revisión', collab: 'Colaborando', queued: 'Tarea pendiente en cola', done: 'Tarea terminada' };
const EMO_HTML = {
  work: '<span class="emo-dots"><u></u><u></u><u></u></span>',
  done: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  queued: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  approval: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="12" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M9 4.5h6M9 11h6M9 15h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v8" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><circle cx="12" cy="18.5" r="1.9" fill="currentColor"/></svg>',
  collab: '<span class="emo-dots two"><u></u><u></u></span>'
};

/* Pantallas del ordenador: contenido según el estado real del agente. */
const SCREEN = { bg: '#1b2b25', ink: '#efe5d5', dim: '#6f8a7c' };
function drawScreen(sc, mode, kind, t) {
  const x = sc.ctx, W = sc.canvas.width, H = sc.canvas.height;
  x.fillStyle = mode === 'off' ? '#141b18' : SCREEN.bg; x.fillRect(0, 0, W, H);
  const label = (txt, col) => { x.fillStyle = col; x.font = '700 15px "Instrument Sans",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, W / 2, H - 18); };
  if (mode === 'off') return;
  if (mode === 'standby') {
    x.fillStyle = 'rgba(239,229,213,.16)'; x.font = '700 16px "Instrument Sans",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('LA CUEVA', W / 2, H / 2);
    if (Math.floor(t * 1.2) % 2) { x.fillStyle = '#7fb06a'; x.beginPath(); x.arc(W - 12, H - 12, 3, 0, 7); x.fill(); }
    return;
  }
  if (mode === 'work') {
    // barra de título y contenido que avanza según el oficio
    x.fillStyle = '#2c4238'; x.fillRect(0, 0, W, 14); for (let i = 0; i < 3; i++) { x.fillStyle = ['#c2673f', '#e6c76a', '#7fb06a'][i]; x.beginPath(); x.arc(9 + i * 9, 7, 2.6, 0, 7); x.fill(); }
    const k = kind || 'text';
    if (k === 'code') { for (let i = 0; i < 8; i++) { const w = 30 + ((i * 53 + Math.floor(t * 3) * 17) % 110); x.fillStyle = ['#7fc9be', '#e6c76a', '#c9a7b8', '#efe5d5'][i % 4]; x.fillRect(10 + (i % 3) * 10, 20 + i * 11, Math.min(w, W - 30), 5); } }
    else if (k === 'chart') { const n = 9; for (let i = 0; i < n; i++) { const h = 12 + (Math.sin(t * 1.6 + i * .8) * .5 + .5) * 62; x.fillStyle = i === n - 1 ? '#e6c76a' : '#6fa088'; x.fillRect(14 + i * 19, H - 10 - h, 13, h); } }
    else if (k === 'design') { x.fillStyle = '#efe5d5'; x.fillRect(12, 20, W - 24, H - 30); x.fillStyle = '#c2673f'; x.beginPath(); x.arc(40 + (Math.sin(t) * .5 + .5) * (W - 80), 52, 14, 0, 7); x.fill(); x.fillStyle = '#344c3d'; x.fillRect(22, H - 24, (t * 40) % (W - 44), 6); }
    else if (k === 'flow') { const pts = [[30, 36], [W - 40, 40], [W / 2, H - 22]]; x.strokeStyle = '#6ec6d9'; x.lineWidth = 2; x.beginPath(); x.moveTo(...pts[0]); x.lineTo(...pts[1]); x.lineTo(...pts[2]); x.closePath(); x.stroke(); for (const [a, b] of pts) { x.fillStyle = '#4f5392'; x.fillRect(a - 9, b - 7, 18, 14); } const u = (t * .6) % 1, i = Math.floor(u * 3), f = u * 3 - i, A = pts[i], B = pts[(i + 1) % 3]; x.fillStyle = '#ffe2a0'; x.beginPath(); x.arc(A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, 4, 0, 7); x.fill(); }
    else if (k === 'sheet') { const row = Math.floor(t * 2) % 7; for (let j = 0; j < 7; j++) for (let i = 0; i < 4; i++) { x.fillStyle = j === row ? '#c4d38a' : (j === 0 ? '#4c6458' : '#33473e'); x.fillRect(10 + i * 44, 20 + j * 12, 40, 9); } }
    else if (k === 'chat') { for (let i = 0; i < 5; i++) { const left = (i + Math.floor(t)) % 2; x.fillStyle = left ? '#efb2a8' : '#efe5d5'; const w = 70 + (i * 23) % 40; x.fillRect(left ? 10 : W - 10 - w, 20 + i * 17, w, 11); } }
    else { for (let i = 0; i < 7; i++) { x.fillStyle = i === 0 ? '#e6c76a' : '#c9bfae'; const w = i === 6 ? (t * 60) % (W - 30) : W - 30 - (i % 3) * 22; x.fillRect(14, 22 + i * 12, w, 5); } }
    if (Math.floor(t * 2.5) % 2) { x.fillStyle = '#efe5d5'; x.fillRect(W - 16, H - 14, 6, 9); }
    return;
  }
  const icon = { done: ['#7fb06a', '✓', 'Terminada'], queued: ['#e6b24a', '⧗', 'En cola'], approval: ['#c79be0', '?', 'Tu aprobación'], stop: ['#d0614a', '!', 'Revisar'], collab: ['#6ec6d9', '⇄', 'Colaborando'] }[mode];
  if (!icon) return;
  const pulse = mode === 'done' ? 1 : .85 + Math.sin(t * 4) * .15;
  x.fillStyle = icon[0]; x.globalAlpha = .18; x.beginPath(); x.arc(W / 2, 42, 34 * pulse, 0, 7); x.fill(); x.globalAlpha = 1;
  x.beginPath(); x.arc(W / 2, 42, 24, 0, 7); x.fill();
  x.save(); x.translate(W / 2, 43); if (mode === 'queued') x.rotate(Math.floor(t / 1.5) % 2 ? Math.PI : 0);
  x.fillStyle = SCREEN.bg; x.font = '800 28px "Instrument Sans",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(icon[1], 0, 1); x.restore();
  label(icon[2], icon[0]);
}

function softwareGL(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch (_) { return false; }
}

function create(canvas, world, callbacks) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'low-power' });
  if (!gl) return null;
  // Without hardware acceleration (SwiftShader, llvmpipe…) the 3D render blocks the page
  // for seconds per frame: use the 2D office instead. «?3d=1» forces 3D for testing.
  if (softwareGL(gl) && !/[?&]3d=1\b/.test(location.search)) { console.warn('WebGL por software: se usa la oficina 2D.'); return null; }
  const renderer = new T.WebGLRenderer({ canvas, context: gl, antialias: true });
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
  const scene = new T.Scene(); scene.background = new T.Color('#d7cbb6');
  scene.add(new T.HemisphereLight('#fff4dc', '#89917f', 2.3));
  const key = new T.DirectionalLight('#fff0d4', 3.1); key.position.set(-7, 24, 2); key.target.position.set(16, 0, 18);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
  key.shadow.bias = -.0003; key.shadow.normalBias = .025; key.shadow.radius = 3;
  scene.add(key, key.target);
  const fill = new T.DirectionalLight('#dce7df', 1.2); fill.position.set(22, 16, 32); scene.add(fill);
  // Large matte ground receives the office silhouette and leaves no black void around it.
  const ground = new T.Mesh(new T.PlaneGeometry(240, 240), new T.MeshStandardMaterial({ color: '#d7cbb6', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(16, -.65, 18); ground.receiveShadow = true; scene.add(ground);
  const office = buildOffice(scene, world), models = new Map(), labels = new Map();
  let width = 1, height = 1, frame = 0, lost = false;
  const camera = studioCamera(1, 1, { x: 0, y: 0, z: 1 }), ray = new T.Raycaster();
  const overlay = document.createElement('div'); overlay.className = 'studio-labels'; canvas.parentElement.append(overlay);
  const caption = document.createElement('div'); caption.className = 'studio-caption';
  const title = document.createElement('strong'); title.textContent = 'LA CUEVA';
  const hint = document.createElement('span'); hint.textContent = 'Estudio isométrico · Arrastra para explorar';
  caption.append(title, hint); canvas.parentElement.append(caption);
  canvas.dataset.renderer = 'webgl';
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; caption.classList.add('studio-error'); hint.textContent = 'Vista 3D interrumpida. Recuperando…'; });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; caption.classList.remove('studio-error'); hint.textContent = 'Estudio isométrico · Arrastra para explorar'; });

  function resize(w, h, dpr) {
    width = Math.max(1, w); height = Math.max(1, h);
    renderer.setPixelRatio(Math.min(width < 700 ? 1.5 : 2, dpr)); renderer.setSize(width, height, false);
    const resolution = width < 700 ? 1024 : 2048;
    if (key.shadow.mapSize.x !== resolution) { key.shadow.mapSize.set(resolution, resolution); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } }
  }
  function syncModel(e) {
    const fingerprint = JSON.stringify(e.P);
    let m = models.get(e.id);
    if (m?.fingerprint === fingerprint) return m;
    if (m) disposeCharacter(m);
    m = character(e.P); m.fingerprint = fingerprint; m.root.userData.agentId = e.id;
    scene.add(m.root); models.set(e.id, m); return m;
  }
  function label(e, me, show, selected, hover, cam) {
    let b = labels.get(e.id);
    if (!b) {
      b = document.createElement(me ? 'span' : 'button'); b.className = 'studio-person';
      const dot = document.createElement('i'), name = document.createElement('span'), emo = document.createElement('b'); emo.className = 'emo'; emo.hidden = true;
      b.append(dot, name, emo); b._dot = dot; b._name = name; b._emo = emo;
      if (!me) { b.type = 'button'; b.onclick = () => callbacks.onSelect(e.id); b.ondblclick = () => callbacks.onOpenChat(e.id); b.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); callbacks.onOpenChat(e.id); } }; }
      overlay.append(b); labels.set(e.id, b);
    }
    const state = states[e.status?.state] || states.idle;
    const emo = me ? '' : emblemOf(e.status);
    const named = me || selected || hover || (show && cam.z >= .85), visible = named || !!emo;
    if (b._emoKind !== emo) { b._emoKind = emo; b._emo.className = 'emo emo-' + emo; b._emo.innerHTML = EMO_HTML[emo] || ''; b._emo.hidden = !emo; b._emo.title = EMO_TITLE[emo] || ''; }
    b.classList.toggle('icon-only', !named);
    const p = projectPoint(camera, width, height, e.x, e.y, e.pose === 'sit' ? 1.62 : 1.94);
    const text = me ? 'Tú' : e.name;
    if (b._name.textContent !== text) b._name.textContent = text;
    b._dot.style.background = me ? '#b29a7d' : state[1];
    b.title = me ? 'Tu personaje' : `${e.name} · ${e.role} · ${(e.status && e.status.label) || state[0]}`;
    if (!me) b.setAttribute('aria-label', b.title);
    b.hidden = !visible || !p.visible || p.x < 0 || p.x > width || p.y < 0 || p.y > height;
    if (b.hidden) return;
    const half = named ? Math.min(90, Math.max(34, text.length * 3.3 + 15)) : 20;
    const labelX = Math.max(half + 6, Math.min(width - half - 6, p.x)), labelY = Math.max(34, p.y);
    b.style.transform = `translate(${labelX.toFixed(1)}px,${labelY.toFixed(1)}px) translate(-50%,-100%)`;
    b.classList.toggle('selected', selected); b.classList.toggle('me', me);
  }
  function render(cam, ents, player, selected, hover, showNames, reduced, now) {
    if (lost || document.hidden) return;
    updateCamera(camera, width, height, cam);
    const all = [...ents.values(), ...(player ? [player] : [])], keep = new Set(all.map(e => e.id));
    for (const [id, m] of models) if (!keep.has(id)) { disposeCharacter(m); models.delete(id); labels.get(id)?.remove(); labels.delete(id); }
    for (const e of all) {
      const m = syncModel(e); m.root.position.set(e.x / 32, .075, e.y / 32);
      poseCharacter(m, e, reduced);
      m.ring.visible = e.id === selected || e.id === hover || e === player;
      m.ring.material.color.set(e === player ? '#b29a7d' : '#344c3d');
      if (frame % 2 === 0) label(e, e === player, showNames, e.id === selected, e.id === hover, cam);
    }
    const kinds = typeof SCREEN_KIND !== 'undefined' ? SCREEN_KIND : {};
    for (const s of office.screens) {
      const e = ents.get(s.station.agentId);
      let mode = !e ? 'off' : (emblemOf(e.status) || 'standby');
      if (mode === 'work' && e.mode !== 'seat') mode = 'standby';   // trabaja de verdad solo sentado en su puesto
      const live = !reduced && (mode === 'work' || mode === 'queued' || mode === 'approval' || mode === 'stop' || mode === 'collab' || mode === 'standby');
      const every = mode === 'work' ? .12 : mode === 'standby' ? .8 : .25;
      if (s.key !== mode || (live && now - s.drawn > every)) {
        s.key = mode; s.drawn = now;
        drawScreen(s, mode, kinds[s.station.room], now); s.tex.needsUpdate = true;
      }
    }
    renderer.render(scene, camera); frame++;
  }
  function screenToWorld(x, y, cam) { updateCamera(camera, width, height, cam); return groundPoint(camera, width, height, x, y) || { x: cam.x, y: cam.y }; }
  function pick(x, y) {
    ray.setFromCamera({ x: x / width * 2 - 1, y: 1 - y / height * 2 }, camera);
    const candidates = [...models].filter(([id]) => id !== '__me').map(([, m]) => m.root);
    for (const hit of ray.intersectObjects(candidates, true)) {
      let o = hit.object;
      while (o && !o.userData.agentId) o = o.parent;
      if (o) return o.userData.agentId;
    }
    return null;
  }
  const portraits = new Map(), portraitScene = new T.Scene();
  portraitScene.add(new T.HemisphereLight('#fff5e4', '#647261', 2.7));
  const lamp = new T.DirectionalLight('#fff0db', 3); lamp.position.set(-3, 5, 5); portraitScene.add(lamp);
  const portraitCam = new T.OrthographicCamera(-.43, .43, .43, -.43, .1, 20);
  const portraitSize = 256, stride = portraitSize * 4;
  const target = new T.WebGLRenderTarget(portraitSize, portraitSize, { samples: 4 });
  target.texture.colorSpace = T.SRGBColorSpace;
  const pixels = new Uint8Array(portraitSize * stride);
  let previewModel = null, previewKey = null;
  function portrait(look, px = 40, full = false, time = 0) {
    if (lost) return null;
    const id = JSON.stringify(look);
    if (!full && portraits.has(id)) return portraits.get(id);
    if (!previewModel || previewKey !== id) {
      if (previewModel) disposeCharacter(previewModel);
      previewModel = character(look); previewKey = id; portraitScene.add(previewModel.root);
    }
    portraitScene.background = new T.Color(look.bg || '#d8cbb5');
    const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    poseCharacter(previewModel, { pose: full && !reduce ? 'walk' : 'stand', dir: 'S', t: time }, reduce);
    const cowboy = look.hat === 'cowboy';
    const extent = full ? (cowboy ? 1.15 : 1.08) : (cowboy ? .52 : .43);
    Object.assign(portraitCam, { left: -extent, right: extent, top: extent, bottom: -extent });
    const cy = full ? (cowboy ? 1 : .9) : (cowboy ? 1.62 : 1.48);
    portraitCam.position.set(full ? 2.3 : 1.3, cy + .25, 4); portraitCam.lookAt(0, cy, 0); portraitCam.updateProjectionMatrix();
    const previous = renderer.getRenderTarget(), shadowEnabled = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    try {
      renderer.setRenderTarget(target); renderer.render(portraitScene, portraitCam);
      renderer.readRenderTargetPixels(target, 0, 0, portraitSize, portraitSize, pixels);
    } finally { renderer.setRenderTarget(previous); renderer.shadowMap.enabled = shadowEnabled; }
    const c = document.createElement('canvas'); c.width = c.height = portraitSize; const x = c.getContext('2d'), image = x.createImageData(portraitSize, portraitSize);
    for (let y = 0; y < portraitSize; y++) image.data.set(pixels.subarray((portraitSize - 1 - y) * stride, (portraitSize - y) * stride), y * stride);
    x.putImageData(image, 0, 0);
    if (!full) { if (portraits.size >= 100) portraits.delete(portraits.keys().next().value); portraits.set(id, c); }
    return c;
  }
  active = { resize, render, pick, screenToWorld, project: (x, y, e) => projectPoint(camera, width, height, x, y, e), direction: screenDirection, overview: () => fitOffice(width, height, world), portrait };
  return active;
}

window.LC_STUDIO = { create, portrait: (...args) => active?.portrait(...args) || null };
