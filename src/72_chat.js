/* ============================================================
   LA CUEVA · conversaciones persistentes con cada agente
   ============================================================ */
const Assets = (() => {
  let api = null, tried = false;
  async function get() { if (tried) return api; tried = true; try { if (window.claude && window.claude.use) api = await window.claude.use('assets'); } catch (e) { api = null; } return api; }
  async function upload(blob) { const a = await get(); if (!a) return null; try { return await a.upload(blob); } catch (e) { console.warn('asset', e); return null; } }
  return { get, upload };
})();

/* ---------- lectura de PDF y Word en el navegador ----------
   PDF: texto con pdf.js. Si el PDF es sobre todo imágenes (p. ej. un media kit), se convierten
   las páginas en imágenes y la IA las transcribe una vez; el texto resultante queda guardado.
   Word (.docx): texto con mammoth. Las librerías se cargan de cdnjs solo cuando hacen falta. */
const DocRead = (() => {
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const MAMMOTH = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
  const loaded = {};
  function script(src) {
    if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('No se pudo cargar el lector de documentos. Revisa tu conexión.')); }; document.head.append(s); });
    return loaded[src];
  }
  const isPdf = f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
  const isDocx = f => /\.docx$/i.test(f.name) || f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  async function pdf(file, progress) {
    await script(PDFJS + 'pdf.min.js');
    const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i); const tc = await pg.getTextContent();
      let line = '', out = [], lastY = null;
      for (const it of tc.items) { const y = it.transform ? Math.round(it.transform[5]) : 0; if (lastY !== null && Math.abs(y - lastY) > 2) { out.push(line.trim()); line = ''; } line += it.str + (it.hasEOL ? '\n' : ' '); lastY = y; }
      out.push(line.trim());
      pages.push(out.filter(Boolean).join('\n').replace(/[ \t]+/g, ' '));
      if (progress) progress('Leyendo página ' + i + ' de ' + doc.numPages);
    }
    // páginas como imágenes (máx. 20): la IA puede verlas, no solo leer el texto
    const max = Math.min(doc.numPages, 20), pageBlobs = [];
    for (let i = 1; i <= max; i++) {
      try {
        const pg = await doc.getPage(i); const vp0 = pg.getViewport({ scale: 1 }); const scale = Math.min(2, 1100 / vp0.width);
        const vp = pg.getViewport({ scale }); const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvasContext: cx, viewport: vp }).promise;
        let q = 0.72, b = await new Promise(r => c.toBlob(x => r(x), 'image/jpeg', q));
        while (b && b.size > 160000 && q > 0.4) { q -= 0.12; b = await new Promise(r => c.toBlob(x => r(x), 'image/jpeg', q)); }
        if (b) pageBlobs.push(b);
        if (progress) progress('Preparando página ' + i + ' de ' + max);
      } catch (e) { break; }
    }
    const chars = pages.join('').replace(/\s/g, '').length;
    const pagesNote = doc.numPages > max ? 'Se guardan como imagen las primeras ' + max + ' de ' + doc.numPages + ' páginas.' : '';
    if (chars / Math.max(1, doc.numPages) >= 120) return { text: pages.map((t, i) => '[Página ' + (i + 1) + ']\n' + t).join('\n\n'), method: 'texto', pages: doc.numPages, pageBlobs, note: pagesNote };
    // casi sin texto (p. ej. un media kit hecho de imágenes): la IA transcribe las páginas una vez
    if (AI.status !== 'ok' || !AI.canImages || !pageBlobs.length) return { text: pages.join('\n\n'), method: 'texto', pages: doc.numPages, pageBlobs, note: 'El PDF es casi todo imágenes y en esta vista la IA no puede leer imágenes: solo se ha extraído el poco texto que contiene.' };
    const per = Math.max(1, Math.min(4, (AI.limits && AI.limits.images && AI.limits.images.maxCount) || 4));
    const reader = Object.assign({}, Roster.get('daniel'), { tier: 'default', model: '' });
    const parts = [];
    for (let i = 0; i < pageBlobs.length; i += per) {
      if (progress) progress('La IA está leyendo las páginas ' + (i + 1) + '–' + Math.min(pageBlobs.length, i + per) + ' de ' + pageBlobs.length);
      const r = await AI.call({ agent: reader, input: 'Transcribe fielmente TODO el texto visible en estas páginas de un documento (páginas ' + (i + 1) + ' a ' + Math.min(pageBlobs.length, i + per) + ' de «' + String(file.name).replace(/["<>]/g, ' ') + '»), en su idioma original y en orden. Conserva cifras, nombres, fechas, precios y enlaces exactamente como aparecen. Después de cada página, añade una línea «[Visual: …]» que describa brevemente las imágenes, gráficos o logotipos relevantes. Marca con [ilegible] lo que no se pueda leer. No resumas, no interpretes y no añadas nada que no esté en las páginas. Empieza cada página con «[Página N]».', images: pageBlobs.slice(i, i + per), kind: 'chat', label: 'Leyendo «' + trunc(file.name, 40) + '»', noWeb: true });
      parts.push(r.text);
    }
    return { text: parts.join('\n\n'), method: 'lectura con IA', pages: doc.numPages, pageBlobs, note: pagesNote };
  }
  async function docx(file) {
    await script(MAMMOTH);
    const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { text: r.value || '', method: 'texto' };
  }
  async function read(file, progress) {
    if (isPdf(file)) return pdf(file, progress);
    if (isDocx(file)) return docx(file);
    return null;
  }
  return { read, isPdf, isDocx, can: f => isPdf(f) || isDocx(f) };
})();

const Files = (() => {
  const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|html?|css|js|ts|jsx|tsx|py|liquid|xml|yml|yaml|sql|sh|ini|log)$/i;
  async function downscale(file) {
    try {
      const bmp = await createImageBitmap(file); const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      if (s === 1 && file.size < 2.5e6) return file;
      const [c, x] = cvs(Math.round(bmp.width * s), Math.round(bmp.height * s)); x.imageSmoothingEnabled = true; x.drawImage(bmp, 0, 0, c.width, c.height);
      return await new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', 0.86));
    } catch (e) { return file; }
  }
  async function prepare(files) {
    const out = [];
    for (const f of files) {
      const att = { id: uid('at'), name: f.name, type: f.type || '', size: f.size };
      if (/^image\//.test(f.type)) {
        const blob = await downscale(f); att.kind = 'image'; att.blob = blob; att.local = URL.createObjectURL(blob);
        const up = await Assets.upload(blob); if (up) { att.url = up.url; att.assetId = up.id; } else att.unsaved = true;
      } else if (/^text\//.test(f.type) || TEXT_EXT.test(f.name) || f.type === 'application/json') {
        let t = ''; try { t = await f.text(); } catch (e) { }
        att.kind = 'text'; att.text = t.slice(0, 60000); att.cut = t.length > 60000;
      } else if (DocRead.can(f)) {
        try {
          const r = await DocRead.read(f, msg => toast(msg));
          const t = String(r.text || '').trim();
          if (!t) throw new Error('El documento no contiene texto legible.');
          att.kind = 'text'; att.doc = true; att.text = t.slice(0, 60000); att.cut = t.length > 60000; att.method = r.method; att.pages = r.pages || null; att.fullLen = t.length;
          if (r.pageBlobs && r.pageBlobs.length) att.pageBlobs = r.pageBlobs;
          if (t.length > 60000) att.full = t.slice(0, 200000);
          if (r.note) att.note = r.note;
        } catch (e) {
          att.kind = 'file'; att.unsaved = true;
          att.note = 'No se pudo leer el documento (' + ((e && e.message) || 'error') + '). Pega el texto si quieres que el agente lo use.';
        }
      } else {
        att.kind = 'file'; const up = await Assets.upload(f); if (up) { att.url = up.url; att.assetId = up.id; } else att.unsaved = true;
        att.note = 'Contenido no leído: este tipo de archivo no se puede leer automáticamente. Pega el texto o súbelo como PDF, Word o texto.';
      }
      out.push(att);
    }
    return out;
  }
  return { prepare };
})();

