'use strict';
/* =========================================================================
   Finanzas · motor de juego
   Regla de oro: se premia el HÁBITO (registrar, revisar, ahorrar, pagar),
   nunca el gasto. Nada de culpa: una racha rota se repara con comodines y
   siempre hay un reto nuevo el lunes.
   ========================================================================= */

const NIVELES = [
  ['Semilla', '🌱'], ['Primer billete', '💵'], ['Marranito', '🐷'], ['Billetera ordenada', '👛'],
  ['Cazador de hormigas', '🐜'], ['Presupuesto en mano', '📒'], ['Estratega', '🧭'], ['Guardián del billete', '🛡️'],
  ['Rompe-deudas', '🔨'], ['Maestro del ahorro', '🎓'], ['Inversionista', '📈'], ['Libertad financiera', '🦅'],
];

const XP = { registro: 10, alInstante: 5, ahorroODeuda: 10, sinGasto: 20, maxRegistrosDia: 12 };
const CATS_CALLE = ['comida_calle', 'cafe', 'domicilios'];
const colaCelebraciones = [];

/* ---------- Niveles y XP ---------- */

function xpParaSubir(n) { return 150 + 100 * (n - 1); }

function infoNivel(xp = E.juego.xp) {
  let n = 1, base = 0;
  while (xp >= base + xpParaSubir(n)) { base += xpParaSubir(n); n++; }
  const [nombre, emoji] = NIVELES[Math.min(n, NIVELES.length) - 1];
  const sig = xpParaSubir(n);
  return {
    nivel: n,
    nombre: n > NIVELES.length ? `${nombre} ${n - NIVELES.length + 1}` : nombre,
    emoji,
    xpEnNivel: xp - base,
    xpSiguiente: sig,
    pct: (xp - base) / sig,
    siguiente: NIVELES[n] ? { nombre: NIVELES[n][0], emoji: NIVELES[n][1] } : null,
  };
}

function ganarXP(cant, motivo) {
  if (!cant) return 0;
  const antes = infoNivel().nivel;
  E.juego.xp = Math.max(0, E.juego.xp + cant);
  E.juego.historial.unshift({ fecha: new Date().toISOString(), xp: cant, motivo });
  if (E.juego.historial.length > 60) E.juego.historial.length = 60;
  const despues = infoNivel();
  if (despues.nivel > antes) colaCelebraciones.push({ tipo: 'nivel', ...despues });
  return cant;
}

/* ---------- Racha con comodines ---------- */

function racha() {
  const j = E.juego;
  let d = hoy(), n = 0;
  if (!j.diasActivos[d]) d = sumarDias(d, -1); // hoy aún está a tiempo
  while (j.diasActivos[d] || j.protegidos[d]) {
    if (j.diasActivos[d]) n++;
    d = sumarDias(d, -1);
  }
  return n;
}

function rachaPendienteHoy() { return !E.juego.diasActivos[hoy()]; }

function ultimoActivo() {
  const dias = Object.keys(E.juego.diasActivos);
  return dias.length ? dias.sort().pop() : null;
}

// Al abrir la app: si faltaron 1 o 2 días y hay comodines, la racha se protege sola.
function revisarRacha() {
  const j = E.juego, h = hoy(), ult = ultimoActivo();
  if (!ult || ult >= sumarDias(h, -1)) return null;
  const huecos = [];
  for (let d = sumarDias(ult, 1); d < h; d = sumarDias(d, 1)) if (!j.protegidos[d]) huecos.push(d);
  if (!huecos.length) return null;
  if (huecos.length <= j.comodines) {
    huecos.forEach(d => { j.protegidos[d] = true; });
    j.comodines -= huecos.length;
    return { usados: huecos.length };
  }
  return { ausente: difDias(ult, h) };
}

function marcarActivo(h = hoy()) {
  const j = E.juego;
  if (j.diasActivos[h]) return;
  j.diasActivos[h] = true;
  const r = racha();
  if (r > j.rachaMax) j.rachaMax = r;
  if (r > 0 && r % 7 === 0 && j.ultimoComodin !== h && j.comodines < 2) {
    j.comodines++;
    j.ultimoComodin = h;
    colaCelebraciones.push({ tipo: 'comodin' });
  }
}

