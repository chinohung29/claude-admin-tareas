const BLOQUES = [
  { id: 'admin', nombre: 'Administrativo', desc: 'Excluye puestos junior.' },
  { id: 'ia', nombre: 'IA, programación y automatización', desc: 'Desarrollo, automatización de procesos y herramientas. No se suman avisos que exijan título de ingeniero.' },
  { id: 'odoo', nombre: 'Odoo', desc: 'Excluye junior y requisito excluyente de implementadora o partner certificado.' }
];


const SUPABASE_URL = 'https://bclqrmeeqssvqovkvvkz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_CE2MOsoNw_D0aCvWcbYk0w_INz9XXX1';
const uid = () => (session && session.user ? session.user.id : 'anon');
const cacheKey = () => 'lmh_job_cache_v3:' + uid();
const pendKey = () => 'lmh_job_pending_v3:' + uid();
const TYC_VERSION = '2026-10-v1';
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const TODAY = new Date();

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let items = [];
let state = { status: {}, archived: {}, removed: {}, custom: [] };
let session = null;
let perfil = null;
let consentCV = false;

function readJSON(k, fallback) {
  try { const raw = localStorage.getItem(k); if (raw) return JSON.parse(raw); } catch (e) {}
  return fallback;
}
function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

function applyEstados(rows) {
  state.status = {}; state.archived = {}; state.removed = {};
  rows.forEach(r => applyEstado(r));
}
function applyEstado(r) {
  state.status[r.job_id] = r.status;
  if (r.archived === null || r.archived === undefined) delete state.archived[r.job_id]; else state.archived[r.job_id] = r.archived;
  if (r.removed) state.removed[r.job_id] = true; else delete state.removed[r.job_id];
}
function rowOf(id) {
  return { user_id: uid(), job_id: id, status: state.status[id] || 'pendiente', archived: state.archived[id] === undefined ? null : state.archived[id], removed: !!state.removed[id], updated_at: new Date().toISOString() };
}

// Los cambios que no se pudieron subir (sin conexión) se reintentan al volver.
async function guardar(ids) {
  const pend = readJSON(pendKey(), {});
  ids.forEach(id => { pend[id] = rowOf(id); });
  writeJSON(pendKey(), pend);
  guardarCache();
  await vaciarPendientes();
}
async function vaciarPendientes() {
  const pend = readJSON(pendKey(), {});
  const rows = Object.values(pend).map(r => ({ ...r, user_id: uid() }));
  if (!rows.length || !session) return;
  const { error } = await sb.from('estados').upsert(rows, { onConflict: 'user_id,job_id' });
  if (!error) writeJSON(pendKey(), {});
}
function guardarCache() { writeJSON(cacheKey(), { items, state }); }

function allItems() { return items.concat(state.custom); }
function daysAgo(iso) {
  if (!iso) return null;
  return Math.floor((TODAY - new Date(iso + 'T12:00:00')) / 86400000);
}
function fmtFecha(iso) {
  if (!iso) return '';
  const p = iso.split('-');
  return parseInt(p[2], 10) + ' ' + MESES[parseInt(p[1], 10) - 1];
}
function isArchived(i) {
  const a = state.archived[i.id];
  if (a === true) return true;
  if (a === false) return false;
  if (i.archivado) return true;
  const n = daysAgo(i.iso);
  return n !== null && n > 15 && (state.status[i.id] || 'pendiente') === 'pendiente';
}
function archiveReason(i) {
  if (i.motivo) return i.motivo;
  const n = daysAgo(i.iso);
  if (n !== null && n > 15 && state.archived[i.id] !== true) return 'Publicado hace más de 15 días';
  return 'Archivado por vos';
}
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function est(i) { return state.status[i.id] || 'pendiente'; }

function setStatus(id, s) { state.status[id] = s; render(); guardar([id]); }
function setArchived(id, v) { state.archived[id] = v; render(); guardar([id]); }
async function addCustom(bloque, titulo, empresa, modalidad, url) {
  if (!titulo) return;
  const it = { id: 'custom_' + Date.now(), bloque, titulo, empresa, modalidad, url: url || null, iso: TODAY.toISOString().slice(0, 10) };
  const { error } = await sb.from('manuales').insert(it);
  if (error) { alert('No se pudo guardar. Revisá la conexión e intentá de nuevo.'); return; }
  state.custom.push({ ...it, custom: true });
  guardarCache(); render();
}
async function removeCustom(id) {
  const { error } = await sb.from('manuales').delete().eq('id', id);
  if (error) { alert('No se pudo eliminar. Revisá la conexión.'); return; }
  state.custom = state.custom.filter(i => i.id !== id);
  delete state.status[id]; delete state.archived[id]; delete state.removed[id];
  await sb.from('estados').delete().eq('job_id', id);
  guardarCache(); render();
}

function link(i) {
  return i.url ? ' · <a href="' + esc(i.url) + '" target="_blank" rel="noopener">' + (i.enlace === 'busqueda' ? 'abrir búsqueda' : 'abrir aviso') + '</a>' : '';
}

