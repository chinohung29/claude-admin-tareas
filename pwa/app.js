const BLOQUES = [
  { id: 'admin', nombre: 'Administrativo', desc: 'Excluye puestos junior.' },
  { id: 'ia', nombre: 'IA, programación y automatización', desc: 'Desarrollo, automatización de procesos y herramientas. No se suman avisos que exijan título de ingeniero.' },
  { id: 'odoo', nombre: 'Odoo', desc: 'Excluye junior y requisito excluyente de implementadora o partner certificado.' }
];


const SUPABASE_URL = 'https://bclqrmeeqssvqovkvvkz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_CE2MOsoNw_D0aCvWcbYk0w_INz9XXX1';
const EMAIL_DUENO = 'lamh2903@gmail.com';
const CACHE_KEY = 'lmh_job_cache_v2';
const PENDING_KEY = 'lmh_job_pending_v2';
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const TODAY = new Date();

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let items = [];
let state = { status: {}, archived: {}, removed: {}, custom: [] };
let session = null;
let perfil = null;

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
  return { job_id: id, status: state.status[id] || 'pendiente', archived: state.archived[id] === undefined ? null : state.archived[id], removed: !!state.removed[id], updated_at: new Date().toISOString() };
}

// Los cambios que no se pudieron subir (sin conexión) se reintentan al volver.
async function guardar(ids) {
  const pend = readJSON(PENDING_KEY, {});
  ids.forEach(id => { pend[id] = rowOf(id); });
  writeJSON(PENDING_KEY, pend);
  guardarCache();
  await vaciarPendientes();
}
async function vaciarPendientes() {
  const pend = readJSON(PENDING_KEY, {});
  const rows = Object.values(pend);
  if (!rows.length || !session) return;
  const { error } = await sb.from('estados').upsert(rows, { onConflict: 'job_id' });
  if (!error) writeJSON(PENDING_KEY, {});
}
function guardarCache() { writeJSON(CACHE_KEY, { items, state }); }

function allItems() { return items.concat(state.custom).filter(i => !state.removed[i.id]); }
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
function quitar(ids) { ids.forEach(id => { state.removed[id] = true; }); render(); guardar(ids); }
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

