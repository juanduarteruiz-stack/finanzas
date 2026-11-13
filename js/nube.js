/* =========================================================================
   Finanzas · nube
   Entrar con Google y sincronizar entre dispositivos (Firebase).
   La app sigue siendo "local primero": todo funciona sin esto. Si este módulo
   carga, sube los cambios y baja los de otros dispositivos en segundo plano.

   Modelo en Firestore (reglas: cada usuario solo ve su carpeta):
     usuarios/{uid}/datos/config        → una sección por campo {v: JSON, t: ms}
     usuarios/{uid}/movimientos/{id}    → {d: JSON, t: ms, borrado, ts, disp}
   Conflictos: gana el cambio más reciente (t). El juego (XP, rachas, logros)
   se une en vez de pisarse.
   ========================================================================= */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import {
  getFirestore, doc, collection, query, where, orderBy, onSnapshot, writeBatch, setDoc, serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import { CONFIG_FIREBASE } from './config-nube.js';

const app = initializeApp(CONFIG_FIREBASE);
const auth = getAuth(app);
auth.languageCode = 'es';
const db = getFirestore(app);

const CLAVE_SYNC = 'finanzas.sync';
const SECCIONES = ['ajustes', 'categorias', 'metodos', 'presupuestos', 'facturas', 'metas', 'deudas', 'juego', 'creado'];

let S = leerSync();     // estado de sincronización guardado en este dispositivo
let usuario = null;
let desuscribir = [];
let listo = false;      // ya llegó la primera bajada de la nube
let estado = 'apagado'; // apagado | conectando | al-dia | subiendo | sin-conexion | error
let temporizador = null;
let subiendo = false;
let otraVez = false;

/* ---------- Utilidades ---------- */

function vacio() { return { uid: null, ultimoTs: null, huellas: {}, cambios: {}, secciones: {}, ultimaSubida: null }; }
function leerSync() { try { return { ...vacio(), ...(JSON.parse(localStorage.getItem(CLAVE_SYNC)) || {}) }; } catch { return vacio(); } }
function grabarSync() { try { localStorage.setItem(CLAVE_SYNC, JSON.stringify(S)); } catch { /* lleno */ } }

// JSON con llaves ordenadas: dos objetos iguales dan siempre el mismo texto.
function estable(v) {
  if (Array.isArray(v)) return '[' + v.map(x => estable(x === undefined ? null : x)).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + estable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

// Huella corta (FNV-1a) para saber si algo cambió sin guardar copias completas.
function huella(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + '.' + s.length.toString(36);
}

const sumaValores = o => Object.values(o || {}).reduce((t, v) => t + (Number(v) || 0), 0);
const valorSeccion = sec => (sec === 'creado' ? E.creado : E[sec]);
function ponerSeccion(sec, v) { if (sec === 'creado') E.creado = v; else E[sec] = v; }

const refConfig = uid => doc(db, 'usuarios', uid, 'datos', 'config');
const refMovs = uid => collection(db, 'usuarios', uid, 'movimientos');

function avisarUI() { window.dispatchEvent(new CustomEvent('nube-estado', { detail: estado })); }
function refrescar() { aplicarPreferencias(); render(); }

/* ---------- Unir el juego de dos dispositivos ---------- */

function unirJuego(a, b, remotoMasNuevo) {
  a = a || {}; b = b || {};
  const r = { ...b, ...a };
  for (const k of ['diasActivos', 'protegidos', 'sinGasto', 'retosHechos', 'retosEvaluados', 'mesesEvaluados', 'diasAnalisis', 'retos']) {
    r[k] = { ...(b[k] || {}), ...(a[k] || {}) };
  }
  r.logros = { ...(b.logros || {}), ...(a.logros || {}) };
  for (const k of Object.keys(r.logros)) {
    const x = (a.logros || {})[k], y = (b.logros || {})[k];
    if (x && y) r.logros[k] = x < y ? x : y;
  }
  for (const k of ['xpMas', 'xpMenos']) {
    r[k] = { ...(b[k] || {}) };
    for (const [d, v] of Object.entries(a[k] || {})) r[k][d] = Math.max(v, r[k][d] || 0);
  }
  r.xp = Math.max(0, sumaValores(r.xpMas) - sumaValores(r.xpMenos));
  for (const k of ['rachaMax', 'mesesEnMeta', 'semanasCompletas']) r[k] = Math.max(a[k] || 0, b[k] || 0);
  if (remotoMasNuevo) { r.comodines = b.comodines ?? r.comodines; r.ultimoComodin = b.ultimoComodin ?? r.ultimoComodin; }
  const vistos = new Set();
  r.historial = [...(a.historial || []), ...(b.historial || [])]
    .sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)))
    .filter(h => { const k = `${h.fecha}|${h.motivo}`; if (vistos.has(k)) return false; vistos.add(k); return true; })
    .slice(0, 60);
  r.xpDia = a.xpDia || {};
  return r;
}

