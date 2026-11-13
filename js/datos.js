'use strict';
/* =========================================================================
   Finanzas · capa de datos
   Estado, persistencia local, fechas, formato de pesos y cálculos.
   Todo vive en el dispositivo (localStorage). Nada sale a internet.
   ========================================================================= */

const CLAVE_ALMACEN = 'finanzas.v1';
const VERSION_DATOS = 1;

/* ---------- Catálogos base ---------- */

const GRUPOS = {
  variable:  { nombre: 'Día a día',      tipo: 'gasto' },
  fijo:      { nombre: 'Facturas fijas', tipo: 'gasto' },
  inversion: { nombre: 'Inversión',      tipo: 'gasto' },
  ingreso:   { nombre: 'Ingresos',       tipo: 'ingreso' },
};

// [id, nombre, emoji, grupo, tipo50]  tipo50: necesidad | gusto | inversion
const CATEGORIAS_BASE = [
  ['mercado',       'Mercado',              '🛒', 'variable', 'necesidad'],
  ['panaderia',     'Panadería y tienda',   '🥐', 'variable', 'necesidad'],
  ['comida_calle',  'Comida de calle',      '🍔', 'variable', 'gusto'],
  ['cafe',          'Café y antojos',       '☕', 'variable', 'gusto'],
  ['domicilios',    'Domicilios',           '🛵', 'variable', 'gusto'],
  ['transporte',    'Transporte',           '🚌', 'variable', 'necesidad'],
  ['moto',          'Moto y gasolina',      '🏍️', 'variable', 'necesidad'],
  ['compras',       'Compras',              '🛍️', 'variable', 'gusto'],
  ['ropa',          'Ropa',                 '👕', 'variable', 'gusto'],
  ['cuidado',       'Cuidado personal',     '💈', 'variable', 'necesidad'],
  ['salud',         'Salud y droguería',    '💊', 'variable', 'necesidad'],
  ['hogar',         'Hogar',                '🔧', 'variable', 'necesidad'],
  ['mascotas',      'Mascotas',             '🐱', 'variable', 'necesidad'],
  ['educacion',     'Educación',            '📚', 'variable', 'necesidad'],
  ['diversion',     'Diversión',            '🎉', 'variable', 'gusto'],
  ['regalos',       'Regalos',              '🎁', 'variable', 'gusto'],
  ['envios',        'Envíos',               '📦', 'variable', 'necesidad'],
  ['negocio',       'Publicidad y negocio', '📣', 'variable', 'necesidad'],
  ['efectivo',      'Efectivo sin detalle', '🏧', 'variable', 'gusto'],
  ['otro',          'Otro gasto',           '❓', 'variable', 'gusto'],
  ['arriendo',      'Arriendo y admin.',    '🏠', 'fijo',     'necesidad'],
  ['servicios',     'Servicios públicos',   '💡', 'fijo',     'necesidad'],
  ['internet',      'Internet',             '📶', 'fijo',     'necesidad'],
  ['celular',       'Celular',              '📱', 'fijo',     'necesidad'],
  ['gimnasio',      'Gimnasio',             '🏋️', 'fijo',     'gusto'],
  ['suscripciones', 'Suscripciones',        '📺', 'fijo',     'gusto'],
  ['seguros',       'Seguros y SOAT',       '🛡️', 'fijo',     'necesidad'],
  ['impuestos',     'Impuestos y 4x1000',   '🏛️', 'fijo',     'necesidad'],
  ['eventos',       'Eventos y formación',  '🎟️', 'inversion', 'inversion'],
  ['herramientas',  'Herramientas',         '🧰', 'inversion', 'inversion'],
  ['ing_salario',   'Salario',              '💼', 'ingreso',  null],
  ['ing_ventas',    'Ventas y negocio',     '🧾', 'ingreso',  null],
  ['ing_prima',     'Prima',                '🎄', 'ingreso',  null],
  ['ing_otro',      'Otro ingreso',         '➕', 'ingreso',  null],
];

