import * as T from 'three';
import { box, sphere, cylinder, group, material } from './primitives.js';

// Parametric articulated adults: the existing avatar settings remain the source of truth.
// Parts use shared geometry/material caches, so editing a person does not leak GPU assets.
export function character(look = {}) {
  const p = { skin: '#e7b48c', hair: '#3b2415', top: '#344c3d', pants: '#3d3028', shoes: '#262d27', ...look };
  const root = new T.Group(), body = group(root), head = group(body, 0, 1.63, 0);
  const skin = material(p.skin), hair = material(p.hair), top = material(p.top), pants = material(p.pants), shoes = material(p.shoes, .5);
  box(body, 0, 1.16, 0, .48, .59, .25, top, .08);
  box(body, 0, .86, 0, .4, .14, .24, pants, .05);
  cylinder(body, 0, 1.48, 0, .075, .13, skin);
  sphere(head, 0, 0, 0, .145, .19, .145, skin);
  sphere(head, -.145, -.005, 0, .031, .05, .025, skin);
  sphere(head, .145, -.005, 0, .031, .05, .025, skin);
  sphere(head, 0, -.025, .143, .023, .035, .032, skin);
  for (const x of [-.058, .058]) {
    sphere(head, x, .023, .133, .016, .012, .009, '#332820');
    box(head, x, .059, .128, .047, .009, .01, p.hair, .003);
  }
  box(head, 0, -.09, .128, .048, .009, .012, '#a26f5c', .003);
  if (p.hs !== 'bald') {
    const cap = sphere(head, 0, .102, -.018, .153, p.hs === 'buzz' ? .1 : .13, .147, hair);
    if (p.hs === 'short') { cap.rotation.z = -.12; sphere(head, -.055, .18, .015, .105, .035, .12, hair); }
    if (p.hs === 'long') {
      box(head, 0, -.065, -.105, .31, .42, .15, hair, .065);
      for (const x of [-.148, .148]) box(head, x, -.13, -.012, .075, .4, .15, hair, .035);
    }
    if (p.hs === 'bun') sphere(head, 0, .14, -.15, .085, .085, .07, hair);
    if (p.hs === 'ponytail') { const tail = box(head, 0, -.03, -.18, .09, .35, .09, hair, .035); tail.rotation.x = .25; }
    if (p.hs === 'curly') for (let i = 0; i < 11; i++) {
      const a = i / 11 * Math.PI * 2;
      sphere(head, Math.sin(a) * .12, .1 + i % 2 * .06, Math.cos(a) * .1, .075, .075, .07, hair);
    }
  }
  if (p.face === 'beard' || p.face === 'stubble') {
    for (const x of [-.09, .09]) box(head, x, -.078, .103, .075, .12, .055, hair, .025);
    box(head, 0, -.126, .094, .16, p.face === 'beard' ? .09 : .035, .075, hair, .025);
  }
  if (p.face === 'stache' || p.face === 'beard') box(head, 0, -.056, .145, .08, .019, .015, hair, .006);
  if (p.acc === 'glasses' || p.acc === 'shades') {
    const frame = material('#343930', .4);
    for (const x of [-.063, .063]) {
      box(head, x, .02, .145, .105, .075, .014, frame, .014);
      if (p.acc !== 'shades') box(head, x, .02, .154, .082, .052, .006, '#a9beb3', .009);
    }
    box(head, 0, .029, .147, .03, .012, .02, frame);
  }
  if (p.acc === 'phones') {
    const c = p.badge || '#b29a7d';
    for (const x of [-.18, .18]) box(head, x, .015, -.015, .055, .14, .1, c, .025);
    box(head, 0, .225, -.02, .36, .035, .06, c, .015);
  }
  if (p.hat) {
    const color = p.hatC || '#344c3d'; sphere(head, 0, .15, -.01, .165, .13, .157, color);
    if (p.hat === 'cap') box(head, 0, .14, .17, .29, .025, .19, color, .02);
    else box(head, 0, .11, 0, .325, .06, .3, color, .025);
  }
  if (p.ts === 'blazer' || p.ts === 'shirt' || p.ts === 'vest') {
    box(body, 0, 1.35, .135, .16, .21, .02, '#eee8da', .018);
    if (p.ts === 'blazer') for (const x of [-.1, .1]) { const lapel = box(body, x, 1.29, .151, .045, .25, .02, p.top, .008); lapel.rotation.z = x > 0 ? -.24 : .24; }
    for (let i = 0; i < 3; i++) sphere(body, .015, 1.19 - i * .09, .14, .008, .008, .008, '#b29a7d');
  }
  if (p.ts === 'turtle') cylinder(body, 0, 1.47, 0, .1, .1, top);
  if (p.ts === 'hoodie') { sphere(body, 0, 1.4, -.13, .19, .13, .08, top); box(body, 0, 1.02, .139, .29, .09, .015, p.top, .025); }
  if (p.ts === 'sweater') box(body, 0, .92, 0, .46, .07, .26, top);
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const arm = group(body, side * .265, 1.38, 0);
    cylinder(arm, 0, -.16, 0, .073, .31, p.ts === 'tee' ? skin : top);
    if (p.ts === 'tee') cylinder(arm, 0, -.065, 0, .081, .16, top);
    sphere(arm, 0, -.31, 0, .066, .07, .068, p.ts === 'tee' ? skin : top);
    const elbow = group(arm, 0, -.31, 0);
    cylinder(elbow, 0, -.13, 0, .052, .25, p.ts === 'tee' ? skin : top);
    sphere(elbow, 0, -.285, 0, .053, .066, .04, skin);
    arms.push({ pivot: arm, elbow });
    const leg = group(body, side * .115, .86, 0);
    cylinder(leg, 0, -.205, 0, .09, .41, pants);
    const knee = group(leg, 0, -.41, 0);
    cylinder(knee, 0, -.19, 0, .072, .38, pants);
    box(knee, 0, -.373, .045, .17, .115, .3, shoes, .04);
    legs.push({ pivot: leg, knee });
  }
  const ring = new T.Mesh(new T.RingGeometry(.4, .44, 36), new T.MeshBasicMaterial({ color: '#344c3d', side: T.DoubleSide, transparent: true, opacity: .9 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .09; ring.visible = false; root.add(ring);
  root.traverse(o => { if (o.isMesh && o !== ring) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, body, head, arms, legs, ring };
}

export function poseCharacter(model, entity, reduced) {
  const sitting = entity.pose === 'sit', walking = entity.pose === 'walk';
  const working = entity.status?.state === 'working' && entity.mode === 'seat';
  const t = entity.t || 0, swing = walking ? Math.sin(t * 9) * .47 : 0;
  model.body.position.y = sitting ? -.29 : walking && !reduced ? Math.abs(Math.sin(t * 9)) * .025 : 0;
  model.body.rotation.y = ({ S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 })[entity.dir] || 0;
  model.head.rotation.x = working && !reduced ? .08 + Math.sin(t * 2) * .015 : 0;
  for (let i = 0; i < 2; i++) {
    const sign = i ? -1 : 1, leg = model.legs[i], arm = model.arms[i];
    leg.pivot.rotation.x = sitting ? -Math.PI / 2 : swing * sign;
    leg.knee.rotation.x = sitting ? Math.PI / 2 : Math.max(0, -swing * sign) * .5;
    arm.pivot.rotation.x = sitting ? -.45 : -swing * sign * .65;
    arm.elbow.rotation.x = sitting ? -.9 + (working && !reduced ? Math.sin(t * 8 + i) * .06 : 0) : -.12;
    arm.pivot.rotation.z = (i ? 1 : -1) * .055;
  }
}
export function disposeCharacter(model) {
  // Meshes use shared primitive caches. Only the private selection ring owns resources.
  model.ring.geometry.dispose(); model.ring.material.dispose(); model.root.removeFromParent();
}