/* ---------- Acciones que dan XP ---------- */

function alRegistrar(mov) {
  const j = E.juego, h = hoy();
  marcarActivo();
  let xp = 0;
  const n = j.xpDia[h] || 0;
  if (n < XP.maxRegistrosDia) {
    xp += XP.registro;
    if (mov.fecha === h) xp += XP.alInstante;
    if (mov.tipo === 'ahorro' || mov.tipo === 'deuda') xp += XP.ahorroODeuda;
    j.xpDia = { [h]: n + 1 }; // solo importa el día de hoy
  }
  let quitado = false;
  if (mov.tipo === 'gasto' && j.sinGasto[mov.fecha]) {
    delete j.sinGasto[mov.fecha];
    xp -= XP.sinGasto;
    quitado = true;
  }
  ganarXP(xp, mov.tipo === 'gasto' ? 'Registró un gasto' : mov.tipo === 'ingreso' ? 'Registró un ingreso' : mov.tipo === 'ahorro' ? 'Abonó a una meta' : 'Abonó a una deuda');
  revisarTodo();
  return { xp, quitado };
}

function alEditar(mov) {
  if (mov.tipo === 'gasto' && E.juego.sinGasto[mov.fecha]) {
    delete E.juego.sinGasto[mov.fecha];
    ganarXP(-XP.sinGasto, 'Día sin gastos desmarcado');
  }
  revisarTodo();
}

function puedeDeclararSinGasto(fecha) {
  return !E.juego.sinGasto[fecha] && !E.movimientos.some(m => m.tipo === 'gasto' && m.fecha === fecha);
}

function declararSinGasto(fecha = hoy()) {
  if (!puedeDeclararSinGasto(fecha)) return { error: 'Ese día ya tiene gastos o ya estaba confirmado.' };
  E.juego.sinGasto[fecha] = true;
  marcarActivo(fecha); // confirmar ayer también repara la racha de ayer
  ganarXP(XP.sinGasto, 'Día sin gastos');
  revisarTodo();
  return { xp: XP.sinGasto };
}

function registrarVisitaAnalisis() {
  E.juego.diasAnalisis[hoy()] = true;
  revisarLogros();
}

/* ---------- Logros ---------- */