/* ---------- Primera unión: nunca perder datos ---------- */

function vacioOBase(v, base) {
  return v === undefined || v === null || v === '' || v === 0 || estable(v) === estable(base);
}

function unirInicial(sec, local, remoto) {
  if (Array.isArray(remoto) || Array.isArray(local)) {
    const mapa = new Map((remoto || []).map(x => [x.id, x]));
    for (const x of local || []) if (x && !mapa.has(x.id)) mapa.set(x.id, x);
    return [...mapa.values()];
  }
  if (sec === 'ajustes') {
    const base = estadoNuevo().ajustes;
    const r = { ...(local || {}), ...(remoto || {}) };
    for (const k of Object.keys(local || {})) {
      if (vacioOBase(remoto ? remoto[k] : undefined, base[k]) && !vacioOBase(local[k], base[k])) r[k] = local[k];
    }
    r.onboarding = !!((local || {}).onboarding || (remoto || {}).onboarding);
    return r;
  }
  return { ...(local || {}), ...(remoto || {}) }; // presupuestos
}

/* ---------- Bajar cambios ---------- */

function aplicarConfig(snap, inicial) {
  if (snap.metadata.hasPendingWrites) return;
  const datos = snap.exists() ? snap.data() : {};
  let cambio = false;
  for (const sec of SECCIONES) {
    const r = datos[sec];
    if (!r || typeof r.v !== 'string') continue;
    const local = valorSeccion(sec);
    const hLocal = huella(estable(local));
    const hRemoto = huella(r.v);
    const info = S.secciones[sec] || {};
    if (sec === 'juego') {
      const unido = unirJuego(local, JSON.parse(r.v), inicial || r.t > (info.cambio || 0));
      if (huella(estable(unido)) !== hLocal) { E.juego = unido; cambio = true; }
      S.secciones[sec] = { ...info, h: hRemoto, t: r.t };
      continue;
    }
    if (sec === 'creado') {
      const remoto = JSON.parse(r.v);
      if (remoto && (!local || remoto < local)) { E.creado = remoto; cambio = true; }
      S.secciones[sec] = { ...info, h: hRemoto, t: r.t };
      continue;
    }
    if (inicial) {
      // Primera vez en este dispositivo: se suma lo de aquí con lo de la nube, sin borrar nada.
      const unido = unirInicial(sec, local, JSON.parse(r.v));
      if (huella(estable(unido)) !== hLocal) { ponerSeccion(sec, unido); cambio = true; }
      S.secciones[sec] = { h: hRemoto, t: r.t };
      continue;
    }
    const tLocal = info.cambio || (hLocal !== info.h ? Date.now() : 0);
    if (hLocal === info.h || r.t >= tLocal) {
      if (hRemoto !== hLocal) { ponerSeccion(sec, JSON.parse(r.v)); cambio = true; }
      S.secciones[sec] = { h: hRemoto, t: r.t };
    }
  }
  grabarSync();
  if (cambio) { E = migrar(E); guardar(); refrescar(); }
}

