const BLOQUES = [
  { id: 'admin', nombre: 'Administrativo', desc: 'Excluye puestos junior.' },
  { id: 'ia', nombre: 'IA, programación y automatización', desc: 'Desarrollo, automatización de procesos y herramientas. No se suman avisos que exijan título de ingeniero.' },
  { id: 'odoo', nombre: 'Odoo', desc: 'Excluye junior y requisito excluyente de implementadora o partner certificado.' }
];

const LS_KEY = 'lmh_job_tracker_v1';
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const TODAY = new Date();

let items = [];
let actualizado = '';

function normalize(d) {
  d = d ? JSON.parse(JSON.stringify(d)) : {};
  return {
    status: d.status || {},
    archived: d.archived || {},
    removed: d.removed || {},
    custom: Array.isArray(d.custom) ? d.custom : []
  };
}
function loadLocal() {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return normalize(JSON.parse(raw)); } catch (e) {}
  return normalize(null);
}
let state = loadLocal();
function persist() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
}

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

function setStatus(id, s) { state.status[id] = s; persist(); render(); }
function setArchived(id, v) { state.archived[id] = v; persist(); render(); }
function quitar(ids) { ids.forEach(id => { state.removed[id] = true; }); persist(); render(); }
function addCustom(bloque, titulo, empresa, modalidad, url) {
  if (!titulo) return;
  state.custom.push({ id: 'custom_' + Date.now(), bloque, titulo, empresa, modalidad, url, iso: TODAY.toISOString().slice(0, 10), custom: true });
  persist(); render();
}
function removeCustom(id) {
  state.custom = state.custom.filter(i => i.id !== id);
  delete state.status[id]; delete state.archived[id];
  persist(); render();
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
  const f = actualizado ? fmtFecha(actualizado) : '';
  document.getElementById('aviso').textContent =
    (f ? 'Listado actualizado el ' + f + '. ' : '') +
    'Cada bloque está ordenado por prioridad según coincidencia con tu perfil. Si no figura sueldo, queda como A convenir. Los avisos nuevos son los publicados en los últimos 15 días; cuando la fecha dice "sin verificar", revisala directo en el aviso.';
}

async function cargar() {
  try {
    const r = await fetch('jobs.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    items = d.items || [];
    actualizado = d.actualizado || '';
  } catch (e) {
    document.getElementById('aviso').textContent = 'No se pudo cargar el listado. Reintentá con conexión.';
    return;
  }
  showAviso();
  render();
}

// Respaldo manual de estados
document.getElementById('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'busqueda-laboral-' + TODAY.toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
document.getElementById('import').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    state = normalize(JSON.parse(await f.text()));
    persist(); render();
  } catch (err) { alert('El archivo no es un respaldo válido.'); }
  e.target.value = '';
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
window.addEventListener('online', () => { conexion(); cargar(); });
window.addEventListener('offline', conexion);
conexion();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

document.getElementById('fecha').textContent = TODAY.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
cargar();
