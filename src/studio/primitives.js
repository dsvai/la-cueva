import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const palette = { green: '#344c3d', sage: '#8b9b80', cream: '#efe5d5', stone: '#d8cbb5', walnut: '#79553b', dark: '#29362e', brass: '#b29a7d' };
const materials = new Map(), geometries = new Map();
export function material(color, roughness = .72) {
  const key = color + ':' + roughness;
  if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, roughness }));
  return materials.get(key);
}
function geometry(key, create) {
  if (!geometries.has(key)) geometries.set(key, create());
  return geometries.get(key);
}
function mesh(parent, geo, mat, x, y, z) {
  const m = new T.Mesh(geo, typeof mat === 'string' ? material(mat) : mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
export function box(parent, x, y, z, w, h, d, mat, radius = .025) {
  const r = Math.min(radius, w / 3, h / 3, d / 3);
  return mesh(parent, geometry(`b:${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r)), mat, x, y, z);
}
export function sphere(parent, x, y, z, sx, sy, sz, mat) {
  const m = mesh(parent, geometry('sphere', () => new T.SphereGeometry(1, 20, 14)), mat, x, y, z);
  m.scale.set(sx, sy, sz); return m;
}
export function cylinder(parent, x, y, z, r, height, mat, rBottom = r) {
  return mesh(parent, geometry(`c:${r}:${rBottom}:${height}`, () => new T.CylinderGeometry(r, rBottom, height, 12)), mat, x, y, z);
}
export function group(parent, x = 0, y = 0, z = 0) {
  const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g;
}
export function textTexture(text, { bg = '#efe5d5', ink = '#344c3d', size = 34, width = 512, height = 128 } = {}) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, width, height);
  x.fillStyle = ink; x.font = `600 ${size}px "Instrument Sans",sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, width / 2, height / 2, width - 40);
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4; return tex;
}
export function woodMaterial() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); x.fillStyle = '#9a7454'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 180; i++) {
    x.strokeStyle = i % 3 ? 'rgba(60,32,16,.08)' : 'rgba(250,221,174,.14)'; x.lineWidth = .5 + i % 2;
    x.beginPath(); x.moveTo(0, i * 1.5); x.bezierCurveTo(70, i * 1.5 - 8, 150, i * 1.5 + 6, 256, i * 1.5 - 2); x.stroke();
  }
  const map = new T.CanvasTexture(c); map.colorSpace = T.SRGBColorSpace;
  return new T.MeshStandardMaterial({ map, color: '#d0bda8', roughness: .65 });
}
// Merge stationary furniture by material: hundreds of details become a few draw calls.
// Shared source geometry/materials remain owned by the caches above.
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map(), meshes = [];
  root.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
    const key = o.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, parts: [] });
    buckets.get(key).parts.push(g); meshes.push(o);
  });
  for (const m of meshes) m.removeFromParent();
  for (const { mat, parts } of buckets.values()) {
    const geo = mergeGeometries(parts, false); parts.forEach(p => p.dispose());
    if (!geo) continue;
    const m = new T.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; root.add(m);
  }
}
