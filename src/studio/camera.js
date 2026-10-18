import { Vector3, OrthographicCamera, Plane, Raycaster } from 'three';

export const TILE_SIZE = 32;
const eye = new Vector3(20, 25, 28);
const right = new Vector3().crossVectors(new Vector3(0, 1, 0), eye).normalize();
const forward = new Vector3(-right.z, 0, right.x);
export function screenDirection(x, y) {
  return { x: right.x * x + forward.x * y, y: right.z * x + forward.z * y };
}
export function studioCamera(width, height, state) {
  const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 200);
  updateCamera(camera, width, height, state); return camera;
}
export function updateCamera(camera, width, height, state) {
  const h = height / (TILE_SIZE * state.z), w = width / (TILE_SIZE * state.z);
  camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2;
  const target = new Vector3(state.x / TILE_SIZE, .35, state.y / TILE_SIZE);
  camera.position.copy(target).add(eye); camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
export function groundPoint(camera, width, height, x, y) {
  const ray = new Raycaster(); ray.setFromCamera({ x: x / width * 2 - 1, y: 1 - y / height * 2 }, camera);
  const point = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), new Vector3());
  return point ? { x: point.x * TILE_SIZE, y: point.z * TILE_SIZE } : null;
}
export function projectPoint(camera, width, height, x, y, elevation = 1.9) {
  const p = new Vector3(x / TILE_SIZE, elevation, y / TILE_SIZE).project(camera);
  return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2, visible: p.z >= -1 && p.z <= 1 };
}
export function fitOffice(width, height, world) {
  const state = { x: world.W * TILE_SIZE / 2, y: (world.H - 2) * TILE_SIZE / 2, z: 1 };
  const camera = studioCamera(width, height, state), points = [];
  for (const x of [0, world.W]) for (const z of [0, world.H]) for (const y of [0, 3.6]) points.push(new Vector3(x, y, z).project(camera));
  const spanX = Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x));
  const spanY = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y));
  state.z = Math.min(1, 1.8 / spanX, 1.8 / spanY); return state;
}
