// Construye dist/la-cueva.html a partir de src/
const fs = require('fs'), path = require('path');
const S = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const js = ['10_core.js', '11_chars.js', '12_tiles.js', '13_props.js', '20_data.js', '30_world.js', '50_view.js', '60_store.js', '65_agents.js', '70_ai.js', '72_chat.js', '75_orch.js', '80_ui.js', '85_panels.js', '90_main.js'];
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'assets/logo.png')).toString('base64');
const out = S('00_head.html') + '\n' + S('05_body.html') + '\n<script>\nconst LOGO_SRC = "' + logo + '";\n' + js.map(S).join('\n') + '\n</script>\n';
fs.writeFileSync(path.join(__dirname, 'dist/la-cueva.html'), out);
console.log('ok', (out.length / 1024).toFixed(0) + ' KB');
