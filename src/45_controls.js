/* Touch input is screen-relative; View converts it to the office's ground axes. */
const TouchControls = (() => {
  function vector(dx, dy, radius) {
    const distance = Math.hypot(dx, dy), limit = Math.max(1, radius), reach = Math.min(1, distance / limit);
    const strength = Math.max(0, (reach - .12) / .88), nx = distance ? dx / distance : 0, ny = distance ? dy / distance : 0;
    return { x: nx * strength, y: ny * strength, knobX: nx * reach * limit, knobY: ny * reach * limit };
  }
  function bind(button, knob, move) {
    let pointer = null;
    const update = e => {
      const r = button.getBoundingClientRect(), radius = (r.width - knob.offsetWidth) / 2 - 5;
      const v = vector(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2, radius);
      knob.style.transform = `translate(${v.knobX}px,${v.knobY}px)`; move(v.x, v.y);
    };
    const stop = () => {
      const id = pointer; pointer = null;
      if (id != null && button.hasPointerCapture(id)) button.releasePointerCapture(id);
      button.classList.remove('active'); knob.style.transform = 'translate(0px,0px)'; move(0, 0);
    };
    button.addEventListener('pointerdown', e => {
      if (pointer != null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault(); pointer = e.pointerId; button.setPointerCapture(pointer); button.classList.add('active'); update(e);
    });
    button.addEventListener('pointermove', e => { if (e.pointerId === pointer) { e.preventDefault(); update(e); } });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, e => { if (e.pointerId === pointer) stop(); });
    button.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', stop); window.addEventListener('orientationchange', stop);
    document.addEventListener('visibilitychange', stop); Bus.on('ui:overlay', stop);
    return stop;
  }
  function viewport() {
    const v = window.visualViewport;
    const update = () => {
      const height = Math.round(v ? v.height : window.innerHeight), top = Math.round(v ? v.offsetTop : 0);
      const style = document.documentElement.style;
      style.setProperty('--app-height', height + 'px'); style.setProperty('--viewport-top', top + 'px');
      style.setProperty('--viewport-bottom', Math.max(0, window.innerHeight - height - top) + 'px');
    };
    window.addEventListener('resize', update);
    if (v) { v.addEventListener('resize', update); v.addEventListener('scroll', update); }
    update();
  }
  return { vector, bind, viewport };
})();