const LOGROS = [
  { id: 'primer_paso', emoji: '👣', nombre: 'Primer paso', desc: 'Registre su primer movimiento.', xp: 20, ok: s => s.movs >= 1 },
  { id: 'racha_3', emoji: '🔥', nombre: 'Calentando motores', desc: '3 días seguidos registrando.', xp: 30, ok: s => s.rachaMax >= 3 },
  { id: 'racha_7', emoji: '🔥', nombre: 'Semana firme', desc: '7 días seguidos registrando.', xp: 70, ok: s => s.rachaMax >= 7 },
  { id: 'racha_30', emoji: '🌋', nombre: 'Hábito de hierro', desc: '30 días seguidos registrando.', xp: 300, ok: s => s.rachaMax >= 30 },
  { id: 'racha_100', emoji: '💎', nombre: 'Imparable', desc: '100 días seguidos registrando.', xp: 1000, ok: s => s.rachaMax >= 100 },
  { id: 'dia_zen', emoji: '🧘', nombre: 'Día zen', desc: 'Confirme su primer día sin gastos.', xp: 30, ok: s => s.sinGasto >= 1 },
  { id: 'bolsillo_tranquilo', emoji: '🏝️', nombre: 'Bolsillo tranquilo', desc: 'Cinco días sin gastos en un mismo mes.', xp: 100, ok: s => s.sinGastoMesMax >= 5 },
  { id: 'al_instante', emoji: '⚡', nombre: 'Al instante', desc: 'Veinte gastos registrados el mismo día en que ocurrieron.', xp: 80, ok: s => s.alInstante >= 20 },
  { id: 'cazador', emoji: '🐜', nombre: 'Cazador de hormigas', desc: 'Registre 25 gastos pequeños. Ninguno se escapa.', xp: 60, ok: s => s.hormigas >= 25 },
  { id: 'primer_ingreso', emoji: '💰', nombre: 'Entró plata', desc: 'Registre su primer ingreso.', xp: 20, ok: s => s.ingresos >= 1 },
  { id: 'pagate_primero', emoji: '🥇', nombre: 'Págate primero', desc: 'Aparte para una meta el mismo día que recibe un ingreso.', xp: 80, ok: s => s.pagatePrimero },
  { id: 'meta_cumplida', emoji: '🏆', nombre: 'Meta cumplida', desc: 'Complete una meta de ahorro.', xp: 300, ok: s => s.metasCumplidas >= 1 },
  { id: 'cadena_rota', emoji: '🔓', nombre: 'Cadena rota', desc: 'Termine de pagar una deuda.', xp: 250, ok: s => s.deudasLiquidadas >= 1 },
  { id: 'libre', emoji: '🦅', nombre: 'Libre de deudas', desc: 'Todas sus deudas en cero.', xp: 1000, ok: s => s.deudasTotal > 0 && s.deudasLiquidadas === s.deudasTotal },
  { id: 'facturas_al_dia', emoji: '🧾', nombre: 'Facturas al día', desc: 'Pague todas las facturas del mes antes de que venzan.', xp: 80, ok: s => s.facturasAlDia },
  { id: 'mes_en_la_meta', emoji: '🎯', nombre: 'Mes en la meta', desc: 'Cierre un mes dentro del presupuesto, registrando al menos 15 días.', xp: 200, ok: s => s.mesesEnMeta >= 1 },
  { id: 'presupuestador', emoji: '📒', nombre: 'Presupuestador', desc: 'Póngale tope a cinco categorías.', xp: 40, ok: s => s.presupuestos >= 5 },
  { id: 'centenario', emoji: '💯', nombre: 'Centenario', desc: 'Cien movimientos registrados.', xp: 150, ok: s => s.movs >= 100 },
  { id: 'precavido', emoji: '💾', nombre: 'Precavido', desc: 'Guarde una copia de seguridad.', xp: 30, ok: s => s.respaldo },
  { id: 'analista', emoji: '🔎', nombre: 'Analista', desc: 'Revise su análisis en cinco días distintos.', xp: 40, ok: s => s.analista >= 5 },
  { id: 'semana_redonda', emoji: '🌟', nombre: 'Semana redonda', desc: 'Complete los tres retos de una semana.', xp: 120, ok: s => s.semanasCompletas >= 1 },
];

function facturasAlDiaMes(mes) {
  const aplican = E.facturas.filter(f => f.activa !== false && facturaTocaEnMes(f, mes));
  if (!aplican.length) return false;
  return aplican.every(f => {
    const st = estadoFactura(f, mes);
    return st.estado === 'pagada' && st.pago.origen !== 'planilla' && st.pago.fecha <= st.vence;
  });
}

function estadisticas() {
  const j = E.juego;
  const propios = E.movimientos.filter(m => m.origen !== 'planilla');
  const sinGastoPorMes = {};
  for (const f of Object.keys(j.sinGasto)) sinGastoPorMes[f.slice(0, 7)] = (sinGastoPorMes[f.slice(0, 7)] || 0) + 1;
  const diasIngreso = new Set(propios.filter(m => m.tipo === 'ingreso').map(m => m.fecha));
  return {
    movs: propios.length,
    rachaMax: Math.max(j.rachaMax, racha()),
    sinGasto: Object.keys(j.sinGasto).length,
    sinGastoMesMax: Math.max(0, ...Object.values(sinGastoPorMes)),
    alInstante: propios.filter(m => m.tipo === 'gasto' && m.fecha === m.creadoDia).length,
    hormigas: propios.filter(esHormiga).length,
    ingresos: propios.filter(m => m.tipo === 'ingreso').length,
    pagatePrimero: propios.some(m => m.tipo === 'ahorro' && diasIngreso.has(m.fecha)),
    metasCumplidas: E.metas.filter(m => m.objetivo > 0 && ahorradoMeta(m) >= m.objetivo).length,
    deudasTotal: E.deudas.length,
    deudasLiquidadas: E.deudas.filter(d => (d.montoOriginal || d.saldoInicial) > 0 && saldoDeuda(d) <= 0).length,
    facturasAlDia: facturasAlDiaMes(mesActual()) || facturasAlDiaMes(sumarMeses(mesActual(), -1)),
    mesesEnMeta: j.mesesEnMeta,
    presupuestos: Object.values(E.presupuestos).filter(v => v > 0).length,
    respaldo: !!E.ajustes.ultimoRespaldo,
    analista: Object.keys(j.diasAnalisis).length,
    semanasCompletas: j.semanasCompletas,
  };
}

