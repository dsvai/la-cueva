// Construye las dos versiones de La Cueva a partir de src/:
//  - dist/la-cueva.html  → artefacto de Claude (un único archivo, IA y datos de tu sesión de Claude)
//  - public/             → versión desplegada en Vercel (index.html + app.js + logo; datos e IA en el servidor)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const S = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const JS = ['10_core.js', '11_chars.js', '12_tiles.js', '13_props.js', '20_data.js', '30_world.js', '50_view.js', '60_store.js', '65_agents.js', '70_ai.js', '72_chat.js', '75_orch.js', '80_ui.js', '85_panels.js', '90_main.js'];
const logoBuf = fs.readFileSync(path.join(root, 'assets/logo.png'));
const appJs = JS.map(S).join('\n');

// 1) artefacto
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const artifact = S('00_head.html') + '\n' + S('05_body.html') + '\n<script>\nconst LOGO_SRC = "data:image/png;base64,' + logoBuf.toString('base64') + '";\n' + appJs + '\n</script>\n';
fs.writeFileSync(path.join(root, 'dist/la-cueva.html'), artifact);

// 2) versión con backend
const pub = path.join(root, 'public');
fs.mkdirSync(pub, { recursive: true });
const app = 'const LOGO_SRC = "/logo.png";\n' + appJs + '\n';
const build = crypto.createHash('sha256').update(app).digest('hex').slice(0, 12);
const head = S('00_head.html').replace('</style>', S('server_gate.css') + '\n</style>') + '\n<link rel="icon" href="/logo.png">';
const remote = fs.readFileSync(path.join(root, 'shared/remote.cjs'), 'utf8');
const index = head + '\n' + S('05_body.html') + '\n<script>window.LC_BUILD = "' + build + '";</script>\n<script>\n' + remote + '\n</script>\n<script>\n' + S('server_boot.js') + '\n</script>\n';
fs.writeFileSync(path.join(pub, 'index.html'), index);
fs.writeFileSync(path.join(pub, 'app.js'), app);
fs.copyFileSync(path.join(root, 'assets/logo.png'), path.join(pub, 'logo.png'));

console.log('artefacto', (artifact.length / 1024).toFixed(0) + ' KB · servidor', ((index.length + app.length) / 1024).toFixed(0) + ' KB · build ' + build);