function rowFor(i, archivedView) {
  const st = est(i);
  const row = document.createElement('div');
  row.className = 'item ' + st;
  const fecha = i.iso ? 'Publicado: ' + fmtFecha(i.iso) : 'Fecha sin verificar';
  const motivo = archivedView ? ' · ' + esc(archiveReason(i)) : '';
  row.innerHTML =
    `<div class="info">
       <div class="titulo">${esc(i.titulo)}</div>
       <div class="meta">${esc(i.empresa)}${i.modalidad ? ' <span class="tag">' + esc(i.modalidad) + '</span>' : ''}${i.nuevo && !archivedView ? ' <span class="tag nuevo">Nuevo</span>' : ''}</div>
       <div class="meta">${fecha} · ${esc(i.salario || 'A convenir')}${link(i)}${i.enlace === 'busqueda' ? ' <span class="tag vig-nv">Link de búsqueda, no del aviso</span>' : ''}${motivo}</div>
     </div>
     <div class="status">
       <button type="button" data-s="pendiente" class="${st === 'pendiente' ? 'active' : ''}">Pendiente</button>
       <button type="button" data-s="postulado" class="${st === 'postulado' ? 'active' : ''}">Postulado</button>
       <button type="button" data-s="descartado" class="${st === 'descartado' ? 'active' : ''}">Descartado</button>
       <button type="button" class="arch">${archivedView ? 'Restaurar' : 'Archivar'}</button>
       ${i.custom ? '<button type="button" class="remove" title="Eliminar">✕</button>' : ''}
     </div>`;
  row.querySelectorAll('button[data-s]').forEach(b => b.addEventListener('click', () => setStatus(i.id, b.dataset.s)));
  row.querySelector('.arch').addEventListener('click', () => setArchived(i.id, !archivedView));
  const rm = row.querySelector('.remove');
  if (rm) rm.addEventListener('click', () => removeCustom(i.id));
  return row;
}

const FILTROS = [
  { id: 'activas', nombre: 'Activas' },
  { id: 'archivadas', nombre: 'Archivadas' },
  { id: 'descartadas', nombre: 'Descartadas' },
  { id: 'todas', nombre: 'Todas' }
];
let filtro = readJSON('lmh_filtro', 'activas');
function categoria(i) { return est(i) === 'descartado' ? 'descartadas' : isArchived(i) ? 'archivadas' : 'activas'; }
document.getElementById('tally').addEventListener('click', e => {
  const b = e.target.closest('button[data-f]');
  if (!b) return;
  filtro = b.dataset.f; writeJSON('lmh_filtro', filtro); render();
});

// ---- Búsqueda en los portales: enlaces a las búsquedas, sin leer ni copiar nada de los portales ----
const KW_DEFECTO = {
  admin: ['analista administrativo', 'analista de cobranzas', 'analista de facturación', 'cuentas a pagar'],
  ia: ['automatización de procesos', 'desarrollador IA', 'desarrollador web', 'analista de datos'],
  odoo: ['analista funcional odoo', 'consultor odoo', 'implementador odoo']
};
const slugBusqueda = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const PORTALES = [
  { n: 'Computrabajo', u: k => 'https://ar.computrabajo.com/trabajo-de-' + slugBusqueda(k) },
  { n: 'Indeed', u: k => 'https://ar.indeed.com/jobs?q=' + encodeURIComponent(k) + '&l=Argentina&fromage=14' },
  { n: 'Bumeran', u: k => 'https://www.bumeran.com.ar/empleos-busqueda-' + slugBusqueda(k) + '.html' },
  { n: 'LinkedIn', u: k => 'https://www.linkedin.com/jobs/search/?keywords=' + encodeURIComponent(k) + '&location=Argentina&f_TPR=r1296000' }
];
const kwElegida = {};
const portalesAbierto = {};
function palabrasClave(bloque) {
  // Con análisis del CV mandan sus búsquedas (una lista vacía = el CV no apunta a ese rubro); sin CV, las de ejemplo.
  const pk = perfil && perfil.analisis && perfil.analisis.palabras_clave;
  if (pk && typeof pk === 'object') return { lista: Array.isArray(pk[bloque]) ? pk[bloque].map(String) : [], deCV: true };
  return { lista: KW_DEFECTO[bloque], deCV: false };
}
// El nombre de cada bloque lo da el análisis del CV (p. ej. "Salud"); sin análisis, el original.
function nombreBloque(id) {
  const al = perfil && perfil.analisis;
  const x = al && Array.isArray(al.bloques) && al.bloques.find(b => b.id === id);
  if (al && !x && hayAnalisis()) return 'Búsquedas anteriores'; // rubro que el CV actual ya no busca: solo quedan avisos viejos
  return x ? x.nombre : (BLOQUES.find(b => b.id === id) || {}).nombre || id;
}
const hayAnalisis = () => !!(perfil && perfil.analisis && perfil.analisis.palabras_clave);
function portalesPara(b) {
  const { lista, deCV } = palabrasClave(b.id);
  if (!lista.length) return document.createDocumentFragment();
  if (!lista.includes(kwElegida[b.id])) kwElegida[b.id] = lista[0];
  const det = document.createElement('details');
  det.className = 'portales';
  det.open = !!portalesAbierto[b.id];
  det.addEventListener('toggle', () => { portalesAbierto[b.id] = det.open; });
  det.innerHTML = '<summary>Buscar en los portales de empleo</summary>' +
    '<div class="portales-cuerpo"><label class="meta">Búsqueda: <select aria-label="Palabras clave de la búsqueda">' +
    lista.map(k => '<option' + (k === kwElegida[b.id] ? ' selected' : '') + '>' + esc(k) + '</option>').join('') +
    '</select></label><div class="portales-links"></div>' +
    '<p class="meta">' + (deCV ? 'Las palabras clave salen del análisis de tu CV.' : 'Palabras clave de ejemplo: cargá tu CV y se adaptan a tu perfil.') +
    ' Indeed y LinkedIn ya muestran solo los últimos 15 días; en Computrabajo y Bumeran ordená por fecha en la página. Se abre el portal original, donde te postulás vos.</p></div>';
  const pintar = () => {
    det.querySelector('.portales-links').innerHTML = PORTALES.map(p =>
      '<a class="btn-portal" href="' + esc(p.u(kwElegida[b.id])) + '" target="_blank" rel="noopener">' + p.n + '</a>').join('');
  };
  det.querySelector('select').addEventListener('change', e => { kwElegida[b.id] = e.target.value; pintar(); });
  pintar();
  return det;
}

