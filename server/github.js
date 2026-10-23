/* ============================================================
   LA CUEVA · GitHub (un repositorio por proyecto)
   Se conecta con un token de acceso fino (fine-grained) limitado a ese repositorio.
   - Lectura para los agentes del proyecto: estado, archivos, búsqueda, issues y pull requests.
   - Escritura solo desde aprobaciones: crear issue, comentar y proponer cambios de código
     en una rama nueva con un pull request. Nunca escribe en la rama principal ni fusiona.
   ============================================================ */
const API = 'https://api.github.com';
const testBase = () => (process.env.LC_ALLOW_MOCK === '1' && process.env.LC_GITHUB_TEST_BASE) || '';

export class GhError extends Error { constructor(code, message) { super(message); this.code = code; this.expose = true; } }

export function normalizeRepo(input) {
  let s = String(input || '').trim().replace(/\.git$/, '');
  const m = s.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+)/i); if (m) s = m[1] + '/' + m[2];
  if (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(s)) throw new GhError('invalid', 'Escribe el repositorio como «usuario/repositorio» o pega su enlace de GitHub.');
  return s;
}
const enc = p => String(p || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
function safePath(p) {
  const s = String(p || '').replace(/^\/+/, '');
  if (s.split('/').some(x => x === '..' || x === '.')) throw new GhError('invalid', 'Ruta de archivo no válida.');
  return s;
}

async function gh(cred, method, path, body) {
  const res = await fetch((testBase() || API) + path, {
    method, headers: { authorization: 'Bearer ' + cred.token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'la-cueva', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return null;
  const j = await res.json().catch(() => ({}));
  if (res.ok) return j;
  if (res.status === 401) throw new GhError('github_auth', 'GitHub ha rechazado el token (¿caducado o revocado?). Crea uno nuevo y vuelve a conectar.');
  if (res.status === 403 && /rate limit/i.test(j.message || '')) throw new GhError('rate_limited', 'GitHub pide esperar un poco (límite de peticiones).');
  if (res.status === 403) throw new GhError('github_scope', 'El token no tiene permiso para esto en GitHub: ' + String(j.message || '').slice(0, 160) + '. Revisa los permisos del token.');
  if (res.status === 404) throw new GhError('not_found', 'No existe o el token no tiene acceso: ' + path.replace(/^\/repos\/[^/]+\/[^/]+/, '').slice(0, 120));
  if (res.status === 422) throw new GhError('github_error', 'GitHub no acepta la petición: ' + String(j.message || '') + (j.errors ? ' · ' + JSON.stringify(j.errors).slice(0, 200) : ''));
  throw new GhError('github_error', 'Error de GitHub (' + res.status + ').');
}
const R = cred => '/repos/' + cred.repo;

/* comprueba el token y el repositorio antes de guardar nada */
export async function verify(cred) {
  const r = await gh(cred, 'GET', R(cred));
  const p = r.permissions || {};
  return { repo: r.full_name, private: !!r.private, defaultBranch: r.default_branch, canWrite: !!(p.push || p.admin || p.maintain), url: r.html_url };
}

const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '\n…[recortado]' : s; };

export const READ = {
  async estado_repo(cred) {
    const r = await gh(cred, 'GET', R(cred));
    const commits = await gh(cred, 'GET', R(cred) + '/commits?per_page=5').catch(() => []);
    return { repositorio: r.full_name, descripcion: r.description, privado: r.private, rama_principal: r.default_branch, lenguaje: r.language, issues_abiertos: r.open_issues_count, actualizado: r.pushed_at, ultimos_cambios: (commits || []).map(c => ({ sha: c.sha.slice(0, 7), mensaje: String(c.commit.message).split('\n')[0].slice(0, 120), autor: c.commit.author && c.commit.author.name, fecha: c.commit.author && c.commit.author.date })) };
  },
  async listar_archivos(cred, p) {
    const path = safePath(p.ruta);
    const r = await gh(cred, 'GET', R(cred) + '/contents/' + enc(path) + (p.rama ? '?ref=' + encodeURIComponent(p.rama) : ''));
    if (!Array.isArray(r)) return { ruta: path, tipo: r.type, tamano: r.size, aviso: 'Es un archivo: usa leer_archivo.' };
    return r.slice(0, 300).map(x => ({ nombre: x.name, ruta: x.path, tipo: x.type === 'dir' ? 'carpeta' : 'archivo', tamano: x.size }));
  },
  async leer_archivo(cred, p) {
    const path = safePath(p.ruta); if (!path) throw new GhError('invalid', 'Indica la ruta del archivo.');
    const r = await gh(cred, 'GET', R(cred) + '/contents/' + enc(path) + (p.rama ? '?ref=' + encodeURIComponent(p.rama) : ''));
    if (Array.isArray(r) || r.type !== 'file') throw new GhError('invalid', 'Esa ruta es una carpeta: usa listar_archivos.');
    if (r.size > 400000) return { ruta: r.path, aviso: 'Archivo demasiado grande para leerlo aquí (' + r.size + ' bytes).' };
    const text = Buffer.from(r.content || '', 'base64').toString('utf8');
    if (/\u0000/.test(text.slice(0, 2000))) return { ruta: r.path, aviso: 'Es un archivo binario (imagen u otro formato); no se puede leer como texto.' };
    return { ruta: r.path, tamano: r.size, contenido: clip(text, 30000) };
  },
  async buscar_codigo(cred, p) {
    const term = String(p.consulta || '').replace(/[^\p{L}\p{N} ._\-/"']/gu, ' ').trim().slice(0, 120);
    if (!term) throw new GhError('invalid', 'Indica qué buscar.');
    const r = await gh(cred, 'GET', '/search/code?per_page=20&q=' + encodeURIComponent(term + ' repo:' + cred.repo));
    return { total: r.total_count, resultados: (r.items || []).map(x => ({ ruta: x.path, nombre: x.name })) };
  },
  async listar_issues(cred, p) {
    const st = ['open', 'closed', 'all'].includes(p.estado) ? p.estado : 'open';
    const r = await gh(cred, 'GET', R(cred) + '/issues?per_page=30&state=' + st);
    return r.filter(x => !x.pull_request).map(x => ({ numero: x.number, titulo: x.title, estado: x.state, etiquetas: (x.labels || []).map(l => l.name), autor: x.user && x.user.login, creado: x.created_at, cuerpo: clip(x.body, 600) }));
  },
  async listar_pull_requests(cred, p) {
    const st = ['open', 'closed', 'all'].includes(p.estado) ? p.estado : 'open';
    const r = await gh(cred, 'GET', R(cred) + '/pulls?per_page=30&state=' + st);
    return r.map(x => ({ numero: x.number, titulo: x.title, estado: x.state, rama: x.head && x.head.ref, autor: x.user && x.user.login, creado: x.created_at, url: x.html_url }));
  }
};

export const WRITE = {
  async crear_issue(cred, p) {
    const title = String(p.titulo || '').trim().slice(0, 250); if (!title) throw new GhError('invalid', 'Falta el título.');
    const r = await gh(cred, 'POST', R(cred) + '/issues', { title, body: String(p.cuerpo || '').slice(0, 60000), labels: Array.isArray(p.etiquetas) ? p.etiquetas.map(String).slice(0, 10) : undefined });
    return 'Issue creado: #' + r.number + ' «' + r.title + '» · ' + r.html_url;
  },
  async comentar(cred, p) {
    const n = parseInt(p.numero, 10); if (!(n > 0)) throw new GhError('invalid', 'Falta el número del issue o pull request.');
    const r = await gh(cred, 'POST', R(cred) + '/issues/' + n + '/comments', { body: String(p.cuerpo || '').slice(0, 60000) });
    return 'Comentario publicado en #' + n + ' · ' + r.html_url;
  },
  /* rama nueva desde la principal + archivos + pull request en borrador. Nunca toca la rama principal. */
  async proponer_cambios_codigo(cred, p) {
    const files = Array.isArray(p.archivos) ? p.archivos.slice(0, 10) : [];
    if (!files.length) throw new GhError('invalid', 'No hay archivos que cambiar.');
    const repo = await gh(cred, 'GET', R(cred));
    const base = repo.default_branch;
    let branch = String(p.rama || '').trim().replace(/[^A-Za-z0-9._/-]/g, '-').replace(/^[-/.]+|[-/.]+$/g, '').slice(0, 80) || 'la-cueva/propuesta';
    if (branch === base) branch = 'la-cueva/' + branch;
    const ref = await gh(cred, 'GET', R(cred) + '/git/ref/heads/' + enc(base));
    try { await gh(cred, 'POST', R(cred) + '/git/refs', { ref: 'refs/heads/' + branch, sha: ref.object.sha }); }
    catch (e) { if (e.code !== 'github_error') throw e; branch = branch + '-' + Date.now().toString(36); await gh(cred, 'POST', R(cred) + '/git/refs', { ref: 'refs/heads/' + branch, sha: ref.object.sha }); }
    for (const f of files) {
      const path = safePath(f.ruta); if (!path) throw new GhError('invalid', 'Un archivo no tiene ruta.');
      let sha;
      try { const cur = await gh(cred, 'GET', R(cred) + '/contents/' + enc(path) + '?ref=' + encodeURIComponent(branch)); sha = cur && cur.sha; } catch (e) { if (e.code !== 'not_found') throw e; }
      await gh(cred, 'PUT', R(cred) + '/contents/' + enc(path), { message: String(p.titulo_pr || 'Propuesta de La Cueva').slice(0, 120) + ' · ' + path, content: Buffer.from(String(f.contenido || ''), 'utf8').toString('base64'), branch, sha });
    }
    const pr = await gh(cred, 'POST', R(cred) + '/pulls', { title: String(p.titulo_pr || 'Propuesta de La Cueva').slice(0, 250), head: branch, base, body: String(p.descripcion_pr || '').slice(0, 60000) + '\n\n_Propuesto desde La Cueva y aprobado por el administrador. Revísalo antes de fusionar._', draft: true });
    return 'Pull request en borrador #' + pr.number + ' en la rama «' + branch + '» (' + files.length + ' archivo' + (files.length > 1 ? 's' : '') + '). No se ha fusionado nada: revísalo en ' + pr.html_url;
  }
};
export const GITHUB_READS = Object.keys(READ);
export const GITHUB_WRITES = Object.keys(WRITE);

/* valida y limita una propuesta antes de convertirla en aprobación */
export function checkProposal(action, params) {
  if (!WRITE[action]) throw new GhError('invalid', 'Acción de GitHub no disponible.');
  if (action === 'proponer_cambios_codigo') {
    const files = Array.isArray(params.archivos) ? params.archivos : [];
    if (!files.length || files.length > 10) throw new GhError('invalid', 'Entre 1 y 10 archivos por propuesta.');
    let total = 0; for (const f of files) { safePath(f.ruta); total += String(f.contenido || '').length; }
    if (total > 300000) throw new GhError('invalid', 'La propuesta es demasiado grande (máx. 300.000 caracteres).');
  }
  return true;
}