function aplicarMovs(snap, inicial) {
  const porId = new Map(E.movimientos.map(m => [m.id, m]));
  let cambio = false;
  for (const ch of snap.docChanges()) {
    if (ch.type === 'removed') continue;
    const d = ch.doc;
    if (d.metadata.hasPendingWrites) continue;
    const r = d.data();
    if (!r.ts) continue;
    const ts = [r.ts.seconds, r.ts.nanoseconds];
    if (!S.ultimoTs || ts[0] > S.ultimoTs[0] || (ts[0] === S.ultimoTs[0] && ts[1] > S.ultimoTs[1])) S.ultimoTs = ts;
    const id = d.id;
    const local = porId.get(id);
    const hLocal = local ? huella(estable(local)) : null;
    const hayCambioLocal = local ? hLocal !== S.huellas[id] : !!S.cambios[id];
    const tLocal = S.cambios[id] || (hayCambioLocal ? Date.now() : 0);
    if (!inicial && hayCambioLocal && tLocal > r.t) continue; // el cambio de aquí es más nuevo: se sube después
    if (r.borrado) {
      if (local) { porId.delete(id); cambio = true; }
      delete S.huellas[id]; delete S.cambios[id];
      continue;
    }
    const remoto = JSON.parse(r.d);
    const hRemoto = huella(estable(remoto));
    if (hRemoto !== hLocal) { porId.set(id, remoto); cambio = true; }
    S.huellas[id] = hRemoto;
    delete S.cambios[id];
  }
  grabarSync();
  if (cambio) {
    E.movimientos = [...porId.values()];
    guardar();
    refrescar();
  }
}

/* ---------- Subir cambios ---------- */

function programarSubida(ms = 1200) {
  clearTimeout(temporizador);
  temporizador = setTimeout(subir, ms);
}

async function subir() {
  if (!usuario || !listo) return;
  if (subiendo) { otraVez = true; return; }
  subiendo = true;
  try {
    const ahora = Date.now();
    const ops = [];
    const vivos = new Set();
    for (const m of E.movimientos) {
      vivos.add(m.id);
      const s = estable(m), h = huella(s);
      if (h === S.huellas[m.id]) continue;
      const t = S.cambios[m.id] || ahora;
      S.cambios[m.id] = t;
      ops.push({ id: m.id, h, datos: { d: s, t, borrado: false, ts: serverTimestamp(), disp: DISP } });
    }
    for (const id of Object.keys(S.huellas)) {
      if (vivos.has(id)) continue;
      const t = S.cambios[id] || ahora;
      S.cambios[id] = t;
      ops.push({ id, h: null, datos: { d: '', t, borrado: true, ts: serverTimestamp(), disp: DISP } });
    }
    const secs = {};
    for (const sec of SECCIONES) {
      const v = valorSeccion(sec);
      if (v === undefined) continue;
      const s = estable(v), h = huella(s), info = S.secciones[sec] || {};
      if (h === info.h) continue;
      const t = info.cambio || ahora;
      S.secciones[sec] = { ...info, cambio: t };
      secs[sec] = { v: s, t, h };
    }
    grabarSync();
    if (!ops.length && !Object.keys(secs).length) { estado = 'al-dia'; return; }
    estado = 'subiendo'; avisarUI();

    for (let i = 0; i < ops.length; i += 400) {
      const parte = ops.slice(i, i + 400);
      const lote = writeBatch(db);
      for (const op of parte) lote.set(doc(refMovs(usuario.uid), op.id), op.datos);
      await lote.commit();
      for (const op of parte) {
        if (op.h) S.huellas[op.id] = op.h; else delete S.huellas[op.id];
        delete S.cambios[op.id];
      }
      grabarSync();
    }
    if (Object.keys(secs).length) {
      const carga = { ts: serverTimestamp() };
      for (const [sec, x] of Object.entries(secs)) carga[sec] = { v: x.v, t: x.t };
      await setDoc(refConfig(usuario.uid), carga, { merge: true });
      for (const [sec, x] of Object.entries(secs)) S.secciones[sec] = { h: x.h, t: x.t };
    }
    S.ultimaSubida = Date.now();
    grabarSync();
    estado = 'al-dia';
  } catch (e) {
    console.warn('[Nube] no se pudo subir', e);
    estado = navigator.onLine ? 'error' : 'sin-conexion';
  } finally {
    subiendo = false;
    avisarUI();
    if (otraVez) { otraVez = false; programarSubida(400); }
  }
}