function render() {
  const all = allItems();
  const n = { activas: 0, archivadas: 0, descartadas: 0, todas: all.length, pendiente: 0, postulado: 0 };
  all.forEach(i => {
    const c = categoria(i); n[c]++;
    if (c === 'activas') n[est(i)]++;
  });
  document.getElementById('tally').innerHTML =
    FILTROS.map(f => `<button type="button" data-f="${f.id}" class="${filtro === f.id ? 'on' : ''}">${f.nombre} <span class="n">${n[f.id]}</span></button>`).join('') +
    `<span class="resumen">Pendientes <span class="n">${n.pendiente}</span> · Postulados <span class="n">${n.postulado}</span></span>`;

  const seg = document.getElementById('seguimiento');
  seg.innerHTML = '';
  const post = all.filter(i => est(i) === 'postulado');
  if (filtro === 'activas' && post.length) {
    const box = document.createElement('section');
    box.className = 'bloque';
    box.innerHTML = '<h2>Seguimiento de postulados</h2><p class="desc">Avisos a los que te postulaste. Confirmá a mano que sigan vigentes.</p><div class="items"></div>';
    const w = box.querySelector('.items');
    post.forEach(i => {
      const r = document.createElement('div');
      r.className = 'item';
      r.innerHTML = '<div class="info"><div class="titulo">' + esc(i.titulo) + '</div><div class="meta">' + esc(i.empresa) + link(i) + '</div></div>';
      w.appendChild(r);
    });
    seg.appendChild(box);
  }

  const cont = document.getElementById('bloques');
  cont.innerHTML = '';
  const vacio = { activas: 'No hay ofertas activas en este bloque.', archivadas: 'No hay archivadas.', descartadas: 'No hay descartadas.', todas: 'No hay ofertas.' };
  // Con el CV analizado, solo se muestran los rubros a los que apunta el perfil (y los que ya tengan avisos).
  BLOQUES.filter(b => !hayAnalisis() || palabrasClave(b.id).lista.length || all.some(i => i.bloque === b.id && (filtro === 'todas' || categoria(i) === filtro))).forEach(b => {
    const sec = document.createElement('section');
    sec.className = 'bloque';
    sec.innerHTML =
      `<h2>${esc(nombreBloque(b.id))}</h2>
       <p class="desc">${hayAnalisis() ? 'Ofertas ordenadas por coincidencia con tu CV.' : b.desc}</p>
       <div class="items"></div>
       <form class="add">
         <input name="titulo" placeholder="Puesto" required>
         <input name="empresa" placeholder="Empresa">
         <input name="modalidad" placeholder="Modalidad">
         <input name="url" placeholder="Link" type="url">
         <button type="submit">Agregar</button>
       </form>`;
    const wrap = sec.querySelector('.items');
    sec.insertBefore(portalesPara(b), wrap);
    const lista = all.filter(i => i.bloque === b.id && (filtro === 'todas' || categoria(i) === filtro))
      .sort((x, y) => (x.prio || 99) - (y.prio || 99));
    if (!lista.length) wrap.innerHTML = '<p class="meta">' + vacio[filtro] + '</p>';
    lista.forEach(i => wrap.appendChild(rowFor(i, categoria(i) === 'archivadas')));
    sec.querySelector('form.add').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target;
      addCustom(b.id, f.titulo.value.trim(), f.empresa.value.trim(), f.modalidad.value.trim(), f.url.value.trim());
      f.reset();
    });
    cont.appendChild(sec);
  });
}
function showAviso() {
  document.getElementById('aviso').textContent =
    'Cada bloque está ordenado por prioridad según coincidencia con tu perfil. Si no figura sueldo, queda como A convenir. Los avisos nuevos son los publicados en los últimos 15 días; cuando la fecha dice "sin verificar", revisala directo en el aviso.';
}

function mostrarLogin(msg) {
  document.getElementById('app').hidden = true;
  document.getElementById('login').hidden = false;
  document.getElementById('loginMsg').textContent = msg || '';
}
function mostrarApp() {
  document.getElementById('login').hidden = true;
  document.getElementById('app').hidden = false;
}

async function cargar() {
  const [o, e, m] = await Promise.all([
    sb.from('ofertas').select('*').order('prio', { nullsFirst: false }).order('created_at', { ascending: false }),
    sb.from('estados').select('*'),
    sb.from('manuales').select('*')
  ]);
  if (o.error || e.error || m.error) {
    document.getElementById('aviso').textContent = 'Sin conexión con el servidor: se muestra lo último guardado en este dispositivo.';
    return false;
  }
  items = o.data;
  applyEstados(e.data);
  state.custom = m.data.map(r => ({ ...r, custom: true }));
  // Lo que quedó sin subir manda sobre lo del servidor.
  Object.values(readJSON(pendKey(), {})).forEach(r => applyEstado(r));
  guardarCache();
  showAviso();
  render();
  vaciarPendientes();
  cargarPerfil();
  cargarCuenta();
  return true;
}


// ---- Perfil (CV) ----
async function cargarPerfil() {
  const { data, error } = await sb.from('perfil').select('*').maybeSingle();
  if (error) return;
  perfil = data;
  const c = await sb.from('consentimientos').select('id').eq('tipo', 'cv_ia_transferencia').eq('version', TYC_VERSION).limit(1);
  consentCV = !c.error && c.data.length > 0;
  renderPerfil();
  render();
}

function lista(titulo, arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return '<h3>' + esc(titulo) + '</h3><ul>' + arr.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
}

