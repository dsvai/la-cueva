import * as T from 'three';
import { box, sphere, cylinder, group, material, palette as P, textTexture, woodMaterial, mergeStatic } from './primitives.js';

export function buildOffice(scene, world) {
  const root = new T.Group(); scene.add(root);
  const wood = woodMaterial(), darkWood = material('#694b37'), green = material(P.green);
  const metal = material('#394138', .4), cream = material(P.cream), brass = material(P.brass, .4);
  const screens = [];
  const sizeZ = world.H - 2;
  box(root, world.W / 2, -.3, sizeZ / 2, world.W - 1, .6, sizeZ - 1, '#b6a58d', .16);
  box(root, world.W / 2, -.01, sizeZ / 2, world.W - 1.4, .08, sizeZ - 1.4, '#e1d7c6', .02);
  // Quiet stone joints give scale to the continuous, walkable circulation areas.
  for (let x = 2; x < world.W - 1; x += 2) box(root, x, .036, sizeZ / 2, .012, .003, sizeZ - 1.5, '#cbbfae', 0);
  for (let z = 3; z < sizeZ; z += 2) box(root, world.W / 2, .037, z, world.W - 1.5, .003, .012, '#cbbfae', 0);
  box(root, world.W / 2, 1.75, .8, world.W - 1, 3.5, .2, P.green);
  box(root, .8, 1.75, sizeZ / 2, .2, 3.5, sizeZ - 1, P.green);
  box(root, world.W - .8, .12, sizeZ / 2, .18, .24, sizeZ - 1, P.stone);
  box(root, world.W / 2, .12, sizeZ - .7, world.W - 1, .24, .18, P.stone);
  // Tall window bays, cream reveals and walnut mullions. Cutaway front remains open.
  const sky = new T.MeshBasicMaterial({ color: '#dfe9de' });
  for (const x of [3.2, 8.2, 22.4, 27.6]) {
    box(root, x, 2.1, .94, 3.7, 2.5, .13, P.cream);
    box(root, x, 2.1, 1.04, 3.48, 2.28, .07, sky);
    for (const dx of [-1.72, 0, 1.72]) box(root, x + dx, 2.1, 1.12, .055, 2.35, .09, P.walnut);
    box(root, x, 1.14, 1.13, 3.6, .055, .1, P.walnut);
    box(root, x, .87, 1.18, 3.9, .12, .42, wood);
  }
  for (const z of [5.6, 13.6, 21.6, 29.5]) {
    box(root, .93, 2, z, .13, 2.7, 4.1, P.cream);
    box(root, 1.04, 2, z, .06, 2.5, 3.9, sky);
    for (const dz of [-1.9, 0, 1.9]) box(root, 1.1, 2, z + dz, .09, 2.6, .05, P.walnut);
    box(root, 1.12, .8, z, .35, .1, 4.2, wood);
  }
  const brand = new T.MeshBasicMaterial({ map: textTexture('LA CUEVA', { size: 58, bg: '#344c3d', ink: '#efe5d5', width: 768 }) });
  box(root, 15.5, 2.45, 1.04, 6.8, 1.1, .08, brass);
  box(root, 15.5, 2.45, 1.1, 6.65, .98, .06, brand);
  for (const x of [12.6, 18.4]) cylinder(root, x, 3.45, 2, .035, 1.2, metal);
  for (const x of [12.6, 18.4]) {
    cylinder(root, x, 2.85, 2, .24, .12, P.cream);
    cylinder(root, x, 2.78, 2, .2, .025, new T.MeshBasicMaterial({ color: '#fff2d4' }));
  }

  function plant(x, z, tall = true) {
    const h = tall ? .5 : .25, g = group(root, x, .06, z);
    cylinder(g, 0, h / 2, 0, h * .5, h, P.stone, h * .38);
    cylinder(g, 0, h, 0, h * .43, .03, '#493f2b');
    const seed = Math.abs(Math.sin(x * 12 + z * 9));
    for (let i = 0; i < (tall ? 9 : 5); i++) {
      const angle = i * 2.4 + seed, height = h + .2 + (i % 4) * (tall ? .27 : .08);
      const stem = cylinder(g, Math.sin(angle) * .07, height / 2 + h / 2, Math.cos(angle) * .07, .018, height - h, '#647154');
      stem.rotation.z = Math.sin(angle) * .14;
      const leaf = sphere(g, Math.sin(angle) * .22, height, Math.cos(angle) * .22, tall ? .16 : .12, tall ? .33 : .17, .065, i % 2 ? '#647c54' : '#879b6d');
      leaf.rotation.set(.4 * Math.cos(angle), angle, .6 * Math.sin(angle));
    }
  }
  function shelf(x, z, width = 1.7, height = 1.9) {
    const g = group(root, x, .04, z);
    box(g, 0, height / 2, -.21, width, height, .12, darkWood);
    for (const s of [-1, 1]) box(g, s * (width / 2 - .045), height / 2, 0, .09, height, .54, wood);
    for (let i = 0; i < 4; i++) {
      const y = .08 + i * height / 3;
      box(g, 0, y, 0, width, .065, .54, wood);
      if (i === 3) continue;
      for (let j = 0; j < 8; j++) {
        const bh = .26 + (j * 17 % 9) * .015;
        box(g, -width / 2 + .16 + j * (width - .2) / 8, y + bh / 2 + .04, .04, .09 + j % 2 * .03, bh, .25,
          [P.green, P.cream, '#b29a7d', '#77583e', '#8b9b80'][j % 5], .008);
      }
    }
  }
  function board(x, z, kind) {
    const g = group(root, x, 0, z);
    for (const dx of [-.68, .68]) box(g, dx, .75, 0, .045, 1.5, .05, metal);
    box(g, 0, 1.65, 0, 1.7, 1.05, .065, wood);
    box(g, 0, 1.65, .045, 1.56, .91, .015, cream);
    if (kind === 'DIS') {
      for (let i = 0; i < 5; i++) box(g, -.58 + i * .28, 1.78, .06, .22, .3, .01, [P.green, P.sage, P.brass, '#d5bfa4', '#644937'][i]);
    } else {
      for (let i = 0; i < 5; i++) box(g, -.58 + i * .28, 1.45 + i * .045, .06, .16, .18 + i * .09, .01, i % 2 ? P.sage : P.green);
    }
  }
  function chair(x, z, south = false, color = P.green) {
    const g = group(root, x, 0, z); if (south) g.rotation.y = Math.PI;
    cylinder(g, 0, .3, 0, .055, .48, metal);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2, leg = box(g, Math.sin(a) * .17, .09, Math.cos(a) * .17, .06, .04, .38, metal);
      leg.rotation.y = a;
      sphere(g, Math.sin(a) * .32, .065, Math.cos(a) * .32, .055, .06, .04, metal);
    }
    box(g, 0, .57, 0, .63, .16, .6, color, .065);
    box(g, 0, .99, .27, .6, .74, .13, color, .06);
    for (const x of [-.36, .36]) { box(g, x, .79, .02, .06, .07, .46, metal); box(g, x, .65, .15, .045, .24, .045, metal); }
  }
  function desk(st) {
    const x = st.seat.x / 32, z = st.seat.y / 32, south = st.seat.dir === 'S';
    const sign = south ? 1 : -1, dz = z + sign * 1.16;
    const g = group(root, x, 0, dz);
    box(g, 0, .88, 0, 1.84, .105, .94, wood, .04);
    for (const xx of [-.78, .78]) for (const zz of [-.32, .32]) box(g, xx, .43, zz, .055, .82, .055, metal);
    box(g, -.57, .4, .05, .46, .68, .65, P.cream);
    for (let i = 0; i < 3; i++) box(g, -.57, .3 + i * .19, .39, .18, .015, .025, brass);
    box(g, 0, .944, -sign * .06, 1.05, .018, .55, '#52604d', .025);
    const screenGroup = group(g, 0, 0, sign * .19); if (south) screenGroup.rotation.y = Math.PI;
    box(screenGroup, 0, .97, 0, .42, .035, .24, metal);
    box(screenGroup, 0, 1.1, -.04, .045, .26, .05, metal);
    box(screenGroup, 0, 1.39, -.06, .88, .55, .055, metal);
    const screenMat = new T.MeshStandardMaterial({ color: '#233e35', emissive: '#2f5447', emissiveIntensity: .12, roughness: .35 });
    box(screenGroup, 0, 1.4, -.024, .8, .47, .012, screenMat, .006);
    const bars = [];
    for (let i = 0; i < 5; i++) bars.push(box(screenGroup, -.28 + i * .14, 1.3, -.013, .08, .12 + i * .04, .003, '#9ba78c', .001));
    screens.push({ station: st, material: screenMat, bars });
    box(g, 0, .968, -sign * .27, .52, .035, .19, '#c5c6b7', .012);
    box(g, .45, .965, -sign * .23, .11, .035, .17, '#b9bcae', .025);
    cylinder(g, .72, 1.05, 0, .07, .19, P.cream);
    cylinder(g, .72, 1.15, 0, .058, .007, '#695241');
    box(g, -.76, .96, -.1, .19, .04, .3, P.sage, .008);
    chair(x, z, south);
  }
  function sofa(x, z, w = 2.75) {
    const g = group(root, x, 0, z);
    for (const xx of [-w / 2 + .2, w / 2 - .2]) for (const zz of [-.28, .28]) cylinder(g, xx, .16, zz, .04, .25, P.walnut);
    box(g, 0, .42, 0, w, .45, .92, P.green, .1);
    box(g, 0, .83, -.38, w, .75, .24, P.green, .09);
    for (const xx of [-w / 2 + .1, w / 2 - .1]) box(g, xx, .68, 0, .25, .52, .94, P.green, .08);
    for (let i = 0; i < 3; i++) box(g, -w / 3 + i * w / 3, .67, .02, w / 3 - .09, .14, .65, P.sage, .065);
    const cushion = box(g, -w / 2 + .48, .96, -.1, .42, .42, .18, P.cream, .07); cushion.rotation.z = .15;
  }
  function table(x, z, w, d) {
    box(root, x, .69, z, w, .12, d, wood, .12);
    for (const dx of [-w * .36, w * .36]) for (const dz of [-d * .3, d * .3]) box(root, x + dx, .34, z + dz, .06, .65, .06, metal);
  }
  for (const R of Object.values(world.rooms)) {
    const x = R.rx, z = R.ry, centerX = x + R.w / 2;
    box(root, centerX, .045, z + R.h / 2, R.w - .16, .045, R.h - .16, ['DIR', 'LOUNGE', 'MEET'].includes(R.id) ? '#b49573' : '#c4ab89', .025);
    for (let p = 0; p < R.w * 2; p++) box(root, x + .25 + p * .5, .071, z + R.h / 2, .012, .003, R.h - .2, '#ad9475', 0);
    const sign = new T.MeshBasicMaterial({ map: textTexture(R.short.toUpperCase(), { width: 512, height: 80, size: 30 }) });
    const label = new T.Mesh(new T.PlaneGeometry(3.6, .56), sign); label.rotation.x = -Math.PI / 2; label.position.set(centerX, .082, z + R.h + .55); root.add(label);
    if (R.kind === 'dept') {
      shelf(x + .95, z + .48, 1.65, 1.7);
      board(x + 3.5, z + .5, R.id);
      shelf(x + 6.1, z + .48, 1.75, 1.25);
      plant(x + 3.5, z + 1.5); plant(x + 4.5, z + 4.5, false);
      if (R.c === 0) plant(x + 7.5, z + .5); else if (R.c === 2) plant(x + 7.5, z + 3.5);
    } else if (R.kind === 'dir') {
      box(root, centerX, .08, z + 3.3, 5.8, .035, 4.8, P.green, .03);
      shelf(x + 1, z + .48, 1.75, 2.2); shelf(x + 7, z + .48, 1.75, 2.2);
      plant(x + .5, z + 2.5); plant(x + 7.5, z + 2.5);
      chair(x + 3.5, z + 3.8); chair(x + 4.5, z + 3.8);
      sofa(x + .5, z + 4.6, .8);
    } else if (R.kind === 'meet') {
      box(root, centerX, .08, z + 3, 6.9, .035, 4.2, '#879079');
      table(centerX, z + 3, 5.5, 1.65);
      for (let i = 0; i < 6; i++) { chair(x + 1.5 + i, z + 1.75, true); chair(x + 1.5 + i, z + 4.75); }
      board(x + .5, z + .5, R.id); plant(x + 7.5, z + .5);
      box(root, centerX, .78, z + 3, .75, .04, .5, P.cream);
    } else if (R.kind === 'lounge') {
      for (let i = 0; i < 3; i++) box(root, x + .5 + i, .5, z + .5, .96, .95, .8, P.green);
      box(root, x + 1.5, 1.02, z + .5, 3, .1, .95, wood);
      box(root, x + 3.5, .6, z + .5, .72, 1.2, .72, '#4d5145');
      box(root, x + 3.5, 1.22, z + .6, .5, .45, .42, metal);
      box(root, x + 3.5, 1.28, z + .83, .28, .2, .02, P.brass);
      box(root, x + 4.5, .92, z + .5, .8, 1.8, .8, P.cream);
      box(root, x + 7.5, 1, z + .5, .85, 2, .85, P.green);
      box(root, centerX, .085, z + 4, 7.7, .03, 3.6, '#d1bea1');
      for (const dx of [1.5, 6.5]) { sofa(x + dx, z + 3.5); table(x + dx, z + 4.5, .85, .7); }
      plant(x + 5.5, z + .5);
    } else if (R.kind === 'recep') {
      box(root, centerX, .6, z + 1.5, 3.85, 1.2, .9, wood, .08);
      box(root, centerX, 1.24, z + 1.5, 4, .1, 1, P.cream);
      const name = new T.MeshBasicMaterial({ map: textTexture('LA CUEVA', { width: 512, size: 50, bg: '#79553b', ink: '#efe5d5' }) });
      box(root, centerX, .72, z + 1.96, 2.4, .5, .02, name);
      sofa(x + 1, z + 3.6, 1.75); sofa(x + 7.5, z + 3.6, .8);
      plant(x + .5, z + .5); plant(x + 7.5, z + .5);
    }
  }
  const allStations = [...new Set([...Object.values(world.stations), ...world.spare])];
  allStations.forEach(desk);
  for (let c = 0; c < 2; c++) for (let r = 0; r < 3; r++) plant(10.5 + c * 10, 9.5 + r * 8, r % 2 === 0);
  const entrance = world.spawn.x / 32;
  box(root, entrance, -.02, sizeZ + .5, 5.8, .2, 2, '#cbbb9f');
  // Static details are merged before the screen bars (which animate) join the scene.
  const animated = [];
  for (const s of screens) for (const b of s.bars) { b.updateWorldMatrix(true, false); b.applyMatrix4(b.parent.matrixWorld); b.removeFromParent(); animated.push(b); }
  mergeStatic(root); animated.forEach(b => scene.add(b));
  return { screens, root };
}