function render() {
  const all = allItems();
  const counts = { pendiente: 0, postulado: 0, descartado: 0, archivado: 0 };
  all.forEach(i => {
    if (est(i) === 'descartado') counts.descartado++;
    else if (isArchived(i)) counts.archivado++;
    else counts[est(i)]++;
  });
  document.getElementById('tally').innerHTML =
    `<span>Pendientes <span class="n">${counts.pendiente}</span></span>
     <span>Postulados <span class="n">${counts.postulado}</span></span>
     <span>Descartados <span class="n">${counts.descartado}</span></span>
     <span>Archivados <span class="n">${counts.archivado}</span></span>`;

  const seg = document.getElementById('seguimiento');
  seg.innerHTML = '';
  const post = all.filter(i => est(i) === 'postulado');
  if (post.length) {
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
  BLOQUES.forEach(b => {
    const sec = document.createElement('section');
    sec.className = 'bloque';
    sec.innerHTML =
      `<h2>${b.nombre}</h2>
       <p class="desc">${b.desc}</p>
       <div class="items"></div>
       <form class="add">
         <input name="titulo" placeholder="Puesto" required>
         <input name="empresa" placeholder="Empresa">
         <input name="modalidad" placeholder="Modalidad">
         <input name="url" placeholder="Link" type="url">
         <button type="submit">Agregar</button>
       </form>`;
    const wrap = sec.querySelector('.items');
    const mine = all.filter(i => i.bloque === b.id);
    const desc = mine.filter(i => est(i) === 'descartado');
    const activos = mine.filter(i => est(i) !== 'descartado' && !isArchived(i)).sort((a, c) => (a.prio || 99) - (c.prio || 99));
    const arch = mine.filter(i => est(i) !== 'descartado' && isArchived(i));
    activos.forEach(i => wrap.appendChild(rowFor(i, false)));
    const form = sec.querySelector('form.add');
    if (desc.length) {
      const det = document.createElement('details');
      det.className = 'archivo desc-box';
      det.innerHTML = '<summary>Descartados (' + desc.length + ')</summary><div class="meta"><button type="button" class="quitar">Quitar del listado</button> Los saca de la lista y no vuelven a mostrarse.</div>';
      det.querySelector('.quitar').addEventListener('click', () => quitar(desc.map(i => i.id)));
      desc.forEach(i => det.appendChild(rowFor(i, false)));
      sec.insertBefore(det, form);
    }
    if (arch.length) {
      const det = document.createElement('details');
      det.className = 'archivo';
      det.innerHTML = '<summary>Archivados (' + arch.length + ')</summary>';
      arch.forEach(i => det.appendChild(rowFor(i, true)));
      sec.insertBefore(det, form);
    }
    form.addEventListener('submit', e => {
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
  Object.values(readJSON(PENDING_KEY, {})).forEach(r => applyEstado(r));
  guardarCache();
  showAviso();
  render();
  vaciarPendientes();
  cargarPerfil();
  return true;
}


// ---- Perfil (CV) ----
async function cargarPerfil() {
  const { data, error } = await sb.from('perfil').select('*').eq('id', 'principal').maybeSingle();
  if (error) return;
  perfil = data;
  renderPerfil();
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
    html += '<p class="meta">El agente todavía no analizó tu CV. Lo hace en la próxima corrida diaria, o cuando se lo pidas.</p>';
  } else {
    if (!actual) html += '<p class="meta">Cargaste un CV nuevo: el análisis de abajo es del anterior y se actualiza en la próxima corrida.</p>';
    html += '<div class="analisis">' +
      (al.resumen ? '<p class="meta">' + esc(al.resumen) + (al.seniority ? ' · Nivel: ' + esc(al.seniority) : '') + '</p>' : '') +
      lista('Fortalezas', al.fortalezas) + lista('Oportunidades', al.oportunidades) +
      (al.palabras_clave ? BLOQUES.map(b => lista('Búsquedas: ' + b.nombre, al.palabras_clave[b.id])).join('') : '') +
      '</div>';
  }
  box.innerHTML = html;
}

function cvMsg(t) {
  const m = document.getElementById('cvMsg');
  m.hidden = !t; m.textContent = t || '';
}
function cvEditar(texto, nombre) {
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
document.getElementById('cvGuardar').addEventListener('click', async () => {
  const texto = document.getElementById('cvTexto').value.trim().slice(0, CV_MAX_CHARS);
  if (texto.length < 80) { cvMsg('El texto es muy corto para analizarlo.'); return; }
  const fila = { id: 'principal', cv_nombre: document.getElementById('cvEditor').dataset.nombre || null, cv_texto: texto, cv_actualizado: new Date().toISOString() };
  const { error } = await sb.from('perfil').upsert(fila, { onConflict: 'id' });
  if (error) { cvMsg('No se pudo guardar: ' + error.message); return; }
  perfil = { ...(perfil || {}), ...fila };
  document.getElementById('cvEditor').hidden = true;
  cvMsg('CV guardado. El agente lo va a leer en la próxima corrida.');
  renderPerfil();
});

let canal = null;
function suscribir() {
  if (canal) return;
  canal = sb.channel('estados-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'estados' }, p => {
      if (p.eventType === 'DELETE') {
        const id = p.old && p.old.job_id;
        if (id) { delete state.status[id]; delete state.archived[id]; delete state.removed[id]; }
      } else if (!readJSON(PENDING_KEY, {})[p.new.job_id]) {
        applyEstado(p.new);
      }
      guardarCache(); render();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'perfil' }, p => {
      if (p.new && p.new.id) { perfil = p.new; renderPerfil(); }
    })
    .subscribe();
}

async function entrar(s) {
  session = s;
  if (!s) { mostrarLogin(); return; }
  if ((s.user.email || '').toLowerCase() !== EMAIL_DUENO) {
    await sb.auth.signOut();
    mostrarLogin('Esta app es privada: iniciá sesión con ' + EMAIL_DUENO + '.');
    return;
  }
  mostrarApp();
  const cache = readJSON(CACHE_KEY, null);
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
  if (a !== b) { msg.textContent = 'Las contraseñas no coinciden.'; return; }
  msg.textContent = 'Creando la cuenta…';
  const { error } = await sb.auth.signUp({ email, password: a });
  if (error) { msg.textContent = 'No se pudo crear la cuenta: ' + (/cerrado/i.test(error.message) ? 'este email no está habilitado.' : error.message); return; }
  const r = await sb.auth.signInWithPassword({ email, password: a });
  msg.textContent = r.error ? 'Cuenta creada, pero no se pudo entrar: ' + r.error.message : '';
});
document.getElementById('logout').addEventListener('click', async () => {
  try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
  await sb.auth.signOut();
});

sb.auth.onAuthStateChange((evento, s) => {
  if (evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') {
    if (evento === 'SIGNED_IN' && session && s && session.user.id === s.user.id) return;
    if (evento === 'SIGNED_OUT' && canal) { sb.removeChannel(canal); canal = null; }
    setTimeout(() => entrar(s), 0);
  }
});

// Instalación y estado de conexión
let promptInstalar = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  promptInstalar = e;
  document.getElementById('install').hidden = false;
});
document.getElementById('install').addEventListener('click', async () => {
  if (!promptInstalar) return;
  promptInstalar.prompt();
  await promptInstalar.userChoice;
  promptInstalar = null;
  document.getElementById('install').hidden = true;
});
window.addEventListener('appinstalled', () => { document.getElementById('install').hidden = true; });
function conexion() { document.getElementById('offline').hidden = navigator.onLine; }
window.addEventListener('online', () => { conexion(); if (session) cargar(); });
window.addEventListener('offline', conexion);
conexion();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

document.getElementById('fecha').textContent = TODAY.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