function renderPerfil() {
  const box = document.getElementById('perfilInfo');
  if (!perfil || !perfil.cv_texto) {
    box.innerHTML = '<p class="meta">Todavía no cargaste tu CV.</p>';
    return;
  }
  const cv = new Date(perfil.cv_actualizado);
  const al = perfil.analisis;
  const actual = al && perfil.analisis_de_cv && new Date(perfil.analisis_de_cv) >= cv;
  let html = '<p class="meta">CV cargado: <b>' + esc(perfil.cv_nombre || 'texto pegado') + '</b> · ' + fmtFecha(cv.toISOString().slice(0, 10)) + ' · ' + perfil.cv_texto.length + ' caracteres</p>';
  if (!al) {
    html += '<p class="meta">Todavía no se analizó tu CV. Se analiza cuando buscás ofertas.</p>';
  } else {
    if (!actual) html += '<p class="meta">Cargaste un CV nuevo: el análisis de abajo es del anterior y se actualiza al buscar ofertas.</p>';
    html += '<div class="analisis">' +
      (al.resumen ? '<p class="meta">' + esc(al.resumen) + (al.seniority ? ' · Nivel: ' + esc(al.seniority) : '') + '</p>' : '') +
      lista('Fortalezas', al.fortalezas) + lista('Oportunidades', al.oportunidades) +
      (al.palabras_clave ? BLOQUES.map(b => lista('Búsquedas: ' + nombreBloque(b.id), al.palabras_clave[b.id])).join('') : '') +
      '</div>';
  }
  box.innerHTML = html;
  renderEleccion();
}

// ---- Mis búsquedas: hasta 3 rubros a elegir entre los sugeridos por el CV y el resto del catálogo ----
const catalogoBus = () => (perfil && perfil.analisis && Array.isArray(perfil.analisis.catalogo)) ? perfil.analisis.catalogo : [];
function renderEleccion() {
  const cat = catalogoBus(), box = document.getElementById('eleccion');
  box.hidden = !cat.length;
  if (!cat.length) return;
  const manual = Array.isArray(perfil.busquedas_elegidas) && perfil.busquedas_elegidas.length ? perfil.busquedas_elegidas : null;
  const actuales = manual || cat.filter(c => c.automatico).map(c => c.id);
  const opt = c => '<option value="' + esc(c.id) + '">' + esc(c.nombre) + '</option>';
  const html = '<option value="">— Sin elegir —</option>' +
    '<optgroup label="Sugeridas por tu CV">' + cat.filter(c => c.sugerido).map(opt).join('') + '</optgroup>' +
    '<optgroup label="Otros rubros">' + cat.filter(c => !c.sugerido).map(opt).join('') + '</optgroup>';
  [1, 2, 3].forEach(n => {
    const sel = document.getElementById('bus' + n);
    sel.innerHTML = html;
    sel.value = actuales[n - 1] || '';
    infoBus(n);
  });
}
function infoBus(n) {
  const id = document.getElementById('bus' + n).value, c = catalogoBus().find(x => x.id === id);
  document.getElementById('busInfo' + n).textContent = c ? 'Busca: ' + c.terminos.join(', ') : '';
}
[1, 2, 3].forEach(n => document.getElementById('bus' + n).addEventListener('change', () => infoBus(n)));
function busMsg(t) { const m = document.getElementById('busMsg'); m.hidden = !t; m.textContent = t || ''; }
async function guardarEleccion(auto) {
  const cat = catalogoBus();
  let elegidas = auto ? [] : [1, 2, 3].map(n => document.getElementById('bus' + n).value).filter(Boolean);
  if (new Set(elegidas).size !== elegidas.length) { busMsg('Elegiste el mismo rubro más de una vez. Cada búsqueda tiene que ser distinta.'); return; }
  if (!auto && !elegidas.length) { busMsg('Elegí al menos un rubro, o tocá "Volver a la selección automática".'); return; }
  // Si coincide con la selección automática, se guarda como automática: así sigue a tu CV si lo actualizás.
  const autoIds = cat.filter(c => c.automatico).map(c => c.id);
  if (elegidas.length === autoIds.length && elegidas.every(id => autoIds.includes(id))) elegidas = [];
  const btns = [document.getElementById('busGuardar'), document.getElementById('busAuto')];
  btns.forEach(b => b.disabled = true); busMsg('Guardando…');
  const valor = elegidas.length ? elegidas : null;
  const { error } = await sb.from('perfil').update({ busquedas_elegidas: valor }).eq('user_id', uid());
  if (error) { btns.forEach(b => b.disabled = false); busMsg('No se pudo guardar: ' + error.message); return; }
  perfil = { ...perfil, busquedas_elegidas: valor };
  busMsg('Guardado. Buscando ofertas con tu elección…');
  await buscarOfertas(false, 'eleccion');
  btns.forEach(b => b.disabled = false);
  busMsg(document.getElementById('buscarMsg').textContent);
}
document.getElementById('busGuardar').addEventListener('click', () => guardarEleccion(false));
document.getElementById('busAuto').addEventListener('click', () => guardarEleccion(true));

