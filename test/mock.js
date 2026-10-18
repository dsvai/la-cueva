// entorno simulado de Claude para pruebas locales
(function(){
  const store = new Map(); // path -> data
  function mkDoc(path){ return {
    id: path.split('/').pop(), path,
    async get(){ const d=store.get(path); return {id:path.split('/').pop(), exists:!!d, data:()=>d&&JSON.parse(JSON.stringify(d)), metadata:{}}; },
    async set(o){ store.set(path, JSON.parse(JSON.stringify(o))); },
    async update(o){ store.set(path, Object.assign(store.get(path)||{}, o)); },
    async delete(){ store.delete(path); },
    async acquire(o){ return {acquired:true, holder:o.holder}; },
    collection(c){ return mkCol(path+'/'+c); } }; }
  function mkCol(path, filters, lim){ filters=filters||[]; return {
    path, doc(id){ return mkDoc(path+'/'+(id||Math.random().toString(36).slice(2))); },
    where(f,op,v){ return mkCol(path, filters.concat([[f,op,v]]), lim); },
    orderBy(){ return this; }, limit(n){ return mkCol(path, filters, n); },
    async get(){ const docs=[]; for (const [k,v] of store) { if (k.startsWith(path+'/') && k.slice(path.length+1).indexOf('/')<0) { if (filters.every(([f,op,val])=> op==='in' ? val.includes(v[f]) : v[f]===val)) docs.push({id:k.split('/').pop(), exists:true, data:()=>JSON.parse(JSON.stringify(v))}); } } return {docs, size:docs.length, empty:!docs.length}; } }; }
  const db = { doc: mkDoc, collection: p=>mkCol(p) };
  window.__mockStore = store;
  let calls = 0;
  async function sample(input, opts){
    calls++; opts=opts||{};
    const turns = typeof input==='string'?[{role:'user',content:input}]:input;
    const last = turns[turns.length-1].content; const pre = turns[0].content;
    await new Promise(r=>setTimeout(r, 120));
    const tools = opts.tools||[];
    const tool = n => tools.find(t=>t.name===n);
    let text;
    if (pre.startsWith('Eres Daniel') && /PLANPRUEBA/.test(last) && tool('crear_plan')) {
      const r = await tool('crear_plan').execute({titulo:'Propuesta de tienda Shopify', objetivo:'Tienda de gorras lista para lanzar', tareas:[
        {clave:'t1', titulo:'Estructura de tienda y catálogo', instrucciones:'Define estructura de la tienda Shopify. colabora con mia', responsable:'alex'},
        {clave:'t2', titulo:'Textos de la home y fichas', instrucciones:'Escribe los textos', responsable:'clara', depende_de:['t1']}]}, {signal:new AbortController().signal});
      text = 'He creado el plan. ' + r;
    } else if (/REGLAPRUEBA/.test(last) && tool('proponer_regla_memoria')) {
      const r = await tool('proponer_regla_memoria').execute({alcance:'agencia', texto:'Tutea siempre al cliente', motivo:'Lo pidió el administrador'});
      text = 'Propuesta enviada. ' + r;
    } else if (/## TAREA ASIGNADA/.test(turns.map(t=>t.content).join('\n')) && /colabora con mia/.test(last) && tool('pedir_colaboracion')) {
      const r = await tool('pedir_colaboracion').execute({agente:'mia', peticion:'Propón la navegación y la home'});
      text = 'Borrador inicial. ' + r;
    } else if (/APROBACIONPRUEBA/.test(last) && tool('solicitar_aprobacion')) {
      const r = await tool('solicitar_aprobacion').execute({accion:'Publicar el tema en producción', detalle:'Cambios en la home'});
      text = 'Pedido. ' + r;
    } else {
      text = '## Respuesta simulada\n\nEsto es una **respuesta de prueba** número ' + calls + '.\n\n- punto uno\n- punto dos\n\n| Col | Valor |\n|---|---|\n| a | 1 |\n\n```js\nconsole.log("hola")\n```';
    }
    if (opts.onText) { opts.onText({text:text.slice(0,20), delta:text.slice(0,20)}); await new Promise(r=>setTimeout(r,60)); opts.onText({text, delta:text.slice(20)}); }
    return { text, truncated:false, modelTierApplied: opts.modelTier||'default' };
  }
  sample.limits = async()=>({maxPromptBytes:262144, tools:{maxCount:20}, images:{maxCount:4,maxInputBytes:2e7,mediaTypes:['image/png','image/jpeg']}});
  sample.json = async()=>({});
  window.__sampleCalls = () => calls;
  const caps = { db, sample, downloads: { save: async ({filename})=>{ window.__saved=(window.__saved||[]).concat([filename]); return {status:'saved'}; } }, assets: null };
  window.claude = { use: async n => caps[n] || null };
})();