// gmf: si el medio suele cobrar 4x1000 (cuenta bancaria no exenta)
const METODOS_BASE = [
  { id: 'efectivo',      nombre: 'Efectivo',            emoji: '💵', gmf: false, credito: false },
  { id: 'nequi',         nombre: 'Nequi',               emoji: '📲', gmf: false, credito: false },
  { id: 'daviplata',     nombre: 'Daviplata',           emoji: '📱', gmf: false, credito: false },
  { id: 'debito',        nombre: 'Débito / cuenta',     emoji: '💳', gmf: true,  credito: false },
  { id: 'breb',          nombre: 'Transferencia Bre-B', emoji: '🔁', gmf: true,  credito: false },
  { id: 'credito',       nombre: 'Tarjeta de crédito',  emoji: '🏦', gmf: false, credito: true  },
];

/* ---------- Estado ---------- */

function estadoNuevo() {
  return {
    version: VERSION_DATOS,
    creado: new Date().toISOString(),
    ajustes: {
      nombre: '',
      presupuestoMes: 0,          // tope mensual para el día a día (grupo variable)
      umbralHormiga: 20000,       // gastos pequeños que se acumulan
      ocultarMontos: false,
      estrategiaDeuda: 'bola',    // bola (saldo menor primero) | avalancha (tasa mayor primero)
      pagoDeudaMensual: 0,        // lo que destina al mes para deudas (mínimos + extra)
      reparto: { necesidad: 50, gusto: 30, ahorro: 20 },
      ultimoMetodo: 'efectivo',
      ultimoRespaldo: null,
      onboarding: false,
    },
    categorias: CATEGORIAS_BASE.map(([id, nombre, emoji, grupo, tipo50]) => ({ id, nombre, emoji, grupo, tipo50, oculta: false })),
    metodos: METODOS_BASE.map(m => ({ ...m, oculto: false })),
    movimientos: [],   // {id, tipo, monto, cat, metodo, nota, fecha, creado, creadoDia, metaId, deudaId, facturaId, cuotas, origen}
    presupuestos: {},  // {catId: monto mensual}
    facturas: [],      // {id, nombre, cat, monto, dia, periodo (meses), mesInicio 'YYYY-MM', activa}
    metas: [],         // {id, nombre, emoji, objetivo, inicial, porcentaje, fechaLimite}
    deudas: [],        // {id, nombre, emoji, saldoInicial, tasaEA, pagoMinimo, diaPago, persona}
    juego: juegoNuevo(),
  };
}

function juegoNuevo() {
  return {
    xp: 0,
    diasActivos: {},     // {fecha: true} días en que registró algo o confirmó "sin gastos"
    protegidos: {},      // {fecha: true} días cubiertos por un comodín
    sinGasto: {},        // {fecha: true} días confirmados sin gastos
    comodines: 1,
    ultimoComodin: null,
    rachaMax: 0,
    xpDia: {},           // {fecha: movimientos que ya dieron XP}
    logros: {},          // {id: fechaISO}
    retos: {},           // {semana: [ids]}
    retosHechos: {},     // {'semana:id': true}
    retosEvaluados: {},  // {semana: true}
    mesesEvaluados: {},  // {mes: true}
    mesesEnMeta: 0,
    semanasCompletas: 0,
    diasAnalisis: {},
    historial: [],       // [{fecha, xp, motivo}] últimos 60
  };
}

let E = null; // estado global

function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE_ALMACEN);
    E = crudo ? migrar(JSON.parse(crudo)) : estadoNuevo();
  } catch (err) {
    console.error('No se pudo leer el almacenamiento', err);
    E = estadoNuevo();
  }
  return E;
}

function migrar(e) {
  const base = estadoNuevo();
  e.ajustes = { ...base.ajustes, ...(e.ajustes || {}) };
  e.ajustes.reparto = { ...base.ajustes.reparto, ...(e.ajustes.reparto || {}) };
  e.juego = { ...juegoNuevo(), ...(e.juego || {}) };
  for (const k of ['categorias', 'metodos', 'movimientos', 'facturas', 'metas', 'deudas']) if (!Array.isArray(e[k])) e[k] = base[k];
  if (!e.presupuestos) e.presupuestos = {};
  e.version = VERSION_DATOS;
  return e;
}

function guardar() {
  try {
    localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(E));
    return true;
  } catch (err) {
    console.error('No se pudo guardar', err);
    if (typeof avisar === 'function') avisar('⚠️ No se pudo guardar. Exporte una copia de seguridad.');
    return false;
  }
}

function nuevoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Fechas (siempre hora local) ---------- */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function fechaISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function hoy() { return fechaISO(); }
function aFecha(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d || 1); }
function sumarDias(iso, n) { const d = aFecha(iso); d.setDate(d.getDate() + n); return fechaISO(d); }
function difDias(desde, hasta) { return Math.round((aFecha(hasta) - aFecha(desde)) / 86400000); }
function mesDe(iso) { return iso.slice(0, 7); }
function mesActual() { return mesDe(hoy()); }
function sumarMeses(mes, n) { const [y, m] = mes.split('-').map(Number); return fechaISO(new Date(y, m - 1 + n, 1)).slice(0, 7); }
function difMeses(desde, hasta) { const [a, b] = desde.split('-').map(Number), [c, d] = hasta.split('-').map(Number); return (c - a) * 12 + (d - b); }
function diasDelMes(mes) { const [y, m] = mes.split('-').map(Number); return new Date(y, m, 0).getDate(); }
function inicioSemana(iso) { const d = aFecha(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return fechaISO(d); }
function nombreMes(mes, conAnio = true) {
  const [y, m] = mes.split('-').map(Number);
  const n = MESES[m - 1];
  return conAnio ? `${n[0].toUpperCase()}${n.slice(1)} ${y}` : `${n[0].toUpperCase()}${n.slice(1)}`;
}
function fechaCorta(iso) {
  const h = hoy();
  if (iso === h) return 'Hoy';
  if (iso === sumarDias(h, -1)) return 'Ayer';
  const d = aFecha(iso);
  const anio = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}${anio}`;
}
function fechaLarga(iso) {
  const d = aFecha(iso);
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/* ---------- Dinero ---------- */

function pesos(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('es-CO');
}
function pesosCorto(n) {
  const v = Math.round(Number(n) || 0), a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e6) return `${s}$${(a / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
  if (a >= 1e4) return `${s}$${Math.round(a / 1e3).toLocaleString('es-CO')} mil`;
  return pesos(v);
}
function redondear(n, a = 1000) { return Math.round(n / a) * a; }

/* ---------- Consultas básicas ---------- */

function categoria(id) {
  return E.categorias.find(c => c.id === id) || { id, nombre: 'Sin categoría', emoji: '❔', grupo: 'variable', tipo50: 'gusto' };
}
function metodo(id) { return E.metodos.find(m => m.id === id) || { id, nombre: '—', emoji: '', gmf: false }; }
function meta(id) { return E.metas.find(m => m.id === id); }
function deuda(id) { return E.deudas.find(d => d.id === id); }

function esGasto(m) { return m.tipo === 'gasto'; }
function grupoDe(m) { return m.tipo === 'gasto' ? categoria(m.cat).grupo : m.tipo; }
function esDiaADia(m) { return m.tipo === 'gasto' && categoria(m.cat).grupo === 'variable'; }
function esHormiga(m) { return esDiaADia(m) && m.monto <= E.ajustes.umbralHormiga && m.cat !== 'efectivo'; }

function movsEntre(desde, hasta) { return E.movimientos.filter(m => m.fecha >= desde && m.fecha <= hasta); }
function movsDelMes(mes) { return E.movimientos.filter(m => m.fecha.startsWith(mes)); }
function suma(lista) { return lista.reduce((t, m) => t + m.monto, 0); }

function totales(lista) {
  const t = { ingresos: 0, variable: 0, fijo: 0, inversion: 0, ahorro: 0, deuda: 0 };
  for (const m of lista) {
    if (m.tipo === 'ingreso') t.ingresos += m.monto;
    else if (m.tipo === 'ahorro') t.ahorro += m.monto;
    else if (m.tipo === 'deuda') t.deuda += m.monto;
    else t[categoria(m.cat).grupo === 'ingreso' ? 'variable' : categoria(m.cat).grupo] += m.monto;
  }
  t.gastos = t.variable + t.fijo;
  t.salidas = t.gastos + t.inversion + t.ahorro + t.deuda;
  t.balance = t.ingresos - t.salidas;
  return t;
}
function totalesMes(mes) { return totales(movsDelMes(mes)); }

function gastoPorCategoria(lista, grupos = ['variable', 'fijo', 'inversion']) {
  const mapa = new Map();
  for (const m of lista) {
    if (m.tipo !== 'gasto') continue;
    if (!grupos.includes(categoria(m.cat).grupo)) continue;
    mapa.set(m.cat, (mapa.get(m.cat) || 0) + m.monto);
  }
  return [...mapa.entries()].map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total);
}

/* ---------- Presupuesto y "disponible hoy" ---------- */

function presupuestoDiaADia() {
  if (E.ajustes.presupuestoMes > 0) return E.ajustes.presupuestoMes;
  return E.categorias.filter(c => c.grupo === 'variable').reduce((t, c) => t + (E.presupuestos[c.id] || 0), 0);
}

function disponibleHoy() {
  const p = presupuestoDiaADia();
  if (!p) return null;
  const h = hoy(), mes = mesDe(h);
  const delMes = movsDelMes(mes).filter(esDiaADia);
  const antes = suma(delMes.filter(m => m.fecha < h));
  const hoyGasto = suma(delMes.filter(m => m.fecha === h));
  const diasRestantes = diasDelMes(mes) - Number(h.slice(8)) + 1;
  const cupoHoy = Math.max(0, p - antes) / diasRestantes;
  return {
    presupuesto: p,
    cupoHoy,
    gastadoHoy: hoyGasto,
    disponible: cupoHoy - hoyGasto,
    gastadoMes: antes + hoyGasto,
    restanteMes: p - antes - hoyGasto,
    diasRestantes,
    pctMes: (antes + hoyGasto) / p,
    pctTiempo: (Number(h.slice(8)) - 0.5) / diasDelMes(mes),
  };
}

function estadoPresupuesto(gastado, tope) {
  if (!tope) return null;
  const pct = gastado / tope;
  if (pct >= 1) return { clase: 'critico', icono: '⛔', texto: 'Se pasó', pct };
  if (pct >= 0.85) return { clase: 'serio', icono: '⚠️', texto: 'Casi al tope', pct };
  return { clase: 'bien', icono: '✅', texto: 'En control', pct };
}

/* ---------- Facturas fijas ---------- */

function facturaTocaEnMes(f, mes) {
  const periodo = f.periodo || 1;
  if (periodo === 1) return true;
  const inicio = f.mesInicio || mesDe(E.creado.slice(0, 10));
  const dif = difMeses(inicio, mes);
  return dif >= 0 && dif % periodo === 0;
}

function estadoFactura(f, mes = mesActual()) {
  if (!facturaTocaEnMes(f, mes)) return { estado: 'no-toca' };
  const pago = E.movimientos.find(m => m.facturaId === f.id && m.fecha.startsWith(mes));
  const dia = Math.min(f.dia || 1, diasDelMes(mes));
  const vence = `${mes}-${String(dia).padStart(2, '0')}`;
  if (pago) return { estado: 'pagada', pago, vence };
  const h = hoy();
  const dias = difDias(h, vence);
  if (dias < 0 && vence < fechaISO(new Date(E.creado))) return { estado: 'sin-confirmar', vence, dias };
  if (dias < 0) return { estado: 'vencida', vence, dias };
  if (dias <= 5) return { estado: 'pronto', vence, dias };
  return { estado: 'pendiente', vence, dias };
}

function proximasFacturas(diasAdelante = 7) {
  const mes = mesActual(), sig = sumarMeses(mes, 1), h = hoy();
  const lista = [];
  for (const f of E.facturas.filter(f => f.activa !== false)) {
    for (const m of [mes, sig]) {
      const st = estadoFactura(f, m);
      if (['no-toca', 'pagada', 'sin-confirmar'].includes(st.estado)) continue;
      if (st.estado === 'vencida' && m === mes) lista.push({ f, ...st, mes: m });
      else if (difDias(h, st.vence) <= diasAdelante && difDias(h, st.vence) >= 0) lista.push({ f, ...st, mes: m });
    }
  }
  return lista.sort((a, b) => a.vence.localeCompare(b.vence));
}

/* ---------- Metas de ahorro ---------- */

function ahorradoMeta(m) {
  return (m.inicial || 0) + suma(E.movimientos.filter(x => x.tipo === 'ahorro' && x.metaId === m.id));
}

/* ---------- Deudas ---------- */

function pagadoDeuda(d) { return suma(E.movimientos.filter(x => x.tipo === 'deuda' && x.deudaId === d.id)); }
function saldoDeuda(d) { return Math.max(0, (d.saldoInicial || 0) - pagadoDeuda(d)); }
function tasaMensual(ea) { return Math.pow(1 + (ea || 0) / 100, 1 / 12) - 1; }

function ordenarDeudas(lista, estrategia) {
  return [...lista].sort((a, b) => estrategia === 'avalancha'
    ? (b.tasaEA || 0) - (a.tasaEA || 0) || saldoDeuda(a) - saldoDeuda(b)
    : saldoDeuda(a) - saldoDeuda(b));
}

// Simula mes a mes: intereses + pagos mínimos + el extra va a la deuda prioritaria.
function proyectarDeudas() {
  const activas = E.deudas.filter(d => saldoDeuda(d) > 0);
  if (!activas.length) return { libre: true, meses: 0, porDeuda: {} };
  const minimos = activas.reduce((t, d) => t + (d.pagoMinimo || 0), 0);
  const pagoMes = Math.max(E.ajustes.pagoDeudaMensual || 0, minimos);
  if (pagoMes <= interesMensualTotal(activas)) return { imposible: true, pagoMes, minimos };
  const saldos = new Map(activas.map(d => [d.id, saldoDeuda(d)]));
  const porDeuda = {};
  const avalancha = E.ajustes.estrategiaDeuda === 'avalancha';
  let mes = 0, interesTotal = 0;
  while ([...saldos.values()].some(s => s > 0.5) && mes < 600) {
    mes++;
    for (const d of activas) {
      const s = saldos.get(d.id);
      if (s > 0) { const i = s * tasaMensual(d.tasaEA); interesTotal += i; saldos.set(d.id, s + i); }
    }
    let disponible = pagoMes;
    for (const d of activas) {
      const s = saldos.get(d.id);
      if (s <= 0) continue;
      const p = Math.min(s, d.pagoMinimo || 0, disponible);
      saldos.set(d.id, s - p); disponible -= p;
    }
    const orden = activas.filter(d => saldos.get(d.id) > 0.5)
      .sort((a, b) => avalancha
        ? (b.tasaEA || 0) - (a.tasaEA || 0) || saldos.get(a.id) - saldos.get(b.id)
        : saldos.get(a.id) - saldos.get(b.id));
    for (const d of orden) {
      if (disponible <= 0) break;
      const s = saldos.get(d.id), p = Math.min(s, disponible);
      saldos.set(d.id, s - p); disponible -= p;
    }
    for (const d of activas) if (saldos.get(d.id) <= 0.5 && !porDeuda[d.id]) porDeuda[d.id] = mes;
  }
  return { libre: false, meses: mes, porDeuda, pagoMes, minimos, interesTotal, fechaLibre: sumarMeses(mesActual(), mes) };
}
function interesMensualTotal(lista) { return lista.reduce((t, d) => t + saldoDeuda(d) * tasaMensual(d.tasaEA), 0); }

/* ---------- Análisis ---------- */

function hormigasDe(lista) {
  const h = lista.filter(esHormiga);
  return { cantidad: h.length, total: suma(h), porCategoria: gastoPorCategoria(h, ['variable']) };
}

function reparto503020(lista) {
  let necesidad = 0, gusto = 0, ahorro = 0;
  for (const m of lista) {
    if (m.tipo === 'gasto') {
      const c = categoria(m.cat);
      if (c.grupo === 'inversion') ahorro += m.monto;
      else if (c.tipo50 === 'necesidad') necesidad += m.monto;
      else gusto += m.monto;
    } else if (m.tipo === 'ahorro' || m.tipo === 'deuda') ahorro += m.monto;
  }
  return { necesidad, gusto, ahorro, total: necesidad + gusto + ahorro };
}

function estimadoGMF(lista) {
  const base = lista.filter(m => m.tipo !== 'ingreso' && metodo(m.metodo).gmf).reduce((t, m) => t + m.monto, 0);
  return { base, impuesto: base * 0.004 };
}

/* ---------- Sugerencias para registrar rápido ---------- */

function frecuencias(dias = 90) {
  const desde = sumarDias(hoy(), -dias);
  const conteo = new Map();
  for (const m of E.movimientos) if (m.fecha >= desde && m.cat) conteo.set(m.cat, (conteo.get(m.cat) || 0) + 1);
  return conteo;
}

function categoriasOrdenadas(grupos) {
  const f = frecuencias();
  return E.categorias
    .filter(c => grupos.includes(c.grupo) && !c.oculta)
    .map((c, i) => ({ c, n: f.get(c.id) || 0, i }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map(x => x.c);
}

// Atajos: combinaciones categoría + nota + monto que más se repiten.
function atajosFrecuentes(max = 6) {
  const desde = sumarDias(hoy(), -60);
  const mapa = new Map();
  for (const m of E.movimientos) {
    if (m.tipo !== 'gasto' || m.fecha < desde || categoria(m.cat).grupo !== 'variable') continue;
    const nota = (m.nota || '').trim();
    const clave = `${m.cat}|${nota.toLowerCase()}`;
    const x = mapa.get(clave) || { cat: m.cat, nota, montos: [], n: 0, metodo: m.metodo };
    x.n++; x.montos.push(m.monto); x.metodo = m.metodo;
    mapa.set(clave, x);
  }
  const lista = [...mapa.values()].filter(x => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, max);
  for (const x of lista) { const s = [...x.montos].sort((a, b) => a - b); x.monto = s[Math.floor(s.length / 2)]; }
  return lista;
}

function notasFrecuentes(cat, max = 8) {
  const conteo = new Map();
  for (const m of E.movimientos) if (m.cat === cat && m.nota) { const k = m.nota.trim(); conteo.set(k, (conteo.get(k) || 0) + 1); }
  return [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(x => x[0]);
}

function promedioSemanal(cats, semanas = 4) {
  const lunes = inicioSemana(hoy());
  const desde = sumarDias(lunes, -7 * semanas), hasta = sumarDias(lunes, -1);
  const lista = movsEntre(desde, hasta).filter(m => m.tipo === 'gasto' && cats.includes(m.cat));
  return suma(lista) / semanas;
}

/* ---------- Respaldo ---------- */

function exportarCSV() {
  const filas = [['fecha', 'tipo', 'grupo', 'categoria', 'monto', 'medio_de_pago', 'nota', 'meta', 'deuda']];
  const orden = [...E.movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const m of orden) {
    filas.push([
      m.fecha, m.tipo, grupoDe(m), m.cat ? categoria(m.cat).nombre : '', m.monto, metodo(m.metodo).nombre,
      m.nota || '', m.metaId ? (meta(m.metaId) || {}).nombre || '' : '', m.deudaId ? (deuda(m.deudaId) || {}).nombre || '' : '',
    ]);
  }
  return '﻿' + filas.map(f => f.map(v => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

function respaldoJSON() {
  return JSON.stringify({ tipo: 'finanzas-respaldo', exportado: new Date().toISOString(), datos: E }, null, 1);
}

// Une datos de la planilla (o de otra fuente) sin borrar lo que ya existe.
function unirImportacion(obj) {
  const res = { movimientos: 0, categorias: 0, facturas: 0, metas: 0, deudas: 0 };
  const ids = new Set(E.movimientos.map(m => m.id));
  for (const c of obj.categorias || []) if (!E.categorias.some(x => x.id === c.id)) { E.categorias.push({ oculta: false, ...c }); res.categorias++; }
  for (const k of ['facturas', 'metas', 'deudas']) {
    for (const x of obj[k] || []) if (!E[k].some(y => y.id === x.id)) { E[k].push(x); res[k]++; }
  }
  for (const m of obj.movimientos || []) if (!ids.has(m.id)) { E.movimientos.push({ origen: 'planilla', ...m }); res.movimientos++; }
  if (obj.ajustes) {
    for (const [k, v] of Object.entries(obj.ajustes)) if (!E.ajustes[k]) E.ajustes[k] = v;
  }
  return res;
}