/* ---------- Conexión ---------- */

function desconectar() {
  desuscribir.forEach(f => { try { f(); } catch { /* ya cerrado */ } });
  desuscribir = [];
  listo = false;
}

function errorNube(e) {
  console.warn('[Nube]', e);
  estado = navigator.onLine ? 'error' : 'sin-conexion';
  avisarUI();
}

function conectar(u) {
  desconectar();
  const primeraVez = S.uid !== u.uid;
  if (primeraVez) { S = { ...vacio(), uid: u.uid }; grabarSync(); }
  estado = 'conectando'; avisarUI();
  let configLista = false, movsListos = false;
  const terminar = () => {
    if (listo || !configLista || !movsListos) return;
    listo = true;
    estado = 'al-dia'; avisarUI();
    revisarTodo(); guardar();
    programarSubida(0);
    if (primeraVez) avisar('☁️ Listo: sus datos quedaron sincronizados con su cuenta.');
  };
  desuscribir.push(onSnapshot(refConfig(u.uid), snap => {
    aplicarConfig(snap, primeraVez && !configLista);
    configLista = true; terminar();
  }, errorNube));
  const desde = S.ultimoTs ? new Timestamp(S.ultimoTs[0], S.ultimoTs[1]) : new Timestamp(0, 0);
  desuscribir.push(onSnapshot(query(refMovs(u.uid), where('ts', '>', desde), orderBy('ts')), snap => {
    aplicarMovs(snap, primeraVez && !movsListos);
    movsListos = true; terminar();
  }, errorNube));
}

async function entrar({ redireccion = false } = {}) {
  const proveedor = new GoogleAuthProvider();
  proveedor.setCustomParameters({ prompt: 'select_account' });
  if (redireccion) { await signInWithRedirect(auth, proveedor); return; }
  try {
    await signInWithPopup(auth, proveedor);
  } catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) {
      await signInWithRedirect(auth, proveedor);
      return;
    }
    if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e.code)) return;
    console.warn('[Nube] no se pudo entrar', e);
    avisar('✋ No se pudo entrar con Google. Revise su conexión e intente de nuevo.');
  }
}

// Al salir se borran los datos de este dispositivo: quedan seguros en la cuenta
// y así otra persona que use este equipo no los ve ni los mezcla con los suyos.
async function salir() {
  clearTimeout(temporizador);
  if (listo) { try { await subir(); } catch { /* se intentó */ } }
  desconectar();
  await signOut(auth);
  S = vacio();
  localStorage.removeItem(CLAVE_SYNC);
  localStorage.removeItem(CLAVE_ALMACEN);
  cargar();
  estado = 'apagado';
  location.hash = '#/inicio';
  refrescar();
  avisarUI();
}

onAuthStateChanged(auth, u => {
  usuario = u;
  if (u) conectar(u);
  else { desconectar(); estado = 'apagado'; avisarUI(); }
});
getRedirectResult(auth).catch(e => console.warn('[Nube] redirección', e));

window.addEventListener('online', () => { if (usuario && listo) programarSubida(0); });
window.alGuardarNube = () => { if (usuario && listo) programarSubida(); };

window.Nube = {
  get usuario() { return usuario ? { nombre: usuario.displayName || '', correo: usuario.email || '', foto: usuario.photoURL || '' } : null; },
  get estado() { return estado; },
  get ultimaSubida() { return S.ultimaSubida; },
  entrar,
  salir,
  sincronizar: () => programarSubida(0),
};
window.dispatchEvent(new CustomEvent('nube-estado', { detail: estado }));