function cvMsg(t) {
  const m = document.getElementById('cvMsg');
  m.hidden = !t; m.textContent = t || '';
}
function cvEditar(texto, nombre) {
  document.getElementById('cvConsent').checked = false;
  document.getElementById('cvGuardar').disabled = true;
  document.getElementById('cvTexto').value = texto;
  document.getElementById('cvEditor').dataset.nombre = nombre || '';
  document.getElementById('cvEditor').hidden = false;
}
document.getElementById('cvFile').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  cvMsg('Leyendo el archivo…');
  try {
    cvEditar(await cvExtraer(f), f.name);
    cvMsg('Revisá el texto extraído, corregilo si hace falta y guardalo.');
  } catch (err) { cvMsg(err.message); }
  e.target.value = '';
});
document.getElementById('cvPegar').addEventListener('click', () => { cvEditar('', 'texto pegado'); cvMsg(''); });
document.getElementById('cvCancelar').addEventListener('click', () => { document.getElementById('cvEditor').hidden = true; cvMsg(''); });
document.getElementById('cvConsent').addEventListener('change', e => { document.getElementById('cvGuardar').disabled = !e.target.checked; });
document.getElementById('cvGuardar').addEventListener('click', async () => {
  if (!document.getElementById('cvConsent').checked) { cvMsg('Para guardar el CV tenés que dar tu consentimiento.'); return; }
  const texto = document.getElementById('cvTexto').value.trim().slice(0, CV_MAX_CHARS);
  if (texto.length < 80) { cvMsg('El texto es muy corto para analizarlo.'); return; }
  const fila = { user_id: uid(), cv_nombre: document.getElementById('cvEditor').dataset.nombre || null, cv_texto: texto, cv_actualizado: new Date().toISOString() };
  if (!consentCV) {
    const c = await sb.from('consentimientos').insert({ tipo: 'cv_ia_transferencia', version: TYC_VERSION, origen: 'carga_cv' });
    if (c.error) { cvMsg('No se pudo registrar tu consentimiento: ' + c.error.message); return; }
    consentCV = true;
  }
  const { error } = await sb.from('perfil').upsert(fila, { onConflict: 'user_id' });
  if (error) { cvMsg('No se pudo guardar: ' + error.message); return; }
  perfil = { ...(perfil || {}), ...fila };
  document.getElementById('cvEditor').hidden = true;
  cvMsg('CV guardado. Analizando tu perfil y buscando ofertas acordes…');
  renderPerfil();
  await buscarOfertas(true);
});

let canal = null;
function suscribir() {
  if (canal) return;
  canal = sb.channel('estados-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'estados' }, p => {
      if (p.new && p.new.user_id && p.new.user_id !== uid()) return;
      if (p.eventType === 'DELETE') {
        const id = p.old && p.old.job_id;
        if (id) { delete state.status[id]; delete state.archived[id]; delete state.removed[id]; }
      } else if (!readJSON(pendKey(), {})[p.new.job_id]) {
        applyEstado(p.new);
      }
      guardarCache(); render();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, p => {
      if (p.new && p.new.id === uid()) { cuenta = p.new; renderPlan(); }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'perfil' }, p => {
      if (p.new && p.new.user_id === uid()) { perfil = p.new; renderPerfil(); render(); }
    })
    .subscribe();
}

async function entrar(s) {
  session = s;
  if (!s) { mostrarLogin(); return; }
  mostrarApp();
  tutorialPrimeraVez();
  const cache = readJSON(cacheKey(), null);
  if (cache) { items = cache.items || []; state = cache.state || state; showAviso(); render(); }
  await cargar();
  suscribir();
}

document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  const msg = document.getElementById('loginMsg');
  msg.textContent = 'Entrando…';
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  msg.textContent = error ? 'No se pudo entrar: ' + (error.message === 'Invalid login credentials' ? 'email o contraseña incorrectos.' : error.message) : '';
});
document.getElementById('crearAbrir').addEventListener('click', () => {
  const f = document.getElementById('signupForm');
  f.hidden = !f.hidden;
});
document.getElementById('signupForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('signupEmail').value.trim();
  const a = document.getElementById('signupPass').value, b = document.getElementById('signupPass2').value;
  const msg = document.getElementById('loginMsg');
  if (!document.getElementById('signupAcepto').checked) { msg.textContent = 'Para crear la cuenta tenés que aceptar los Términos y la Política de Privacidad.'; return; }
  if (a !== b) { msg.textContent = 'Las contraseñas no coinciden.'; return; }
  msg.textContent = 'Creando la cuenta…';
  const { data, error } = await sb.auth.signUp({ email, password: a, options: { emailRedirectTo: location.origin + location.pathname, data: { acepto_tyc_version: TYC_VERSION } } });
  if (error) { msg.textContent = 'No se pudo crear la cuenta: ' + error.message; return; }
  if (data.session) { msg.textContent = ''; return; }
  msg.textContent = 'Te enviamos un mail a ' + email + '. Abrí el link para confirmar tu cuenta y después entrá con tu contraseña.';
});
document.getElementById('logout').addEventListener('click', async () => {
  try { localStorage.removeItem(cacheKey()); } catch (e) {}
  await sb.auth.signOut();
});

sb.auth.onAuthStateChange((evento, s) => {
  if (evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') {
    if (evento === 'SIGNED_IN' && session && s && session.user.id === s.user.id) return;
    if (evento === 'SIGNED_OUT' && canal) { sb.removeChannel(canal); canal = null; }
    setTimeout(() => entrar(s), 0);
  }
});

// Estado de conexión
function conexion() { document.getElementById('offline').hidden = navigator.onLine; }
window.addEventListener('online', () => { conexion(); if (session) cargar(); });
window.addEventListener('offline', conexion);
conexion();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

document.getElementById('fecha').textContent = TODAY.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });


// ---- Instalación de la app (celular) ----
let promptInstalar = null;
const esStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const esMovil = () => esIOS() || /Android/i.test(navigator.userAgent);
const instaladaOculta = () => { const t = Number(readJSON('lmh_instalar_off', 0)); return t && Date.now() - t < 7 * 86400000; };

