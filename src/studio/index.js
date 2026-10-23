import * as T from 'three';
import { buildOffice } from './office.js';
import { character, poseCharacter, disposeCharacter } from './characters.js';
import { studioCamera, updateCamera, groundPoint, projectPoint, screenDirection, fitOffice } from './camera.js';

const states = { idle: ['Disponible', '#64835a'], working: ['Trabajando', '#ac7d2e'], collab: ['Colaborando', '#4d827a'], waiting: ['Esperando', '#8b6e9e'], stopped: ['Requiere atención', '#a85c45'] };
let active = null;

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
      const dot = document.createElement('i'), name = document.createElement('span'); b.append(dot, name);
      if (!me) { b.type = 'button'; b.onclick = () => callbacks.onSelect(e.id); b.ondblclick = () => callbacks.onOpenChat(e.id); b.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); callbacks.onOpenChat(e.id); } }; }
      overlay.append(b); labels.set(e.id, b);
    }
    const state = states[e.status?.state] || states.idle;
    const visible = me || selected || hover || (show && cam.z >= .85);
    const p = projectPoint(camera, width, height, e.x, e.y, e.pose === 'sit' ? 1.62 : 1.94);
    const text = me ? 'Tú' : e.name;
    if (b.lastChild.textContent !== text) b.lastChild.textContent = text;
    b.firstChild.style.background = me ? '#b29a7d' : state[1];
    b.title = me ? 'Tu personaje' : `${e.name} · ${e.role} · ${state[0]}`;
    if (!me) b.setAttribute('aria-label', b.title);
    b.hidden = !visible || !p.visible || p.x < 0 || p.x > width || p.y < 0 || p.y > height;
    if (b.hidden) return;
    const half = Math.min(90, Math.max(34, text.length * 3.3 + 15));
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
    for (const s of office.screens) {
      const e = ents.get(s.station.agentId), working = e?.status?.state === 'working' && e.mode === 'seat';
      s.material.emissiveIntensity = working ? .65 : .08;
      for (let i = 0; i < s.bars.length; i++) {
        const b = s.bars[i]; b.visible = !!s.station.agentId;
        b.scale.y = working && !reduced ? 1 + Math.sin(now * 2 + i) * .15 : 1;
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