function revisarLogros() {
  const s = estadisticas(), j = E.juego;
  for (const l of LOGROS) {
    if (j.logros[l.id] || !l.ok(s)) continue;
    j.logros[l.id] = new Date().toISOString();
    colaCelebraciones.push({ tipo: 'logro', ...l });
    ganarXP(l.xp, `Logro: ${l.nombre}`);
  }
}

/* ---------- Meses cerrados ---------- */

// Un mes "en la meta" exige haber registrado al menos 15 días:
// así no se gana dejando de anotar.
function evaluarMesesCerrados() {
  const j = E.juego, p = presupuestoDiaADia();
  const inicio = mesDe(fechaISO(new Date(E.creado)));
  for (let m = inicio; m < mesActual(); m = sumarMeses(m, 1)) {
    if (j.mesesEvaluados[m]) continue;
    j.mesesEvaluados[m] = true;
    if (!p) continue;
    const activos = Object.keys(j.diasActivos).filter(d => d.startsWith(m)).length;
    if (activos < 15) continue;
    const gastado = suma(movsDelMes(m).filter(esDiaADia));
    if (gastado <= p) {
      j.mesesEnMeta++;
      ganarXP(150, `Mes en la meta: ${nombreMes(m)}`);
    }
  }
}

/* ---------- Retos semanales ---------- */

function topeCalle() {
  const p = promedioSemanal(CATS_CALLE);
  return p > 0 ? Math.max(5000, redondear(p * 0.85, 5000)) : 0;
}

const RETOS = [
  { id: 'dias5', emoji: '📅', tipo: 'accion', meta: 5, xp: 50, texto: () => 'Registre algo en 5 días distintos', prog: s => s.diasActivos },
  { id: 'singasto2', emoji: '🧘', tipo: 'accion', meta: 2, xp: 60, texto: () => 'Confirme 2 días sin gastos', prog: s => s.sinGasto },
  { id: 'instante7', emoji: '⚡', tipo: 'accion', meta: 7, xp: 50, texto: () => 'Registre 7 gastos el mismo día en que ocurren', prog: s => s.alInstante },
  { id: 'ahorro1', emoji: '🐷', tipo: 'accion', meta: 1, xp: 50, texto: () => 'Haga un abono a una meta de ahorro', prog: s => s.ahorros, aplica: () => E.metas.length > 0 },
  { id: 'deuda1', emoji: '🔨', tipo: 'accion', meta: 1, xp: 50, texto: () => 'Haga un abono a una deuda', prog: s => s.pagosDeuda, aplica: () => E.deudas.some(d => saldoDeuda(d) > 0) },
  { id: 'tope_calle', emoji: '🍔', tipo: 'limite', xp: 70, metaFn: topeCalle, texto: meta => `Comida de calle, café y domicilios por debajo de ${pesos(meta)}`, prog: s => s.calle, aplica: () => topeCalle() > 0 },
  { id: 'hormigas6', emoji: '🐜', tipo: 'limite', meta: 6, xp: 60, texto: () => 'Máximo 6 gastos hormiga en la semana', prog: s => s.hormigas },
];