function actualizarInstalar() {
  const banner = document.getElementById('instalarBanner');
  const texto = document.getElementById('instalarTexto');
  const si = document.getElementById('instalarSi'), como = document.getElementById('instalarComo');
  si.hidden = como.hidden = true;
  if (esStandalone() || instaladaOculta() || !(esMovil() || promptInstalar)) { banner.hidden = true; return; }
  if (promptInstalar) {
    texto.textContent = 'Instalá la app en tu dispositivo para abrirla como una aplicación, con su propio ícono y sin la barra del navegador.';
    si.hidden = false;
  } else if (esIOS()) {
    texto.textContent = 'Para instalarla en tu iPhone o iPad: abrí esta página en Safari, tocá Compartir y elegí «Añadir a pantalla de inicio».';
    como.hidden = false;
  } else {
    texto.textContent = 'Para instalarla: abrí el menú del navegador (los tres puntos) y elegí «Instalar app» o «Añadir a pantalla de inicio».';
  }
  banner.hidden = false;
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstalar = e; actualizarInstalar(); });
window.addEventListener('appinstalled', () => { promptInstalar = null; actualizarInstalar(); });
document.getElementById('instalarSi').addEventListener('click', async () => {
  if (!promptInstalar) return;
  promptInstalar.prompt();
  const r = await promptInstalar.userChoice;
  promptInstalar = null;
  if (r && r.outcome === 'accepted') writeJSON('lmh_instalar_off', Date.now());
  actualizarInstalar();
});
document.getElementById('instalarNo').addEventListener('click', () => { writeJSON('lmh_instalar_off', Date.now()); actualizarInstalar(); });
document.getElementById('instalarComo').addEventListener('click', () => abrirTutorial(1));
actualizarInstalar();

// ---- Tutorial ----
const TUTORIAL = [
  { t: 'Bienvenido', h: `<p>Esta app es tu tablero de búsqueda laboral. Cada día un agente busca ofertas que encajan con tu perfil y las deja acá, ordenadas por coincidencia, en tres bloques: <b>Administrativo</b>, <b>IA, programación y automatización</b> y <b>Odoo</b>.</p>
    <p>En este recorrido de un minuto vas a ver cómo instalarla en el celular, cómo cargar tu CV y cómo clasificar las ofertas. Podés volver a verlo cuando quieras con el botón <b>Ayuda</b>.</p>` },
  { t: 'Instalala en tu celular', h: `<p>Instalada, se abre como una app más, con su ícono y a pantalla completa.</p>
    <p><b>Android (Chrome):</b> tocá <b>Instalar</b> en el aviso de abajo, o abrí el menú ⋮ y elegí «Instalar app».</p>
    <p><b>iPhone o iPad (Safari):</b> tocá el botón <b>Compartir</b> (el cuadrado con la flecha) y elegí «Añadir a pantalla de inicio». Tiene que ser desde Safari, no desde otro navegador.</p>
    <p>Después abrila desde el ícono. Tu sesión y tus datos se mantienen.</p>` },
  { t: 'Cargá tu CV', h: `<p>En la sección <b>Mi perfil (CV)</b>:</p>
    <ol><li>Tocá <b>Elegir archivo</b> y seleccioná tu CV: PDF, DOCX, TXT o MD, de hasta 8 MB.</li>
    <li>Revisá el texto que aparece y corregilo si hace falta. El archivo se lee en tu dispositivo: <b>no se sube</b>, solo se guarda el texto.</li>
    <li>Tocá <b>Guardar CV</b>.</li></ol>
    <p>Si tu PDF es una imagen escaneada no tiene texto que leer: usá <b>Pegar texto</b> y pegá el contenido de tu CV.</p>
    <p>Al guardarlo, el agente lo analiza y busca ofertas acordes a tu perfil: acá vas a ver tus <b>fortalezas</b>, <b>oportunidades</b> y las búsquedas que hace. Los rubros salen de tu CV, no de una lista fija. Si cargás otro CV, se vuelve a analizar. En <b>Mis búsquedas</b> podés elegir hasta 3 rubros entre los que sugiere tu CV y otros, y el agente busca por esos.</p>` },
  { t: 'Clasificá cada oferta', h: `<p>Cada tarjeta muestra puesto, empresa, modalidad (remoto, híbrido o presencial), sueldo (<i>A convenir</i> si no figura) y la fecha. Tocá <b>abrir aviso</b> para postularte en el portal.</p>
    <ul><li><b>Pendiente:</b> todavía no decidiste.</li>
    <li><b>Postulado:</b> ya te postulaste. Pasa a «Seguimiento de postulados».</li>
    <li><b>Descartado:</b> no te interesa. Sale de la lista y el agente no te la vuelve a proponer.</li>
    <li><b>Archivar:</b> la guardás para después sin que moleste. «Restaurar» la devuelve.</li></ul>
    <p>Si la fecha dice <i>Fecha sin verificar</i>, revisala directo en el aviso antes de postularte.</p>` },
  { t: 'Filtros y uso diario', h: `<p>Arriba de la lista están los filtros: <b>Activas</b> (las que tenés para trabajar hoy), <b>Archivadas</b>, <b>Descartadas</b> y <b>Todas</b>. Los números te dicen cuántas hay en cada uno. Las pendientes de más de 15 días se archivan solas.</p>
    <p>También podés <b>agregar a mano</b> una oferta que encontraste vos, con el formulario al final de cada bloque.</p>
    <p>Sin conexión la app sigue funcionando: tus cambios se guardan en el dispositivo y se sincronizan al volver.</p>` },
  { t: 'Buscá ofertas', h: `<p>Tocá <b>Buscar ofertas ahora</b>: el agente busca en portales de empleo de Argentina, según tu perfil, y deja en cada bloque las ofertas de los últimos 15 días con el enlace para postularte.</p>
    <p>Se puede buscar una vez cada pocas horas. Lo que descartes o archives no vuelve a aparecer.</p>
    <p>Un buen ritmo: buscá, clasificá lo nuevo (postular, descartar o archivar) y dejá la lista de «Activas» corta. La decisión de postularte es siempre tuya.</p>` }
];
let tutPaso = 0;
function abrirTutorial(n) {
  tutPaso = n || 0;
  const d = document.getElementById('tutorial');
  if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  pintarTutorial();
}
function cerrarTutorial() {
  const d = document.getElementById('tutorial');
  if (d.close) d.close(); else d.removeAttribute('open');
  try { localStorage.setItem('lmh_tutorial_visto', '1'); } catch (e) {}
}
function pintarTutorial() {
  const p = TUTORIAL[tutPaso], ultimo = tutPaso === TUTORIAL.length - 1;
  document.getElementById('tutPaso').textContent = 'Paso ' + (tutPaso + 1) + ' de ' + TUTORIAL.length;
  document.getElementById('tutTitulo').textContent = p.t;
  document.getElementById('tutTexto').innerHTML = p.h;
  document.getElementById('tutPuntos').innerHTML = TUTORIAL.map((_, i) => '<span class="' + (i === tutPaso ? 'on' : '') + '"></span>').join('');
  document.getElementById('tutAtras').hidden = tutPaso === 0;
  document.getElementById('tutOmitir').hidden = ultimo;
  document.getElementById('tutSiguiente').textContent = ultimo ? 'Empezar' : 'Siguiente';
  document.getElementById('tutorial').scrollTop = 0;
}
document.getElementById('tutSiguiente').addEventListener('click', () => { if (tutPaso === TUTORIAL.length - 1) cerrarTutorial(); else { tutPaso++; pintarTutorial(); } });
document.getElementById('tutAtras').addEventListener('click', () => { if (tutPaso > 0) { tutPaso--; pintarTutorial(); } });
document.getElementById('tutOmitir').addEventListener('click', cerrarTutorial);
document.getElementById('tutorial').addEventListener('cancel', () => { try { localStorage.setItem('lmh_tutorial_visto', '1'); } catch (e) {} });
document.getElementById('ayuda').addEventListener('click', () => abrirTutorial(0));
function tutorialPrimeraVez() {
  try { if (!localStorage.getItem('lmh_tutorial_visto')) abrirTutorial(0); } catch (e) {}
}


