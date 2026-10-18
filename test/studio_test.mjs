import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Vector3, Group } from 'three';
import { box, sphere, material, mergeStatic } from '../src/studio/primitives.js';
import { character, poseCharacter, disposeCharacter } from '../src/studio/characters.js';
import { studioCamera, groundPoint, projectPoint, screenDirection, fitOffice } from '../src/studio/camera.js';

// Selection and drag must use the same ground projection as the rendered isometric scene.
for (const [w, h] of [[1440, 842], [390, 700]]) for (const z of [.5, 1, 3]) {
  const c = studioCamera(w, h, { x: 500, y: 450, z });
  for (const [x, y] of [[300, 200], [500, 450], [630, 800]]) {
    const p = projectPoint(c, w, h, x, y, 0), back = groundPoint(c, w, h, p.x, p.y);
    assert.ok(Math.abs(back.x - x) < 1e-8 && Math.abs(back.y - y) < 1e-8);
  }
}
const east = screenDirection(1, 0), south = screenDirection(0, 1);
assert.ok(Math.abs(east.x * south.x + east.y * south.y) < 1e-8);
assert.ok(Math.abs(Math.hypot(east.x, east.y) - 1) < 1e-8);
for (const [w, h] of [[1440, 842], [390, 700]]) {
  const world = { W: 33, H: 37 }, state = fitOffice(w, h, world), c = studioCamera(w, h, state);
  for (const x of [0, world.W]) for (const z of [0, world.H]) for (const y of [0, 3.6]) {
    const p = new Vector3(x, y, z).project(c);
    assert.ok(Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1, 'overview must fit the whole office');
  }
}
console.log('✓ studio ground projection, screen controls and desktop/mobile overview');

// Rounded boxes are non-indexed, spheres indexed: both must survive batching.
const furniture = new Group(), color = material('#344c3d');
box(furniture, 1, .5, 0, 1, 1, 1, color); sphere(furniture, -2, 1, 0, .5, .5, .5, color);
let vertices = 0;
furniture.traverse(o => { if (o.isMesh) vertices += o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; });
mergeStatic(furniture);
const merged = furniture.children.filter(o => o.isMesh);
assert.equal(merged.length, 1); assert.equal(merged[0].geometry.attributes.position.count, vertices);
merged[0].geometry.computeBoundingBox();
assert.ok(merged[0].geometry.boundingBox.min.x < -2.4 && merged[0].geometry.boundingBox.max.x > 1.4);
console.log('✓ static batching retains indexed and non-indexed furniture');

const adult = character({ skin: '#a26b45', top: '#344c3d', hs: 'long', acc: 'glasses', face: 'beard' });
poseCharacter(adult, { pose: 'sit', dir: 'N', mode: 'seat', status: { state: 'idle' }, t: 1 }, false);
assert.equal(adult.body.rotation.y, Math.PI);
assert.equal(adult.legs[0].pivot.rotation.x, -Math.PI / 2);
assert.equal(adult.head.rotation.x, 0, 'idle agents must not animate typing');
poseCharacter(adult, { pose: 'sit', dir: 'N', mode: 'seat', status: { state: 'working' }, t: 1 }, false);
assert.ok(adult.head.rotation.x > 0);
poseCharacter(adult, { pose: 'sit', dir: 'S', mode: 'seat', status: { state: 'working' }, t: 1 }, true);
assert.equal(adult.head.rotation.x, 0);
const parent = new Group(); parent.add(adult.root); disposeCharacter(adult); assert.equal(parent.children.length, 0);
console.log('✓ articulated avatars follow real states, reduced motion and removal');

// Exercise the View boundary without WebGL or a real backend. The legacy canvas must
// remain usable when WebGL is unavailable, and screen-relative keys must drive 3D movement.
function viewHarness(use3D) {
  let replacement, raf;
  const listeners = {};
  const canvas = () => ({ dataset: {}, style: {}, width: 0, height: 0,
    getBoundingClientRect: () => ({ width: 390, height: 700 }),
    getContext: kind => kind === '2d' ? {} : null,
    cloneNode: () => (replacement = canvas()), replaceWith() {},
    addEventListener() {}, setPointerCapture() {} });
  const start = canvas();
  const engine = { resize() {}, direction: screenDirection, render() {}, overview: () => ({ x: 500, y: 500, z: .5 }), project() {} };
  const context = vm.createContext({ console, Math, Set, Map,
    requestAnimationFrame: fn => { raf = fn; return 1; },
    window: { devicePixelRatio: 1, LC_STUDIO: { create: () => use3D ? engine : null },
      matchMedia: () => ({ matches: true }), addEventListener: (name, fn) => { listeners[name] = fn; } },
    TILE: 32, PLAYER_LOOK: {}, buildSheet: () => ({}),
    Bus: { emit() {}, on() {} }, lerp: (a, b, t) => a + (b - a) * t, clamp: (n, a, b) => Math.max(a, Math.min(b, n)),
    World: { W: 33, H: 37, rooms: { DIR: { cx: 500, cy: 500 } }, spawn: { x: 500, y: 500 },
      walk: () => true, buildStatic: () => null, phaseNow: () => 'day' }
  });
  const view = vm.runInContext(fs.readFileSync(new URL('../src/50_view.js', import.meta.url), 'utf8') + '\nView;', context);
  view.init(start, {});
  return { view, start, replacement, listeners, frame: ts => raf(ts) };
}
const fallback = viewHarness(false);
assert.ok(fallback.replacement); assert.equal(fallback.replacement.dataset.renderer, 'canvas');
assert.ok(fallback.view._player(), 'unsupported WebGL still initializes the office');
const threeView = viewHarness(true), before = { ...threeView.view._player() };
assert.equal(threeView.replacement, undefined);
threeView.listeners.keydown({ key: 'w', target: {}, preventDefault() {} });
threeView.frame(100); threeView.frame(150);
const after = threeView.view._player();
assert.ok(after.x < before.x && after.y < before.y, 'up on screen moves diagonally on the isometric floor');
threeView.listeners.keyup({ key: 'w' });
threeView.view.cam.z = .24; threeView.view.zoomBy(-1);
assert.ok(threeView.view.cam.z < .24, 'zoom out from a fitted overview must not zoom in');
threeView.view.cam.z = 1.25; threeView.view.zoomBy(1);
assert.equal(threeView.view.cam.z, 1.5);
console.log('✓ compatible canvas fallback and screen-relative keyboard movement');