function semilla(texto) {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function retosDeSemana(semana = inicioSemana(hoy())) {
  const j = E.juego;
  if (!j.retos[semana]) {
    const aplicables = RETOS.filter(r => !r.aplica || r.aplica());
    const rnd = semilla(semana);
    const elegir = (arr, n) => { const a = [...arr], out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return out; };
    const sel = [...elegir(aplicables.filter(r => r.tipo === 'limite'), 1), ...elegir(aplicables.filter(r => r.tipo === 'accion'), 3)].slice(0, 3);
    j.retos[semana] = sel.map(r => ({ id: r.id, meta: r.metaFn ? r.metaFn() : r.meta }));
  }
  return j.retos[semana]
    .map(x => { const r = RETOS.find(y => y.id === x.id); return r ? { ...r, meta: x.meta } : null; })
    .filter(Boolean);
}

function statsSemana(semana) {
  const fin = sumarDias(semana, 6), j = E.juego;
  const lista = movsEntre(semana, fin).filter(m => m.origen !== 'planilla');
  const dentro = d => d >= semana && d <= fin;
  return {
    diasActivos: Object.keys(j.diasActivos).filter(dentro).length,
    sinGasto: Object.keys(j.sinGasto).filter(dentro).length,
    alInstante: lista.filter(m => m.tipo === 'gasto' && m.fecha === m.creadoDia).length,
    ahorros: lista.filter(m => m.tipo === 'ahorro').length,
    pagosDeuda: lista.filter(m => m.tipo === 'deuda').length,
    calle: suma(lista.filter(m => m.tipo === 'gasto' && CATS_CALLE.includes(m.cat))),
    hormigas: lista.filter(esHormiga).length,
  };
}

function progresoRetos(semana = inicioSemana(hoy())) {
  const s = statsSemana(semana), j = E.juego;
  return retosDeSemana(semana).map(r => {
    const valor = r.prog(s);
    const hecho = !!j.retosHechos[`${semana}:${r.id}`];
    let estado = hecho ? 'hecho' : 'en-curso';
    if (!hecho && r.tipo === 'limite' && valor > r.meta) estado = 'superado';
    return { ...r, valor, hecho, estado, textoFinal: r.texto(r.meta), pct: Math.min(1, r.meta ? valor / r.meta : 0) };
  });
}

function completarReto(semana, r) {
  const j = E.juego, k = `${semana}:${r.id}`;
  if (j.retosHechos[k]) return;
  j.retosHechos[k] = true;
  colaCelebraciones.push({ tipo: 'reto', ...r });
  ganarXP(r.xp, `Reto: ${r.textoFinal}`);
  if ((j.retos[semana] || []).every(x => j.retosHechos[`${semana}:${x.id}`])) j.semanasCompletas++;
}

function revisarRetos() {
  const j = E.juego, semana = inicioSemana(hoy());
  for (const r of progresoRetos(semana)) {
    if (r.tipo === 'accion' && !r.hecho && r.valor >= r.meta) completarReto(semana, r);
  }
  // Los retos de "tope" se cierran cuando termina la semana, solo si se registró al menos 4 días.
  for (const s of Object.keys(j.retos)) {
    if (s >= semana || j.retosEvaluados[s]) continue;
    j.retosEvaluados[s] = true;
    const st = statsSemana(s);
    for (const r of progresoRetos(s)) {
      if (r.tipo === 'limite' && !r.hecho && r.valor <= r.meta && st.diasActivos >= 4) completarReto(s, r);
    }
  }
}

/* ---------- Orquestación ---------- */

function revisarTodo() {
  revisarRetos();
  evaluarMesesCerrados();
  revisarLogros();
}

function alAbrir() {
  const r = revisarRacha();
  revisarTodo();
  guardar();
  return r;
}

/* ---------- Mascota ---------- */

function animoMascota() {
  const j = E.juego, r = racha(), pend = rachaPendienteHoy();
  const d = disponibleHoy();
  if (!Object.keys(j.diasActivos).length) return '¡Hola! Registre su primer gasto y empezamos a jugar.';
  if (pend && r > 0) return `Su racha de ${r} ${r === 1 ? 'día' : 'días'} lo espera. Anote algo hoy y sigue viva.`;
  if (pend) return 'Hoy es un buen día para empezar una racha nueva.';
  if (d && d.disponible < 0) return 'Hoy se pasó un poco del cupo. Mañana se recalcula solo. Sin culpas.';
  const activosMes = Object.keys(j.diasActivos).filter(x => x.startsWith(mesActual())).length;
  if (d && activosMes >= 5 && d.pctMes < d.pctTiempo - 0.1) return 'Va por debajo del ritmo del mes. ¡Muy bien!';
  if (r >= 7) return `¡${r} días seguidos! Usted ya tiene el hábito.`;
  return '¡Listo por hoy! Cada registro cuenta.';
}