// ---- Tus datos: acceso y supresión ----
document.getElementById('descargarDatos').addEventListener('click', async () => {
  const tablas = ['profiles', 'perfil', 'estados', 'manuales', 'ofertas', 'consentimientos'];
  const res = await Promise.all(tablas.map(t => sb.from(t).select('*')));
  if (res.some(r => r.error)) { alert('No se pudieron leer tus datos. Revisá la conexión e intentá de nuevo.'); return; }
  const datos = { exportado_el: new Date().toISOString(), email: session.user.email };
  tablas.forEach((t, i) => { datos[t] = res[i].data; });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
  a.download = 'mis-datos-' + TODAY.toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
document.getElementById('eliminarCuenta').addEventListener('click', async () => {
  const t = prompt('Vas a borrar tu cuenta y todos tus datos (CV, estados, ofertas). No se puede deshacer.\n\nEscribí ELIMINAR para confirmar:');
  if (t === null) return;
  if (t.trim() !== 'ELIMINAR') { alert('No se borró nada: tenías que escribir ELIMINAR.'); return; }
  const { error } = await sb.functions.invoke('eliminar-cuenta', { method: 'POST' });
  if (error) { alert('No se pudo eliminar la cuenta. Escribinos y la eliminamos a mano.'); return; }
  try { Object.keys(localStorage).filter(k => k.startsWith('lmh_job_')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  await sb.auth.signOut();
});


// ---- Plan, cancelación y arrepentimiento ----
let cuenta = null;
async function cargarCuenta() {
  const { data, error } = await sb.from('profiles').select('*').maybeSingle();
  if (error) return;
  cuenta = data;
  renderPlan();
}
async function msgError(error) {
  try { const r = await error.context.json(); return r.error || error.message; } catch (e) { return error.message; }
}
function planMsg(t) { const m = document.getElementById('planMsg'); m.hidden = !t; m.textContent = t || ''; }
function fecha(iso) { return iso ? fmtFecha(String(iso).slice(0, 10)) : ''; }
function renderPlan() {
  const box = document.getElementById('planInfo');
  const sus = document.getElementById('planSuscribir'), can = document.getElementById('planCancelar');
  sus.hidden = can.hidden = true;
  if (!cuenta) { box.innerHTML = ''; return; }
  const vence = cuenta.plan_vence_el ? new Date(cuenta.plan_vence_el) : null;
  let html;
  const prueba = cuenta.plan_prueba_hasta && new Date(cuenta.plan_prueba_hasta) > new Date() ? new Date(cuenta.plan_prueba_hasta) : null;
  if (cuenta.plan === 'pro' && cuenta.mp_preapproval_id && prueba) {
    html = '<p class="meta"><b>Plan Pro en prueba gratis hasta el ' + fecha(prueba.toISOString()) + '.</b> No se te cobró nada. El primer cobro de $10.000 es el ' + fecha(prueba.toISOString()) +
      ' y después se renueva cada mes. Si cancelás antes, no se te cobra.' + '</p>';
    can.hidden = false;
  } else if (cuenta.plan === 'pro' && cuenta.mp_preapproval_id) {
    html = '<p class="meta"><b>Plan Pro activo.</b> Se renueva cada mes' + (cuenta.plan_desde ? ' (contratado el ' + fecha(cuenta.plan_desde) + ')' : '') + '.' +
      (vence ? ' <b>Hay un problema con tu último cobro:</b> regularizalo en Mercado Pago antes del ' + fecha(vence.toISOString()) + ' para no perder el plan.' : '') + '</p>';
    can.hidden = false;
  } else if (cuenta.plan === 'pro' && vence && vence > new Date()) {
    html = '<p class="meta"><b>Plan Pro hasta el ' + fecha(vence.toISOString()) + '.</b> No se va a renovar.</p>';
    sus.hidden = false; sus.textContent = 'Reactivar el plan Pro · $10.000 por mes';
  } else if (cuenta.plan === 'cancelado' || cuenta.plan === 'pro') {
    html = '<p class="meta">Tu plan Pro terminó. Seguís con el plan gratuito.</p>';
    sus.hidden = false; sus.textContent = 'Volver al plan Pro · $10.000 por mes';
  } else {
    html = '<p class="meta">Estás en el <b>plan gratuito</b>.</p>';
    sus.hidden = false;
    sus.textContent = cuenta.plan_desde ? 'Pasarme al plan Pro · $10.000 por mes' : 'Probar 7 días gratis · después $10.000 por mes';
  }
  box.innerHTML = html;
}
document.getElementById('planSuscribir').addEventListener('click', async () => {
  planMsg('Preparando el pago en Mercado Pago…');
  const { data, error } = await sb.functions.invoke('mp-crear-suscripcion', { method: 'POST', body: {} });
  if (error) { planMsg(await msgError(error)); return; }
  if (data && data.init_point) { planMsg('Te llevamos a Mercado Pago.' + (data.prueba_dias ? ' Tenés ' + data.prueba_dias + ' días de prueba gratis: el primer cobro es al terminar la prueba.' : '') + ' Cuando termines, volvé a la app: el plan se activa en unos minutos.'); location.href = data.init_point; }
});
document.getElementById('planCancelar').addEventListener('click', async () => {
  const enPrueba = !!(cuenta && cuenta.plan_prueba_hasta && new Date(cuenta.plan_prueba_hasta) > new Date());
  if (!confirm(enPrueba ? '¿Cancelar la suscripción? Conservás el plan Pro hasta que termine la prueba gratis y no se te cobra nada.' : '¿Cancelar la suscripción? Conservás el plan Pro hasta el fin del período que ya pagaste y no se vuelve a cobrar.')) return;
  planMsg('Cancelando…');
  const { data, error } = await sb.functions.invoke('mp-cancelar-suscripcion', { method: 'POST', body: {} });
  if (error) { planMsg(await msgError(error)); return; }
  planMsg('Suscripción cancelada. Conservás el plan Pro hasta el ' + fecha(data && data.plan_vence_el) + '.');
  cargarCuenta();
});

// Botón de arrepentimiento (Res. 424/2020): visible en la pantalla de inicio y en la app.
const dlgArr = document.getElementById('arrepentimiento');
function arrMsg(t) { const m = document.getElementById('arrMsg'); m.hidden = !t; m.textContent = t || ''; }
document.querySelectorAll('[data-arrep]').forEach(b => b.addEventListener('click', () => {
  const conSesion = !!session;
  document.getElementById('arrAccion').hidden = !conSesion;
  document.getElementById('arrConfirmar').hidden = !conSesion;
  arrMsg(conSesion ? '' : 'Para revocar tu contratación, iniciá sesión con la cuenta con la que contrataste y volvé a tocar este botón.');
  document.getElementById('arrMotivo').value = '';
  if (dlgArr.showModal) dlgArr.showModal(); else dlgArr.setAttribute('open', '');
}));
document.getElementById('arrCerrar').addEventListener('click', () => { if (dlgArr.close) dlgArr.close(); else dlgArr.removeAttribute('open'); });
document.getElementById('arrConfirmar').addEventListener('click', async () => {
  const btn = document.getElementById('arrConfirmar');
  btn.disabled = true; arrMsg('Procesando tu solicitud…');
  const { data, error } = await sb.functions.invoke('mp-arrepentimiento', { method: 'POST', body: { motivo: document.getElementById('arrMotivo').value.trim() } });
  btn.disabled = false;
  if (error) { arrMsg(await msgError(error)); return; }
  document.getElementById('arrAccion').hidden = true; btn.hidden = true;
  arrMsg('Listo: revocaste tu contratación. Tu código de identificación es ' + data.numero_reclamo + '. Guardalo. El plan Pro se cortó.' + (data.en_prueba ? ' Estabas en la prueba gratis: no se te cobró nada, así que no hay nada que devolver.' : ' Vamos a gestionar la devolución de lo pagado por el mismo medio de pago.'));
  cargarCuenta();
});


// ---- Buscar ofertas ahora (agente) ----
function horaLocal(iso) { return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }); }
document.getElementById('buscarAhora').addEventListener('click', () => buscarOfertas(false));
async function buscarOfertas(trasCV, motivo) {
  const btn = document.getElementById('buscarAhora'), msg = document.getElementById('buscarMsg');
  btn.disabled = true; msg.textContent = 'Buscando en portales de Argentina… puede tardar unos segundos.';
  const { data, error } = await sb.functions.invoke('agente-ofertas', { method: 'POST', body: {} });
  btn.disabled = false;
  if (error) { msg.textContent = await msgError(error); return; }
  if (data.omitido === 'reciente') {
    await cargarPerfil(); // el análisis con tu elección ya está hecho aunque todavía no se pueda buscar
    msg.textContent = (motivo === 'eleccion' ? 'Guardamos tu elección, pero ya buscaste hace muy poco. ' : trasCV ? 'Tu CV se guardó, pero ya buscaste hace muy poco. ' : 'Ya buscaste hace poco. ') + 'Podés volver a buscar a partir de las ' + horaLocal(data.proxima_busqueda) + '.';
    return;
  }
  if (data.omitido === 'cupo_mensual') { msg.textContent = 'Se alcanzó el límite de búsquedas de este mes. Probá de nuevo más adelante.'; return; }
  await cargarPerfil(); // trae el análisis nuevo y los rubros detectados
  const nombres = data.nombres || {};
  const bloques = Object.entries(data.bloques || {});
  const fallaron = bloques.filter(([, b]) => b.error).length;
  const detalle = bloques.map(([k, b]) => (nombres[k] || nombreBloque(k)) + ': ' + b.nuevas).join(' · ');
  msg.textContent = (data.nuevas ? 'Listo: ' + data.nuevas + ' ofertas nuevas (' + detalle + ').' : 'No hay ofertas nuevas por ahora.') +
    (fallaron ? ' ' + fallaron + ' búsqueda(s) fallaron; probá de nuevo más tarde.' : '');
  await cargar();
}