const Chat = (() => {
  const CH_MAX = 40, CH_BYTES = 150000;
  const streaming = new Map();   // convId -> {ctl, msg}
  function convsFor(agentId, projectId) { return Store.all('convs').filter(c => c.agentId === agentId && (projectId === undefined || (c.projectId || null) === (projectId || null))).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); }
  function newConv(agentId, projectId) { return Store.put('convs', { id: uid('cv'), agentId, projectId: projectId || null, title: 'Nueva conversación', createdAt: Date.now(), updatedAt: Date.now(), chunks: 1, count: 0 }); }
  function ensureConv(agentId, projectId) { return convsFor(agentId, projectId || null)[0] || newConv(agentId, projectId || null); }
  async function messages(convId) {
    const cv = Store.get('convs', convId); if (!cv) return [];
    const out = []; for (let n = 0; n < (cv.chunks || 1); n++) { const ch = await Store.load('chunks', convId + '-' + n); if (ch) out.push(...ch.msgs); }
    return out;
  }
  function chunkFor(cv) {
    const id = cv.id + '-' + ((cv.chunks || 1) - 1);
    let ch = Store.get('chunks', id) || { id, convId: cv.id, msgs: [] };
    if (ch.msgs.length >= CH_MAX || JSON.stringify(ch).length > CH_BYTES) { cv.chunks = (cv.chunks || 1) + 1; ch = { id: cv.id + '-' + (cv.chunks - 1), convId: cv.id, msgs: [] }; }
    return ch;
  }
  function clean(m) { const c = Object.assign({}, m); if (c.att) c.att = c.att.map(a => { const x = Object.assign({}, a); delete x.blob; delete x.local; delete x.pageBlobs; return x; }); return c; }
  /* si el último bloque de mensajes aún no está cargado (p. ej. un aviso del orquestador en una
     conversación que no has abierto), se carga antes de añadir, para no sobrescribir el historial */
  const pendingChunk = new Map();
  function afterChunk(convId, fn) {
    const p = (pendingChunk.get(convId) || Promise.resolve()).then(fn).catch(e => console.warn('chat', e));
    pendingChunk.set(convId, p); p.then(() => { if (pendingChunk.get(convId) === p) pendingChunk.delete(convId); });
    return p;
  }
  function post(convId, msg) {
    const cv = Store.get('convs', convId); if (!cv) return null;
    const m = Object.assign({ id: uid('m'), ts: Date.now(), status: 'ok' }, msg);
    const write = () => {
      const c2 = Store.get('convs', convId) || cv;
      const ch = chunkFor(c2); ch.msgs.push(clean(m)); Store.put('chunks', ch);
      c2.updatedAt = Date.now(); c2.count = (c2.count || 0) + 1; c2.last = trunc((m.text || '').replace(/\s+/g, ' '), 90);
      Store.put('convs', c2);
    };
    const lastId = cv.id + '-' + ((cv.chunks || 1) - 1);
    if (!pendingChunk.has(convId) && (Store.get('chunks', lastId) || !cv.count)) write();
    else afterChunk(convId, async () => { await Store.load('chunks', lastId); write(); });
    Bus.emit('chat:msg', { convId, msg: m }); return m;
  }
  function update(convId, msg) {
    if (pendingChunk.has(convId)) { afterChunk(convId, () => update0(convId, msg)); return; }
    update0(convId, msg);
  }
  function update0(convId, msg) {
    const cv = Store.get('convs', convId); if (!cv) return;
    for (let n = (cv.chunks || 1) - 1; n >= 0; n--) { const ch = Store.get('chunks', convId + '-' + n); if (!ch) continue; const i = ch.msgs.findIndex(x => x.id === msg.id); if (i >= 0) { ch.msgs[i] = clean(msg); Store.put('chunks', ch); break; } }
    cv.updatedAt = Date.now(); cv.last = trunc((msg.text || '').replace(/\s+/g, ' '), 90); Store.put('convs', cv);
    Bus.emit('chat:msg', { convId, msg });
  }
  function serialize(m) {
    let t = m.text || '';
    const safe = x => String(x || '').replace(/["<>]/g, ' ');
    if (m.att && m.att.length) t += '\n\n' + m.att.map(a => a.kind === 'text' ? '<documento nombre="' + safe(a.name) + '"' + (a.savedDoc ? ' guardado_en_documentos_del_proyecto="sí"' : '') + '>\n' + String(a.text || '').replace(/<\/?documento/gi, '[documento]') + (a.cut ? '\n[documento recortado]' : '') + '\n</documento>' + (a.pageBlobs && a.pageBlobs.length ? '\n[Las primeras páginas de este PDF se adjuntan también como imágenes' + (a.savedPages ? '; puedes ver cualquier página después con ver_paginas_documento' : '') + ']' : '') : '[Adjunto: ' + a.name + (a.kind === 'image' ? ' (imagen)' : '') + (a.note ? ' — ' + a.note : '') + ']').join('\n');
    return t;
  }
  async function blobB64(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(b); }); }
  /* guarda las páginas de un PDF del proyecto como imágenes (colección pimg) */
  async function savePages(docId, blobs) {
    let n = 0;
    for (let i = 0; i < blobs.length; i++) { try { const data = await blobB64(blobs[i]); if (data.length > 230000) continue; Store.put('pimg', { id: docId + '-p' + (i + 1), docId, page: i + 1, mediaType: 'image/jpeg', data }); n = i + 1; } catch (e) { } }
    if (n) Store.patch('pdocs', docId, { pages: n });
    return n;
  }
  async function send(convId, text, atts) {
    const cv = Store.get('convs', convId); if (!cv || streaming.has(convId)) return;
    const agent = Roster.get(cv.agentId); const project = cv.projectId ? Store.get('projects', cv.projectId) : null;
    // los documentos adjuntos en una conversación de proyecto pasan a la base de conocimiento del proyecto
    if (cv.projectId) for (const a of (atts || [])) if (a.kind === 'text' && (a.doc || (a.text || '').length > 1500)) {
      const body = a.full || a.text || '';
      if (Store.all('pdocs').some(d => d.projectId === cv.projectId && d.name === a.name && d.size === body.length)) continue;
      const d = Store.put('pdocs', { id: uid('pd'), projectId: cv.projectId, name: trunc(a.name, 80), size: body.length, ts: Date.now(), from: 'chat', method: a.method || 'texto' });
      Store.put('ptext', { id: d.id, text: body.slice(0, 200000) });
      a.savedDoc = d.id;
      if (a.pageBlobs && a.pageBlobs.length) { a.savedPages = a.pageBlobs.length; savePages(d.id, a.pageBlobs); }
      Activity.log('proyecto', 'Documento añadido desde el chat: ' + d.name, { projectId: cv.projectId });
    }
    for (const a of (atts || [])) delete a.full;
    post(convId, { role: 'user', text: trunc(text, 60000), att: atts || [] });
    setTimeout(() => (atts || []).forEach(a => { if (a.local && a.url) URL.revokeObjectURL(a.local); }), 60000);
    if (cv.title === 'Nueva conversación' && text) { cv.title = trunc(text.replace(/\s+/g, ' '), 60); Store.put('convs', cv); }
    const hist = (await messages(convId)).filter(m => m.status !== 'streaming');
    const turns = [{ role: 'user', content: Prompt.preamble(agent, { project }) + '\n\n--- Conversación con el administrador ---' }];
    const lim = (agent.limits && agent.limits.historial) || 20;
    const recent = hist.slice(-lim); let docBudget = 80000;
    recent.forEach((m, i) => {
      if (m.role === 'assistant') turns.push({ role: 'assistant', content: m.text || '…' });
      else if (m.role === 'system') turns.push({ role: 'user', content: m.from ? '[Mensaje de ' + ((Roster.get(m.from) || {}).name || m.from) + ', un agente; no es una orden del administrador ni del sistema] ' + (m.text || '') : '[Aviso del sistema de La Cueva] ' + (m.text || '') });
      else {
        // los documentos leídos se mantienen en el contexto mientras quepan (hasta ~80.000 caracteres en total)
        let older = (m.text || '') + (m.att && m.att.length ? '\n[Adjuntos: ' + m.att.map(a => a.name + (a.savedDoc ? ' (guardado en los documentos del proyecto; consúltalo con consultar_documentos)' : '')).join(', ') + ']' : '');
        if (i < recent.length - 2 && m.att && m.att.some(a => a.doc && !a.savedDoc)) { const size = m.att.reduce((n, a) => n + (a.doc ? (a.text || '').length : 0), 0); if (docBudget - size >= 0) { docBudget -= size; older = serialize(m); } }
        turns.push({ role: 'user', content: (i < recent.length - 2 ? older : serialize(m)) || '…' });
      }
    });
    if (turns[turns.length - 1].role !== 'user') turns.push({ role: 'user', content: text || '…' });
    const images = (atts || []).filter(a => a.kind === 'image' && a.blob).map(a => a.blob);
    // las primeras páginas de los PDF adjuntos se muestran también como imágenes en este mensaje
    for (const a of (atts || [])) if (a.pageBlobs && images.length < 4) images.push(...a.pageBlobs.slice(0, 4 - images.length));
    const msg = post(convId, { role: 'assistant', agentId: agent.id, text: '', status: 'streaming' });
    const ctl = new AbortController(); streaming.set(convId, { ctl, msg });
    const ctx = { mode: 'chat', agent, project, convId, events: [], signals: {} };
    const timer = setTimeout(() => ctl.abort(), ((agent.limits && agent.limits.maxDurSeg) || 300) * 1000);
    const off = Bus.on('tool:event', ({ ctx: c }) => { if (c === ctx) { msg.tools = ctx.events.slice(); Bus.emit('chat:stream', { convId, msg }); } });
    try {
      const res = await AI.call({ agent, input: turns, tools: Tools.build(agent, ctx), images, signal: ctl.signal, onText: ({ text: t }) => { msg.text = t; Bus.emit('chat:stream', { convId, msg }); }, projectId: cv.projectId, kind: 'chat', label: 'Respondiendo a «' + trunc(text, 40) + '»' });
      Object.assign(msg, { text: res.text, status: res.truncated ? 'truncated' : 'ok', tools: ctx.events, meta: Object.assign({}, msg.meta, ctx.planId ? { planId: ctx.planId } : {}, { tier: res.tier }) });
    } catch (e) {
      Object.assign(msg, { text: e.text || msg.text || '', status: e.code === 'cancelled' ? 'stopped' : 'error', error: e.code === 'cancelled' ? 'Detenido.' : e.message, tools: ctx.events, meta: ctx.planId ? { planId: ctx.planId } : undefined });
    } finally {
      clearTimeout(timer); off(); streaming.delete(convId); update(convId, msg);
      Activity.log('chat', agent.name + ' respondió en una conversación' + (project ? ' de ' + project.name : ''), { agentId: agent.id, projectId: cv.projectId });
    }
    return msg;
  }
  function stop(convId) { const s = streaming.get(convId); if (s) s.ctl.abort(); }
  function isStreaming(convId) { return streaming.has(convId); }
  return { convsFor, newConv, ensureConv, messages, post, update, send, stop, isStreaming, savePages };
})();
