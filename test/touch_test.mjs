import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const handlers = new Map(), css = {};
function target(prefix) {
  return { addEventListener: (event, fn) => handlers.set(prefix + event, fn) };
}
const viewport = { height: 450, offsetTop: 20, ...target('viewport:') };
const context = vm.createContext({ Math,
  window: { innerHeight: 844, visualViewport: viewport, ...target('window:') },
  document: { documentElement: { style: { setProperty: (k, v) => { css[k] = v; } } }, ...target('document:') },
  Bus: { on: (k, fn) => handlers.set('bus:' + k, fn) }
});
const controls = vm.runInContext(fs.readFileSync(new URL('../src/45_controls.js', import.meta.url), 'utf8') + '\nTouchControls;', context);
assert.equal(controls.vector(2, 2, 30).x, 0, 'small finger tremor stays in the dead zone');
const diagonal = controls.vector(100, 100, 30);
assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-8);
assert.ok(Math.abs(Math.hypot(diagonal.knobX, diagonal.knobY) - 30) < 1e-8);
assert.ok(controls.vector(15, 0, 30).x < controls.vector(25, 0, 30).x);
console.log('✓ joystick dead zone, analog speed and radial limit');

let captured = null, last;
const button = { ...target('button:'), classList: { add() {}, remove() {} },
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 112, height: 112 }),
  setPointerCapture: id => { captured = id; }, hasPointerCapture: id => captured === id,
  releasePointerCapture: () => { captured = null; }
};
const knob = { offsetWidth: 48, style: {} };
controls.bind(button, knob, (x, y) => { last = [x, y]; });
const event = (pointerId, x = 90, y = 56) => ({ pointerId, pointerType: 'touch', clientX: x, clientY: y, preventDefault() {} });
handlers.get('button:pointerdown')(event(1)); assert.equal(captured, 1); assert.ok(last[0] > 0);
handlers.get('button:pointerdown')(event(2, 0)); assert.equal(captured, 1, 'ignore a second finger');
handlers.get('button:pointermove')(event(1, 200)); assert.ok(last[0] <= 1);
handlers.get('button:pointercancel')(event(1)); assert.deepEqual(last, [0, 0]); assert.equal(captured, null);
for (const reset of ['window:blur', 'document:visibilitychange', 'bus:ui:overlay', 'window:orientationchange']) {
  handlers.get('button:pointerdown')(event(1)); handlers.get(reset)(); assert.deepEqual(last, [0, 0]);
}
assert.equal(knob.style.transform, 'translate(0px,0px)');
console.log('✓ joystick capture, multitouch cancellation and safe stop across menus');

controls.viewport();
assert.equal(css['--app-height'], '450px'); assert.equal(css['--viewport-top'], '20px'); assert.equal(css['--viewport-bottom'], '374px');
viewport.height = 844; viewport.offsetTop = 0; handlers.get('viewport:resize')();
assert.equal(css['--app-height'], '844px'); assert.equal(css['--viewport-bottom'], '0px');
console.log('✓ viewport follows mobile keyboard and restores controls above the bottom edge');
