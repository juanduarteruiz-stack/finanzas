'use strict';
/* =========================================================================
   Finanzas · interfaz
   Vistas: inicio, movimientos, análisis, plan, logros, ajustes.
   Registro rápido en una hoja inferior con teclado propio.
   ========================================================================= */

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const M = n => `<span class="monto">${pesos(n)}</span>`;
const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

const UI = { ruta: null, mesMov: null, filtroMov: 'todos', busqueda: '', catMov: null, mesAnalisis: null };
let PLANILLA = null; // datos-privados/planilla.json si existe (solo en este computador)

const ICONOS = {
  inicio: '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  movimientos: '<svg viewBox="0 0 24 24"><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  analisis: '<svg viewBox="0 0 24 24"><path d="M5 20V11M12 20V4M19 20v-6M3 20h18"/></svg>',
  plan: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/></svg>',
  mas: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  ojo: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  ojoNo: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  atras: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  borrar: '<svg viewBox="0 0 24 24"><path d="M20 6H9l-6 6 6 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1zM12 10l4 4M16 10l-4 4"/></svg>',
};

/* =========================================================================
   Arranque
   ========================================================================= */

function iniciar() {
  cargar();
  UI.mesMov = mesActual();
  UI.mesAnalisis = mesActual();
  aplicarPreferencias();
  const r = alAbrir();
  if (r && r.usados) setTimeout(() => avisar(`🛡️ Usamos ${plural(r.usados, 'comodín', 'comodines')} y su racha sigue viva.`), 600);
  pintarTabs();
  render();
  setTimeout(mostrarCelebraciones, 400);
  buscarPlanilla();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

async function buscarPlanilla() {
  if (!location.protocol.startsWith('http')) return;
  try {
    const r = await fetch('datos-privados/planilla.json', { cache: 'no-store' });
    if (!r.ok) return;
    PLANILLA = await r.json();
    if (PLANILLA.tipo !== 'finanzas-planilla') { PLANILLA = null; return; }
    if (['inicio', 'ajustes'].includes(UI.ruta) || !E.ajustes.onboarding) render();
  } catch { /* no hay planilla local: normal en el celular */ }
}

function aplicarPreferencias() {
  document.body.classList.toggle('ocultar', !!E.ajustes.ocultarMontos);
}

/* =========================================================================
   Navegación
   ========================================================================= */

const TITULOS = { inicio: '', movimientos: 'Movimientos', analisis: 'Análisis', plan: 'Plan', logros: 'Logros', ajustes: 'Ajustes' };

function rutaActual() {
  const r = (location.hash.replace(/^#\/?/, '') || 'inicio').split('?')[0];
  return r === 'registrar' || TITULOS[r] !== undefined ? r : 'inicio';
}

function render() {
  let ruta = rutaActual();
  if (ruta === 'registrar') { history.replaceState(null, '', '#/inicio'); ruta = 'inicio'; setTimeout(() => abrirRegistro(), 50); }
  const cambio = ruta !== UI.ruta;
  UI.ruta = ruta;
  if (!E.ajustes.onboarding) {
    $('#barra').innerHTML = '';
    $('#tabs').hidden = true;
    $('#vista').innerHTML = vistaBienvenida();
    return;
  }
  $('#tabs').hidden = false;
  pintarBarra(ruta);
  const vistas = { inicio: vistaInicio, movimientos: vistaMovimientos, analisis: vistaAnalisis, plan: vistaPlan, logros: vistaLogros, ajustes: vistaAjustes };
  $('#vista').innerHTML = vistas[ruta]();
  document.querySelectorAll('#tabs [data-ir]').forEach(b => b.setAttribute('aria-current', b.dataset.ir === ruta ? 'page' : 'false'));
  if (cambio) { window.scrollTo(0, 0); if (ruta === 'analisis') { registrarVisitaAnalisis(); guardar(); setTimeout(mostrarCelebraciones, 300); } }
}

function pintarTabs() {
  $('#tabs').innerHTML = `
    <button data-ir="inicio">${ICONOS.inicio}<span>Inicio</span></button>
    <button data-ir="movimientos">${ICONOS.movimientos}<span>Movimientos</span></button>
    <button class="fab" data-accion="registrar" aria-label="Registrar un gasto">${ICONOS.mas}</button>
    <button data-ir="analisis">${ICONOS.analisis}<span>Análisis</span></button>
    <button data-ir="plan">${ICONOS.plan}<span>Plan</span></button>`;
}

function pintarBarra(ruta) {
  const ojo = `<button class="icono" data-accion="ocultar" aria-label="${E.ajustes.ocultarMontos ? 'Mostrar montos' : 'Ocultar montos'}">${E.ajustes.ocultarMontos ? ICONOS.ojoNo : ICONOS.ojo}</button>`;
  const ajustes = `<button class="icono" data-ir="ajustes" aria-label="Ajustes">${ICONOS.ajustes}</button>`;
  let izq;
  if (ruta === 'inicio') {
    const h = new Date().getHours();
    const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    const d = aFecha(hoy());
    izq = `<div><div class="saludo">${saludo}${E.ajustes.nombre ? `, ${esc(E.ajustes.nombre)}` : ''}</div>
      <div class="fecha-hoy">${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}</div></div>`;
  } else if (ruta === 'logros' || ruta === 'ajustes') {
    izq = `<button class="icono" data-accion="volver" aria-label="Volver">${ICONOS.atras}</button><h1>${TITULOS[ruta]}</h1>`;
  } else {
    izq = `<h1>${TITULOS[ruta]}</h1>`;
  }
  $('#barra').innerHTML = `<div class="barra-izq">${izq}</div><div class="barra-der">${ojo}${ruta !== 'ajustes' ? ajustes : ''}</div>`;
}

/* =========================================================================
   Bienvenida
   ========================================================================= */

function sugerenciaPresupuesto() {
  // Promedio del gasto del día a día en los meses con datos (sin contar el mes actual).
  const meses = new Map();
  for (const m of E.movimientos) if (esDiaADia(m) && mesDe(m.fecha) < mesActual()) meses.set(mesDe(m.fecha), (meses.get(mesDe(m.fecha)) || 0) + m.monto);
  const valores = [...meses.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-3).map(x => x[1]);
  return valores.length ? redondear(valores.reduce((a, b) => a + b, 0) / valores.length, 50000) : 0;
}

function vistaBienvenida() {
  const importado = E.movimientos.some(m => m.origen === 'planilla');
  const sug = sugerenciaPresupuesto();
  return `
  <section class="bienvenida">
    <div class="mascota-grande" aria-hidden="true">🐷</div>
    <h1>Finanzas</h1>
    <p class="lead">Anote cada gasto en segundos, vea a dónde se va la plata y gane puntos por crear el hábito.</p>
    <div class="tarjeta form">
      <label class="campo"><span>¿Cómo quiere que le diga?</span><input id="b-nombre" autocomplete="given-name" placeholder="Su nombre" value="${esc(E.ajustes.nombre)}"></label>
      <label class="campo"><span>¿Cuánto quiere gastar al mes en el día a día?</span>
        <input id="b-presupuesto" inputmode="numeric" data-dinero placeholder="$0" value="${E.ajustes.presupuestoMes ? pesos(E.ajustes.presupuestoMes) : sug ? pesos(sug) : ''}">
        <small>Mercado, comida, transporte, antojos… Sin arriendo ni facturas. ${sug ? `Según su planilla, viene gastando unos ${pesosCorto(sug)} al mes.` : 'Puede cambiarlo cuando quiera.'}</small>
      </label>
      ${PLANILLA && !importado ? `<button class="btn secundario ancho" data-accion="importar-planilla">📥 Traer mis datos de la planilla</button>` : ''}
      ${importado ? `<p class="ok">✅ Ya están sus datos de la planilla: ${plural(E.movimientos.filter(m => m.origen === 'planilla').length, 'movimiento', 'movimientos')}, facturas, metas y deudas.</p>` : ''}
      ${!PLANILLA && !importado ? `<button class="btn secundario ancho" data-accion="restaurar">📂 Tengo un archivo (copia o planilla)</button>` : ''}
      <button class="btn primario ancho grande" data-accion="b-empezar">Empezar</button>
      <input type="file" id="archivo-respaldo" accept=".json,application/json" hidden>
    </div>
    <p class="peque centro">🔒 Sus datos se guardan solo en este dispositivo. Nada sale a internet.</p>
  </section>`;
}

/* =========================================================================
   Inicio
   ========================================================================= */

function vistaInicio() {
  return [
    tarjetaVuelta(), tarjetaJuego(), tarjetaDisponible(), tarjetaSinGasto(), tarjetaAtajos(),
    tarjetaFacturas(), tarjetaRetos(), tarjetaSemana(), tarjetaUltimos(), tarjetaRespaldo(),
  ].join('');
}

function tarjetaVuelta() {
  const ult = ultimoActivo();
  if (!ult || !rachaPendienteHoy() || difDias(ult, hoy()) < 3) return '';
  return `<section class="tarjeta suave">
    <h3>👋 ¡Qué bueno verlo de vuelta!</h3>
    <p>No se preocupe por los días sin anotar. Empiece con lo de hoy. Si recuerda algún gasto grande, agréguelo con su fecha.</p>
  </section>`;
}

function tarjetaJuego() {
  const n = infoNivel(), r = racha(), pend = rachaPendienteHoy(), j = E.juego;
  return `<section class="tarjeta juego" data-ir="logros" role="link" tabindex="0" aria-label="Ver logros">
    <div class="mascota" aria-hidden="true">🐷</div>
    <div class="juego-info">
      <div class="fila"><strong>Nivel ${n.nivel} · ${n.emoji} ${esc(n.nombre)}</strong>
        <span class="racha ${pend ? 'pendiente' : ''}" title="Días seguidos registrando">🔥 ${r}</span></div>
      <div class="barra-xp" role="progressbar" aria-valuenow="${n.xpEnNivel}" aria-valuemax="${n.xpSiguiente}"><i style="width:${n.pct * 100}%"></i></div>
      <div class="fila peque"><span>${n.xpEnNivel} / ${n.xpSiguiente} XP</span><span>🛡️ ${plural(j.comodines, 'comodín', 'comodines')}</span></div>
      <p class="frase">${esc(animoMascota())}</p>
    </div>
  </section>`;
}

function tarjetaDisponible() {
  const d = disponibleHoy();
  if (!d) {
    return `<section class="tarjeta hero">
      <div class="etiqueta">Puede gastar hoy</div>
      <p>Póngale un tope mensual al día a día y aquí le digo cuánto puede gastar cada día.</p>
      <button class="btn primario" data-accion="editar-presupuesto">Definir presupuesto</button>
    </section>`;
  }
  const st = estadoPresupuesto(d.gastadoMes, d.presupuesto);
  return `<section class="tarjeta hero">
    <div class="etiqueta">Puede gastar hoy</div>
    <div class="hero-num">${M(Math.max(0, d.disponible))}</div>
    <div class="nota-suave">${d.disponible < 0
      ? `Hoy va ${M(-d.disponible)} por encima. Mañana el cupo se ajusta solo.`
      : `Gastado hoy ${M(d.gastadoHoy)} de ${M(d.cupoHoy)}`}</div>
    <div class="mes-prog">
      <div class="fila peque"><span>Mes: ${M(d.gastadoMes)} de ${M(d.presupuesto)}</span><span>${plural(d.diasRestantes, 'día', 'días')} por delante</span></div>
      <div class="progreso"><i class="${st.clase}" style="width:${Math.min(100, d.pctMes * 100)}%"></i><b class="marca-tiempo" style="left:${d.pctTiempo * 100}%" title="Dónde debería ir hoy"></b></div>
      <div class="peque estado-${st.clase}">${st.icono} ${st.texto}${d.restanteMes > 0 ? ` · le quedan ${M(d.restanteMes)}` : ''}</div>
    </div>
  </section>`;
}

function tarjetaSinGasto() {
  const h = hoy(), ayer = sumarDias(h, -1), hora = new Date().getHours();
  const opciones = [];
  if (hora >= 17 && puedeDeclararSinGasto(h)) opciones.push({ fecha: h, texto: 'Hoy no gasté nada' });
  if (puedeDeclararSinGasto(ayer) && Object.keys(E.juego.diasActivos).length && ayer >= fechaISO(new Date(E.creado))) opciones.push({ fecha: ayer, texto: 'Ayer no gasté nada' });
  return opciones.map(o => `<button class="tarjeta zen" data-accion="sin-gasto" data-fecha="${o.fecha}">
      <span class="zen-emoji">🧘</span><span><strong>${o.texto}</strong><small>Confírmelo y gane +${XP.sinGasto} XP</small></span></button>`).join('');
}

function tarjetaAtajos() {
  let atajos = atajosFrecuentes(6);
  if (atajos.length < 4) {
    const usados = new Set(atajos.map(a => a.cat));
    for (const c of categoriasOrdenadas(['variable'])) {
      if (atajos.length >= 6) break;
      if (!usados.has(c.id) && c.id !== 'efectivo' && c.id !== 'otro') atajos.push({ cat: c.id, nota: '', monto: 0 });
    }
  }
  return `<section class="tarjeta">
    <div class="titulo-tarjeta"><h3>Registro rápido</h3><span class="peque">Toque y guarde</span></div>
    <div class="atajos">${atajos.map(a => {
      const c = categoria(a.cat);
      return `<button class="atajo" data-accion="atajo" data-cat="${a.cat}" data-nota="${esc(a.nota)}" data-monto="${a.monto || ''}" data-metodo="${esc(a.metodo || '')}">
        <span class="atajo-emoji">${c.emoji}</span><span class="atajo-nombre">${esc(a.nota || c.nombre)}</span>${a.monto ? `<small>${M(a.monto)}</small>` : ''}</button>`;
    }).join('')}</div>
  </section>`;
}

function tarjetaFacturas() {
  const lista = proximasFacturas(7);
  if (!lista.length) return '';
  return `<section class="tarjeta">
    <div class="titulo-tarjeta"><h3>Próximos pagos</h3><a href="#/plan" class="peque enlace">Ver todo</a></div>
    ${lista.map(x => `<div class="fila-item">
      <span class="mov-emoji">${categoria(x.f.cat).emoji}</span>
      <span class="mov-texto"><span class="mov-titulo">${esc(x.f.nombre)}</span><span class="mov-sub ${x.estado === 'vencida' ? 'estado-critico' : ''}">${textoVence(x)}</span></span>
      <span class="mov-monto">${M(x.f.monto)}</span>
      <button class="btn mini" data-accion="pagar-factura" data-id="${x.f.id}" data-mes="${x.mes}">Pagar</button>
    </div>`).join('')}
  </section>`;
}

function textoVence(x) {
  if (x.estado === 'vencida') return `⚠️ Venció hace ${plural(-x.dias, 'día', 'días')}`;
  const d = difDias(hoy(), x.vence);
  return d === 0 ? '⏰ Vence hoy' : d === 1 ? '⏰ Vence mañana' : `Vence en ${d} días`;
}

function tarjetaRetos() {
  const retos = progresoRetos();
  if (!retos.length) return '';
  const fin = sumarDias(inicioSemana(hoy()), 6), dias = difDias(hoy(), fin);
  return `<section class="tarjeta">
    <div class="titulo-tarjeta"><h3>Retos de la semana</h3><span class="peque">${dias === 0 ? 'Terminan hoy' : `Quedan ${plural(dias + 1, 'día', 'días')}`}</span></div>
    ${retos.map(htmlReto).join('')}
  </section>`;
}

function htmlReto(r) {
  let detalle;
  if (r.hecho) detalle = '✅ ¡Cumplido!';
  else if (r.tipo === 'limite') detalle = r.estado === 'superado'
    ? 'Esta semana no se dio. El lunes llega un reto nuevo.'
    : `Lleva ${r.id === 'tope_calle' ? pesos(r.valor) : r.valor} de ${r.id === 'tope_calle' ? pesos(r.meta) : r.meta}. Se cierra el domingo.`;
  else detalle = `${r.valor} de ${r.meta}`;
  return `<div class="reto ${r.estado}">
    <span class="reto-emoji">${r.emoji}</span>
    <div class="reto-info">
      <div class="fila"><span>${esc(r.textoFinal)}</span><span class="xp">+${r.xp} XP</span></div>
      <div class="progreso fino"><i class="${r.estado === 'superado' ? 'serio' : r.tipo === 'limite' ? 'tope' : 'bien'}" style="width:${(r.hecho ? 1 : r.pct) * 100}%"></i></div>
      <div class="peque">${detalle}</div>
    </div>
  </div>`;
}

function tarjetaSemana() {
  const lunes = inicioSemana(hoy()), h = hoy();
  const dias = difDias(lunes, h);
  const esta = movsEntre(lunes, h).filter(m => m.tipo === 'gasto' && categoria(m.cat).grupo === 'variable');
  const pasada = movsEntre(sumarDias(lunes, -7), sumarDias(lunes, -7 + dias)).filter(m => m.tipo === 'gasto' && categoria(m.cat).grupo === 'variable');
  if (!esta.length && !pasada.length) return '';
  const a = suma(esta), b = suma(pasada);
  const top = gastoPorCategoria(esta, ['variable'])[0];
  let comp = '';
  if (b > 0) {
    const dif = (a - b) / b;
    comp = Math.abs(dif) < 0.05 ? 'Casi igual que la semana pasada a esta altura.'
      : dif < 0 ? `▼ ${Math.round(-dif * 100)}% menos que la semana pasada a esta altura.`
        : `▲ ${Math.round(dif * 100)}% más que la semana pasada a esta altura.`;
  }
  return `<section class="tarjeta">
    <div class="titulo-tarjeta"><h3>Esta semana</h3><a href="#/analisis" class="peque enlace">Análisis</a></div>
    <div class="dato-grande">${M(a)}</div>
    <p class="peque">${comp}${top ? ` Lo que más pesa: ${categoria(top.cat).emoji} ${esc(categoria(top.cat).nombre)}.` : ''}</p>
  </section>`;
}

function tarjetaUltimos() {
  const lista = [...E.movimientos].sort(ordenMov).slice(0, 5);
  if (!lista.length) {
    return `<section class="tarjeta vacio">
      <p>Aún no hay movimientos. Toque el botón <strong>+</strong> para registrar el primero.</p>
    </section>`;
  }
  return `<section class="tarjeta">
    <div class="titulo-tarjeta"><h3>Últimos movimientos</h3><a href="#/movimientos" class="peque enlace">Ver todos</a></div>
    <div class="lista">${lista.map(itemMov).join('')}</div>
  </section>`;
}

function tarjetaRespaldo() {
  const n = E.movimientos.filter(m => m.origen !== 'planilla').length;
  const ult = E.ajustes.ultimoRespaldo;
  if (n < 10 || (ult && difDias(ult.slice(0, 10), hoy()) < 30)) return '';
  return `<section class="tarjeta suave">
    <h3>💾 Guarde una copia</h3>
    <p class="peque">Sus datos viven solo en este dispositivo. Una copia lo protege si cambia de celular o se borra el navegador.</p>
    <button class="btn secundario" data-accion="respaldo">Guardar copia ahora</button>
  </section>`;
}

/* ---------- Movimiento en lista ---------- */

function ordenMov(a, b) { return b.fecha.localeCompare(a.fecha) || String(b.creado).localeCompare(String(a.creado)); }

function descripcionMov(m) {
  const met = m.metodo ? metodo(m.metodo) : null;
  const extra = [met && met.nombre !== '—' ? met.nombre : null, m.cuotas > 1 ? `${m.cuotas} cuotas` : null].filter(Boolean);
  if (m.tipo === 'ahorro') {
    const mt = meta(m.metaId);
    return { emoji: mt ? mt.emoji : '🐷', titulo: m.nota || `Ahorro: ${mt ? mt.nombre : 'meta'}`, sub: ['Ahorro', mt ? mt.nombre : null, ...extra].filter(Boolean).join(' · ') };
  }
  if (m.tipo === 'deuda') {
    const d = deuda(m.deudaId);
    return { emoji: d ? d.emoji : '💳', titulo: m.nota || `Abono a ${d ? d.nombre : 'deuda'}`, sub: ['Pago de deuda', d ? d.nombre : null, ...extra].filter(Boolean).join(' · ') };
  }
  const c = categoria(m.cat);
  return { emoji: c.emoji, titulo: m.nota || c.nombre, sub: [m.nota ? c.nombre : null, ...extra].filter(Boolean).join(' · ') || GRUPOS[c.grupo].nombre };
}

function itemMov(m) {
  const info = descripcionMov(m);
  const signo = m.tipo === 'ingreso' ? '+' : m.tipo === 'gasto' ? '−' : '';
  return `<button class="mov" data-accion="editar-mov" data-id="${m.id}">
    <span class="mov-emoji">${info.emoji}</span>
    <span class="mov-texto"><span class="mov-titulo">${esc(info.titulo)}</span><span class="mov-sub">${esc(info.sub)}</span></span>
    <span class="mov-monto ${m.tipo}">${signo}${M(m.monto)}</span>
  </button>`;
}

/* =========================================================================
   Movimientos
   ========================================================================= */

function navMes(clave, mes) {
  const sig = sumarMeses(mes, 1);
  return `<div class="nav-mes">
    <button class="icono" data-accion="mes" data-clave="${clave}" data-paso="-1" aria-label="Mes anterior">‹</button>
    <strong>${nombreMes(mes)}</strong>
    <button class="icono" data-accion="mes" data-clave="${clave}" data-paso="1" aria-label="Mes siguiente" ${sig > mesActual() ? 'disabled' : ''}>›</button>
  </div>`;
}

function vistaMovimientos() {
  const filtros = [['todos', 'Todos'], ['gasto', 'Gastos'], ['ingreso', 'Ingresos'], ['ahorro', 'Ahorro'], ['deuda', 'Deudas']];
  return `${navMes('mesMov', UI.mesMov)}
    <input type="search" id="buscar" class="buscar" placeholder="Buscar por nota o categoría" value="${esc(UI.busqueda)}" aria-label="Buscar movimientos">
    <div class="chips">${filtros.map(([v, t]) => `<button class="chip ${UI.filtroMov === v ? 'activo' : ''}" data-accion="filtro-mov" data-v="${v}">${t}</button>`).join('')}
      ${UI.catMov ? `<button class="chip activo" data-accion="quitar-cat">${categoria(UI.catMov).emoji} ${esc(categoria(UI.catMov).nombre)} ✕</button>` : ''}</div>
    <div id="lista-movs">${htmlListaMovs()}</div>`;
}

function htmlListaMovs() {
  const q = sinTildes(UI.busqueda.trim());
  const lista = movsDelMes(UI.mesMov).filter(m =>
    (UI.filtroMov === 'todos' || m.tipo === UI.filtroMov) &&
    (!UI.catMov || m.cat === UI.catMov) &&
    (!q || sinTildes(`${m.nota} ${m.cat ? categoria(m.cat).nombre : ''} ${descripcionMov(m).sub}`).includes(q))
  ).sort(ordenMov);
  if (!lista.length) return `<div class="tarjeta vacio"><p>No hay movimientos ${q || UI.catMov || UI.filtroMov !== 'todos' ? 'con ese filtro' : `en ${nombreMes(UI.mesMov, false).toLowerCase()}`}.</p></div>`;
  const t = totales(lista);
  const porDia = new Map();
  for (const m of lista) { if (!porDia.has(m.fecha)) porDia.set(m.fecha, []); porDia.get(m.fecha).push(m); }
  return `<p class="resumen-lista">${plural(lista.length, 'movimiento', 'movimientos')} · Gastos ${M(t.gastos + t.inversion)}${t.ingresos ? ` · Ingresos ${M(t.ingresos)}` : ''}</p>
    ${[...porDia.entries()].map(([fecha, movs]) => {
      const g = suma(movs.filter(esGasto));
      return `<section class="dia">
        <div class="dia-cab"><span>${fechaCorta(fecha)}</span>${g ? `<span>${M(g)}</span>` : ''}</div>
        <div class="tarjeta lista">${movs.map(itemMov).join('')}</div>
      </section>`;
    }).join('')}`;
}

/* =========================================================================
   Análisis
   ========================================================================= */

function vistaAnalisis() {
  const mes = UI.mesAnalisis, lista = movsDelMes(mes), t = totales(lista);
  const esActual = mes === mesActual();
  const diasMes = diasDelMes(mes);
  const diaHoy = esActual ? Number(hoy().slice(8)) : diasMes;
  if (!lista.length) return `${navMes('mesAnalisis', mes)}<div class="tarjeta vacio"><p>No hay datos en ${nombreMes(mes, false).toLowerCase()}. Registre gastos y aquí verá a dónde se va la plata.</p></div>`;

  // Gasto diario del día a día
  const porDia = Array.from({ length: diasMes }, () => 0);
  for (const m of lista) if (esDiaADia(m)) porDia[Number(m.fecha.slice(8)) - 1] += m.monto;
  const p = presupuestoDiaADia();
  const datosDia = porDia.map((v, i) => ({
    etiqueta: String(i + 1), valor: v, resaltar: esActual && i + 1 === diaHoy,
    tip: `${fechaCorta(`${mes}-${String(i + 1).padStart(2, '0')}`)} · ${pesos(v)}`,
  }));

  // Categorías
  const cats = gastoPorCategoria(lista);
  const totalCats = cats.reduce((a, c) => a + c.total, 0);
  const filasCat = cats.slice(0, 8).map(c => ({ cat: c.cat, emoji: categoria(c.cat).emoji, nombre: categoria(c.cat).nombre, valor: c.total, tope: E.presupuestos[c.cat] || 0, accion: 'ver-cat', tip: `${categoria(c.cat).nombre}: ${pesos(c.total)}` }));
  const resto = cats.slice(8);
  if (resto.length) filasCat.push({ emoji: '➕', nombre: `Otras ${resto.length}`, valor: resto.reduce((a, c) => a + c.total, 0), tip: resto.map(c => categoria(c.cat).nombre).join(', ') });

  // Hormiga
  const hor = hormigasDe(lista);
  const proyeccion = hor.total / Math.max(1, diaHoy) * 365;

  // 50/30/20
  const rep = reparto503020(lista), ideal = E.ajustes.reparto;

  // Comparación con el mes anterior
  const ant = sumarMeses(mes, -1);
  const listaAnt = movsDelMes(ant).filter(m => !esActual || Number(m.fecha.slice(8)) <= diaHoy);
  const mapaAnt = new Map(gastoPorCategoria(listaAnt).map(c => [c.cat, c.total]));
  const cambios = !mapaAnt.size ? [] : [...new Set([...cats.map(c => c.cat), ...mapaAnt.keys()])]
    .map(cat => ({ cat, ahora: (cats.find(c => c.cat === cat) || {}).total || 0, antes: mapaAnt.get(cat) || 0 }))
    .map(x => ({ ...x, dif: x.ahora - x.antes }))
    .filter(x => Math.abs(x.dif) >= 1000)
    .sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)).slice(0, 5);

  // Últimos 6 meses
  const meses = Array.from({ length: 6 }, (_, i) => sumarMeses(mes, i - 5));
  const datosMeses = meses.map((m, i) => { const tt = totalesMes(m); return { etiqueta: nombreMes(m, false).slice(0, 3), valor: tt.gastos, resaltar: i === 5, tip: `${nombreMes(m)} · gastos ${pesos(tt.gastos)} · ingresos ${pesos(tt.ingresos)}` }; });

  const gmf = estimadoGMF(lista);
  const tasaAhorro = t.ingresos > 0 ? (t.ahorro + t.deuda + t.inversion) / t.ingresos : null;

  return `${navMes('mesAnalisis', mes)}
  <section class="tarjeta">
    <div class="stats">
      <div class="stat"><span>Ingresos</span><strong class="ingreso">${M(t.ingresos)}</strong></div>
      <div class="stat"><span>Gastos</span><strong>${M(t.gastos)}</strong></div>
      <div class="stat"><span>Ahorro, deudas e inversión</span><strong>${M(t.ahorro + t.deuda + t.inversion)}</strong></div>
      <div class="stat"><span>Balance</span><strong class="${!t.ingresos ? '' : t.balance < 0 ? 'estado-critico' : 'ingreso'}">${t.ingresos ? M(t.balance) : '—'}</strong></div>
    </div>
    ${t.ingresos === 0 ? '<p class="peque">💡 Registre sus ingresos para ver el balance y cuánto logra guardar.</p>' : tasaAhorro !== null ? `<p class="peque">Este mes destinó el <strong>${Math.round(tasaAhorro * 100)}%</strong> de lo que entró a ahorro, deudas e inversión.</p>` : ''}
  </section>

  <section class="tarjeta">
    <div class="titulo-tarjeta"><h3>Día a día, por día</h3>${p ? `<span class="peque"><i class="muestra-ref"></i> cupo diario</span>` : ''}</div>
    ${graficoBarras(datosDia, { referencia: p ? { valor: p / diasMes } : null, etiquetasCada: 7, titulo: `Gasto del día a día por día en ${nombreMes(mes)}` })}
  </section>

  <section class="tarjeta">
    <div class="titulo-tarjeta"><h3>¿En qué se fue?</h3><span class="peque">Toque para ver el detalle</span></div>
    ${filasCat.length ? barrasHorizontales(filasCat, totalCats) : '<p class="peque">Sin gastos este mes.</p>'}
  </section>

  <section class="tarjeta">
    <h3>🐜 Gastos hormiga</h3>
    <p>Gastos de ${M(E.ajustes.umbralHormiga)} o menos: <strong>${plural(hor.cantidad, 'gasto', 'gastos')}</strong> que suman <strong>${M(hor.total)}</strong>.</p>
    ${hor.total > 0 ? `<p class="peque">A este ritmo serían unos <strong>${pesosCorto(proyeccion)}</strong> al año.${hor.porCategoria[0] ? ` La mayoría se va en ${categoria(hor.porCategoria[0].cat).emoji} ${esc(categoria(hor.porCategoria[0].cat).nombre)}.` : ''}</p>` : ''}
  </section>

  <section class="tarjeta">
    <div class="titulo-tarjeta"><h3>Reparto ${ideal.necesidad}/${ideal.gusto}/${ideal.ahorro}</h3><span class="peque">${t.ingresos ? 'sobre lo que salió' : ''}</span></div>
    ${barraSegmentada([
      { nombre: 'Necesidades', valor: rep.necesidad, serie: 1, ideal: ideal.necesidad },
      { nombre: 'Gustos', valor: rep.gusto, serie: 2, ideal: ideal.gusto },
      { nombre: 'Ahorro, deudas e inversión', valor: rep.ahorro, serie: 3, ideal: ideal.ahorro },
    ])}
    <p class="peque">Puede cambiar si una categoría es necesidad o gusto en Ajustes.</p>
  </section>

  ${cambios.length ? `<section class="tarjeta">
    <h3>Comparado con ${nombreMes(ant, false).toLowerCase()}${esActual ? ' a esta altura' : ''}</h3>
    ${cambios.map(x => `<div class="fila-item">
      <span class="mov-emoji">${categoria(x.cat).emoji}</span>
      <span class="mov-texto"><span class="mov-titulo">${esc(categoria(x.cat).nombre)}</span><span class="mov-sub">${M(x.antes)} → ${M(x.ahora)}</span></span>
      <span class="cambio ${x.dif > 0 ? 'sube' : 'baja'}">${x.dif > 0 ? '▲' : '▼'} ${M(Math.abs(x.dif))}</span>
    </div>`).join('')}
  </section>` : ''}

  <section class="tarjeta">
    <h3>Gastos de los últimos 6 meses</h3>
    ${graficoBarras(datosMeses, { alto: 140, titulo: 'Gastos de los últimos seis meses', valorDirecto: 5 })}
  </section>

  ${gmf.base > 0 ? `<section class="tarjeta suave">
    <h3>🏛️ 4x1000 estimado</h3>
    <p class="peque">Pagó ${M(gmf.base)} con medios bancarios marcados con 4x1000. El impuesto sería de unos <strong>${M(gmf.impuesto)}</strong>. Si tiene una cuenta marcada como exenta, puede no aplicar. Revise los medios de pago en Ajustes.</p>
  </section>` : ''}`;
}

/* =========================================================================
   Plan: presupuestos, facturas, metas y deudas
   ========================================================================= */

function vistaPlan() {
  return `<div class="chips anclas">
      <a class="chip" href="#presupuestos" data-accion="ancla" data-id="presupuestos">Presupuesto</a>
      <a class="chip" href="#facturas" data-accion="ancla" data-id="facturas">Facturas</a>
      <a class="chip" href="#metas" data-accion="ancla" data-id="metas">Metas</a>
      <a class="chip" href="#deudas" data-accion="ancla" data-id="deudas">Deudas</a>
    </div>
    ${seccionPresupuestos()}${seccionFacturas()}${seccionMetas()}${seccionDeudas()}`;
}

function seccionPresupuestos() {
  const mes = mesActual(), lista = movsDelMes(mes);
  const p = presupuestoDiaADia();
  const gastoDD = suma(lista.filter(esDiaADia));
  const st = estadoPresupuesto(gastoDD, p);
  const porCat = new Map(gastoPorCategoria(lista, ['variable', 'fijo']).map(c => [c.cat, c.total]));
  const filas = E.categorias.filter(c => ['variable', 'fijo'].includes(c.grupo) && ((E.presupuestos[c.id] || 0) > 0 || porCat.get(c.id)))
    .map(c => ({ c, gastado: porCat.get(c.id) || 0, tope: E.presupuestos[c.id] || 0 }))
    .sort((a, b) => (b.tope ? 1 : 0) - (a.tope ? 1 : 0) || b.gastado - a.gastado);
  return `<section class="tarjeta" id="presupuestos">
    <div class="titulo-tarjeta"><h3>Presupuesto de ${nombreMes(mes, false).toLowerCase()}</h3><button class="btn mini" data-accion="editar-presupuesto">Editar</button></div>
    ${p ? `<div class="fila"><span>Día a día</span><span>${M(gastoDD)} de ${M(p)}</span></div>
      <div class="progreso"><i class="${st.clase}" style="width:${Math.min(100, st.pct * 100)}%"></i></div>
      <p class="peque estado-${st.clase}">${st.icono} ${st.texto}</p>`
      : '<p class="peque">Aún no tiene tope para el día a día.</p>'}
    <div class="sep"></div>
    <div class="titulo-tarjeta"><h4>Por categoría</h4><button class="btn mini secundario" data-accion="topes-categoria">Ajustar topes</button></div>
    ${filas.length ? filas.map(({ c, gastado, tope }) => {
      const s = estadoPresupuesto(gastado, tope);
      return `<div class="cat-presu">
        <div class="fila"><span>${c.emoji} ${esc(c.nombre)}</span><span>${M(gastado)}${tope ? ` <small>de ${M(tope)}</small>` : ''}</span></div>
        ${tope ? `<div class="progreso fino"><i class="${s.clase}" style="width:${Math.min(100, s.pct * 100)}%"></i></div>${s.clase !== 'bien' ? `<div class="peque estado-${s.clase}">${s.icono} ${s.texto}</div>` : ''}` : ''}
      </div>`;
    }).join('') : '<p class="peque">Ponga topes a las categorías donde más se le va la plata.</p>'}
  </section>`;
}

function seccionFacturas() {
  const mes = mesActual();
  const activas = E.facturas.filter(f => f.activa !== false).sort((a, b) => (a.dia || 0) - (b.dia || 0));
  const totalMes = activas.filter(f => facturaTocaEnMes(f, mes)).reduce((t, f) => t + f.monto, 0);
  const provision = activas.filter(f => (f.periodo || 1) > 1).reduce((t, f) => t + f.monto / f.periodo, 0);
  const etiquetas = { pagada: '✅ Pagada', vencida: '⚠️ Vencida', pronto: '⏰ Pronto', pendiente: 'Pendiente', 'no-toca': 'No toca este mes', 'sin-confirmar': '¿Ya la pagó?' };
  return `<section class="tarjeta" id="facturas">
    <div class="titulo-tarjeta"><h3>Facturas fijas</h3><button class="btn mini" data-accion="nueva-factura">+ Nueva</button></div>
    ${activas.length ? `<p class="peque">Este mes: ${M(totalMes)}${provision ? ` · Aparte ${M(provision)} al mes para las que no son mensuales.` : ''}</p>` : '<p class="peque">Agregue arriendo, servicios, celular, internet, suscripciones… y la app le avisa cuándo vencen.</p>'}
    ${activas.map(f => {
      const st = estadoFactura(f, mes);
      const per = { 1: 'mensual', 2: 'cada 2 meses', 3: 'trimestral', 6: 'semestral', 12: 'anual' }[f.periodo || 1] || `cada ${f.periodo} meses`;
      return `<div class="fila-item">
        <button class="mov-emoji boton-limpio" data-accion="editar-factura" data-id="${f.id}" aria-label="Editar ${esc(f.nombre)}">${categoria(f.cat).emoji}</button>
        <button class="mov-texto boton-limpio" data-accion="editar-factura" data-id="${f.id}"><span class="mov-titulo">${esc(f.nombre)}</span><span class="mov-sub">Día ${f.dia} · ${per} · <span class="estado-${st.estado === 'vencida' ? 'critico' : st.estado === 'pronto' ? 'serio' : st.estado === 'pagada' ? 'bien' : 'neutro'}">${etiquetas[st.estado]}</span></span></button>
        <span class="mov-monto">${M(f.monto)}</span>
        ${['pendiente', 'pronto', 'vencida', 'sin-confirmar'].includes(st.estado) ? `<button class="btn mini" data-accion="pagar-factura" data-id="${f.id}" data-mes="${mes}">Pagar</button>` : ''}
      </div>`;
    }).join('')}
  </section>`;
}

function seccionMetas() {
  return `<section class="tarjeta" id="metas">
    <div class="titulo-tarjeta"><h3>Metas de ahorro</h3><button class="btn mini" data-accion="nueva-meta">+ Nueva</button></div>
    ${E.metas.length ? `<p class="peque">💡 <strong>Págate primero:</strong> cuando registre un ingreso, la app le propone separar el porcentaje de cada meta.</p>` : '<p class="peque">Cree metas como fondo de emergencia, viaje o la prima de diciembre.</p>'}
    ${E.metas.map(m => {
      const ah = ahorradoMeta(m), pct = m.objetivo ? ah / m.objetivo : 0;
      let ritmo = '';
      if (m.objetivo && m.fechaLimite && ah < m.objetivo) {
        const meses = Math.max(1, difMeses(mesActual(), mesDe(m.fechaLimite)));
        ritmo = `Aparte ${M((m.objetivo - ah) / meses)} al mes para llegar en ${nombreMes(mesDe(m.fechaLimite)).toLowerCase()}.`;
      }
      return `<div class="meta">
        ${m.objetivo ? anillo(pct) : `<span class="meta-emoji-solo">${m.emoji}</span>`}
        <button class="meta-info boton-limpio" data-accion="editar-meta" data-id="${m.id}">
          <span class="mov-titulo">${m.objetivo ? `${m.emoji} ` : ''}${esc(m.nombre)}${m.porcentaje ? ` <small class="pill">${m.porcentaje}%</small>` : ''}</span>
          <span class="mov-sub">${M(ah)}${m.objetivo ? ` de ${M(m.objetivo)}` : ' ahorrado · defina la meta'}</span>
          ${ritmo ? `<span class="mov-sub">${ritmo}</span>` : ''}
          ${pct >= 1 ? '<span class="mov-sub estado-bien">🏆 ¡Meta cumplida!</span>' : ''}
        </button>
        <button class="btn mini" data-accion="abonar-meta" data-id="${m.id}">Abonar</button>
      </div>`;
    }).join('')}
  </section>`;
}

function seccionDeudas() {
  if (!E.deudas.length) {
    return `<section class="tarjeta" id="deudas">
      <div class="titulo-tarjeta"><h3>Deudas</h3><button class="btn mini" data-accion="nueva-deuda">+ Nueva</button></div>
      <p class="peque">Anote tarjetas, créditos o plata que le prestaron. La app le dice cuál pagar primero y cuándo queda libre.</p>
    </section>`;
  }
  const est = E.ajustes.estrategiaDeuda;
  const activas = ordenarDeudas(E.deudas.filter(d => saldoDeuda(d) > 0), est);
  const pagadas = E.deudas.filter(d => saldoDeuda(d) <= 0);
  const total = activas.reduce((t, d) => t + saldoDeuda(d), 0);
  const pr = proyectarDeudas();
  let proy = '';
  if (pr.libre) proy = '<p class="ok">🦅 ¡No tiene deudas pendientes!</p>';
  else if (pr.imposible) proy = `<p class="peque estado-critico">⚠️ Con ${M(pr.pagoMes)} al mes no alcanza ni para los intereses. Suba el pago mensual.</p>`;
  else proy = `<p>Libre de deudas en <strong>${nombreMes(pr.fechaLibre).toLowerCase()}</strong>, pagando ${M(pr.pagoMes)} al mes.</p>
    <p class="peque">Intereses estimados en ese camino: ${M(pr.interesTotal)}. Cada abono extra adelanta la fecha.</p>`;
  return `<section class="tarjeta" id="deudas">
    <div class="titulo-tarjeta"><h3>Deudas</h3><button class="btn mini" data-accion="nueva-deuda">+ Nueva</button></div>
    <div class="dato-grande">${M(total)}</div>
    ${proy}
    <div class="seg pequeno" role="group" aria-label="Estrategia">
      <button class="${est === 'bola' ? 'activo' : ''}" data-accion="estrategia" data-v="bola">❄️ Bola de nieve</button>
      <button class="${est === 'avalancha' ? 'activo' : ''}" data-accion="estrategia" data-v="avalancha">🏔️ Avalancha</button>
    </div>
    <p class="peque">${est === 'bola' ? 'Primero la de menor saldo: victorias rápidas que motivan.' : 'Primero la de mayor interés: paga menos intereses en total.'}
      <button class="enlace boton-limpio" data-accion="pago-deudas">Pago mensual: ${M(pr.pagoMes || E.ajustes.pagoDeudaMensual)}</button></p>
    ${activas.map((d, i) => {
      const saldo = saldoDeuda(d), orig = d.montoOriginal || d.saldoInicial, pct = orig ? 1 - saldo / orig : 0;
      const meses = pr.porDeuda && pr.porDeuda[d.id];
      return `<div class="deuda ${i === 0 ? 'prioridad' : ''}">
        <button class="boton-limpio deuda-info" data-accion="editar-deuda" data-id="${d.id}">
          <span class="mov-titulo">${d.emoji} ${esc(d.nombre)} ${i === 0 ? '<small class="pill">Prioridad</small>' : ''}</span>
          <span class="mov-sub">Saldo ${M(saldo)}${d.tasaEA ? ` · ${String(d.tasaEA).replace('.', ',')}% E.A.` : ' · sin intereses'} · mínimo ${M(d.pagoMinimo || 0)}${d.diaPago ? ` · día ${d.diaPago}` : ''}</span>
          <span class="progreso fino"><i class="bien" style="width:${Math.max(0, pct * 100)}%"></i></span>
          <span class="mov-sub">${Math.round(pct * 100)}% pagado${meses ? ` · termina en ${nombreMes(sumarMeses(mesActual(), meses)).toLowerCase()}` : ''}</span>
        </button>
        <button class="btn mini" data-accion="abonar-deuda" data-id="${d.id}">Abonar</button>
      </div>`;
    }).join('')}
    ${pagadas.length ? `<p class="peque">🔓 Pagadas: ${pagadas.map(d => esc(d.nombre)).join(', ')}.</p>` : ''}
  </section>`;
}

/* =========================================================================
   Logros
   ========================================================================= */

function vistaLogros() {
  const n = infoNivel(), j = E.juego, r = racha();
  const desbloqueados = LOGROS.filter(l => j.logros[l.id]).length;
  return `<section class="tarjeta nivel-grande">
      <div class="nivel-emoji">${n.emoji}</div>
      <h2>Nivel ${n.nivel} · ${esc(n.nombre)}</h2>
      <div class="barra-xp grande"><i style="width:${n.pct * 100}%"></i></div>
      <p class="peque">${n.xpEnNivel} de ${n.xpSiguiente} XP${n.siguiente ? ` para llegar a ${n.siguiente.emoji} ${esc(n.siguiente.nombre)}` : ''} · Total ${j.xp} XP</p>
    </section>
    <section class="tarjeta">
      <div class="stats tres">
        <div class="stat"><span>Racha</span><strong>🔥 ${r}</strong></div>
        <div class="stat"><span>Mejor racha</span><strong>${Math.max(j.rachaMax, r)}</strong></div>
        <div class="stat"><span>Comodines</span><strong>🛡️ ${j.comodines}</strong></div>
      </div>
      <p class="peque">Su racha suma un día cada vez que registra algo o confirma un día sin gastos. Cada 7 días gana un comodín (máximo 2): si un día se le olvida, el comodín cuida la racha solo.</p>
    </section>
    <section class="tarjeta">
      <div class="titulo-tarjeta"><h3>Retos de la semana</h3></div>
      ${progresoRetos().map(htmlReto).join('')}
    </section>
    <section class="tarjeta">
      <div class="titulo-tarjeta"><h3>Logros</h3><span class="peque">${desbloqueados} de ${LOGROS.length}</span></div>
      <div class="logros">${LOGROS.map(l => `<div class="logro ${j.logros[l.id] ? 'si' : 'no'}" data-tip="${esc(l.desc)}">
        <span class="logro-emoji">${j.logros[l.id] ? l.emoji : '🔒'}</span>
        <strong>${esc(l.nombre)}</strong><small>${esc(l.desc)}</small><span class="xp">+${l.xp} XP</span></div>`).join('')}</div>
    </section>
    <section class="tarjeta">
      <h3>Cómo se gana XP</h3>
      <ul class="lista-simple">
        <li>📝 Registrar un movimiento: +${XP.registro} XP (hasta ${XP.maxRegistrosDia} al día).</li>
        <li>⚡ Si lo anota el mismo día en que ocurrió: +${XP.alInstante} XP extra.</li>
        <li>🐷 Abonar a una meta o a una deuda: +${XP.ahorroODeuda} XP extra.</li>
        <li>🧘 Confirmar un día sin gastos: +${XP.sinGasto} XP.</li>
        <li>🎯 Retos semanales y logros: lo que diga cada uno.</li>
      </ul>
      <p class="peque">Aquí se premia el hábito, nunca el gasto. Gastar más no da puntos.</p>
    </section>
    ${j.historial.length ? `<section class="tarjeta"><h3>Actividad reciente</h3>
      ${j.historial.slice(0, 12).map(h => `<div class="fila peque historial"><span>${esc(h.motivo)}</span><span class="${h.xp < 0 ? 'estado-critico' : 'xp'}">${h.xp > 0 ? '+' : ''}${h.xp} XP</span></div>`).join('')}
    </section>` : ''}`;
}

/* =========================================================================
   Ajustes
   ========================================================================= */

function vistaAjustes() {
  const a = E.ajustes;
  const grupos = ['variable', 'fijo', 'inversion', 'ingreso'];
  return `<section class="tarjeta form">
      <h3>Perfil y presupuesto</h3>
      <label class="campo"><span>Nombre</span><input data-ajuste="nombre" value="${esc(a.nombre)}" placeholder="¿Cómo le digo?"></label>
      <label class="campo"><span>Presupuesto mensual del día a día</span><input data-ajuste="presupuestoMes" data-dinero inputmode="numeric" value="${a.presupuestoMes ? pesos(a.presupuestoMes) : ''}" placeholder="$0"><small>Mercado, comida, transporte, antojos. Sin facturas fijas.</small></label>
      <label class="campo"><span>Un gasto es "hormiga" si cuesta hasta</span><input data-ajuste="umbralHormiga" data-dinero inputmode="numeric" value="${pesos(a.umbralHormiga)}"></label>
      <div class="campo"><span>Reparto ideal (necesidades / gustos / ahorro)</span>
        <div class="tres-campos">
          <input data-ajuste="reparto.necesidad" type="number" min="0" max="100" value="${a.reparto.necesidad}" aria-label="Necesidades %">
          <input data-ajuste="reparto.gusto" type="number" min="0" max="100" value="${a.reparto.gusto}" aria-label="Gustos %">
          <input data-ajuste="reparto.ahorro" type="number" min="0" max="100" value="${a.reparto.ahorro}" aria-label="Ahorro %">
        </div>
        <small>Con ingresos bajos, empezar con 10% de ahorro constante ya es un gran paso.</small></div>
    </section>

    <section class="tarjeta">
      <div class="titulo-tarjeta"><h3>Categorías</h3><button class="btn mini" data-accion="nueva-categoria">+ Nueva</button></div>
      ${grupos.map(g => `<h4 class="subtitulo">${GRUPOS[g].nombre}</h4>
        <div class="chips envolver">${E.categorias.filter(c => c.grupo === g).map(c => `<button class="chip ${c.oculta ? 'apagado' : ''}" data-accion="editar-categoria" data-id="${c.id}">${c.emoji} ${esc(c.nombre)}${c.tipo50 === 'gusto' ? ' <small>gusto</small>' : ''}</button>`).join('')}</div>`).join('')}
    </section>

    <section class="tarjeta">
      <div class="titulo-tarjeta"><h3>Medios de pago</h3><button class="btn mini" data-accion="nuevo-metodo">+ Nuevo</button></div>
      <div class="chips envolver">${E.metodos.map(m => `<button class="chip ${m.oculto ? 'apagado' : ''}" data-accion="editar-metodo" data-id="${m.id}">${m.emoji} ${esc(m.nombre)}${m.gmf ? ' <small>4x1000</small>' : ''}</button>`).join('')}</div>
      <p class="peque">Marque con 4x1000 las cuentas bancarias que no tiene exentas. Solo se puede exentar una cuenta, hasta unos 350 UVT al mes.</p>
    </section>

    <section class="tarjeta form">
      <h3>Recordatorio diario</h3>
      <p class="peque">Un aviso en su calendario para anotar los gastos del día. Funciona en cualquier celular.</p>
      <div class="fila"><input type="time" id="hora-recordatorio" value="${esc(a.horaRecordatorio || '20:30')}" aria-label="Hora del recordatorio"><button class="btn secundario" data-accion="recordatorio">Agregar a mi calendario</button></div>
    </section>

    <section class="tarjeta">
      <h3>Sus datos</h3>
      <p class="peque">🔒 Todo vive en este dispositivo. ${a.ultimoRespaldo ? `Última copia: ${fechaLarga(a.ultimoRespaldo.slice(0, 10))}.` : 'Aún no ha guardado ninguna copia.'}</p>
      <div class="botonera">
        <button class="btn secundario" data-accion="respaldo">💾 Guardar copia</button>
        <button class="btn secundario" data-accion="restaurar">📂 Restaurar copia</button>
        <button class="btn secundario" data-accion="exportar-csv">📊 Exportar para Excel</button>
        ${PLANILLA ? '<button class="btn secundario" data-accion="importar-planilla">📥 Traer datos de la planilla</button>' : ''}
        <button class="btn peligro" data-accion="borrar-todo">Borrar todo</button>
      </div>
      <input type="file" id="archivo-respaldo" accept=".json,application/json" hidden>
    </section>
    <p class="peque centro">Finanzas · versión 1 · hecho para usted</p>`;
}

/* =========================================================================
   Hoja inferior (registro y formularios)
   ========================================================================= */

let tokenHoja = 0;

function abrirHoja(html, tipo) {
  tokenHoja++;
  if (tipo !== 'registro') R = null;
  const h = $('#hoja'), f = $('#fondo-hoja');
  h.innerHTML = html;
  h.dataset.tipo = tipo;
  h.hidden = false; f.hidden = false;
  requestAnimationFrame(() => { h.classList.add('abierta'); f.classList.add('visible'); });
  document.body.classList.add('con-hoja');
}

function cerrarHoja() {
  const t = ++tokenHoja, h = $('#hoja'), f = $('#fondo-hoja');
  h.classList.remove('abierta'); f.classList.remove('visible');
  document.body.classList.remove('con-hoja');
  R = null; FORM = null;
  setTimeout(() => { if (t === tokenHoja) { h.hidden = true; f.hidden = true; h.innerHTML = ''; } }, 230);
}

/* ---------- Registro rápido ---------- */

let R = null;

function abrirRegistro(pre = {}) {
  R = {
    tipo: 'gasto', monto: '', cat: null, metodo: E.ajustes.ultimoMetodo || 'efectivo', nota: '', fecha: hoy(),
    metaId: null, deudaId: null, facturaId: null, cuotas: 1, editId: null, verTodas: false, ...pre,
  };
  R.monto = R.monto ? String(Math.round(R.monto)) : '';
  if (R.tipo === 'ahorro' && !R.metaId && E.metas.length === 1) R.metaId = E.metas[0].id;
  abrirHoja(htmlRegistro(), 'registro');
}

function htmlRegistro() {
  const tipos = [['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['ahorro', 'Ahorro'], ['deuda', 'Deuda']];
  return `<div class="hoja-asa" data-accion="cerrar-hoja"></div>
  <div class="registro">
    <div class="r-cabeza">
      <div class="seg" role="group" aria-label="Tipo">${tipos.map(([v, t]) => `<button class="${R.tipo === v ? 'activo' : ''}" data-accion="r-tipo" data-v="${v}">${t}</button>`).join('')}</div>
      <div id="r-monto" class="r-monto ${R.monto ? '' : 'vacio'} ${R.tipo}" aria-live="polite">${pesos(Number(R.monto || 0))}</div>
    </div>
    <div class="r-cuerpo">
      ${htmlSelectorRegistro()}
      ${htmlExtrasRegistro()}
    </div>
    <div class="r-pie">
      <div class="teclado">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'borrar'].map(k =>
        `<button data-accion="tecla" data-k="${k}" ${k === 'borrar' ? `aria-label="Borrar">${ICONOS.borrar}` : `>${k}`}</button>`).join('')}</div>
      <div class="r-acciones">
        ${R.editId ? '<button class="btn peligro" data-accion="r-eliminar">Eliminar</button>' : '<button class="btn texto" data-accion="cerrar-hoja">Cancelar</button>'}
        <button class="btn primario grande" data-accion="r-guardar">${R.editId ? 'Guardar cambios' : 'Guardar'}</button>
      </div>
    </div>
  </div>`;
}

function htmlSelectorRegistro() {
  if (R.tipo === 'gasto' || R.tipo === 'ingreso') {
    const grupos = R.tipo === 'gasto' ? ['variable', 'fijo', 'inversion'] : ['ingreso'];
    let cats = categoriasOrdenadas(grupos);
    const limite = 11;
    let html;
    if (R.tipo === 'gasto' && !R.verTodas) {
      let visibles = cats.slice(0, limite);
      if (R.cat && !visibles.some(c => c.id === R.cat)) visibles = [categoria(R.cat), ...visibles.slice(0, limite - 1)];
      html = `<div class="cats">${visibles.map(btnCat).join('')}<button class="cat mas" data-accion="r-ver-todas"><span class="cat-emoji">⋯</span><span>Más</span></button></div>`;
    } else if (R.tipo === 'gasto') {
      html = ['variable', 'fijo', 'inversion'].map(g => `<h4 class="subtitulo">${GRUPOS[g].nombre}</h4><div class="cats">${cats.filter(c => c.grupo === g).map(btnCat).join('')}</div>`).join('');
    } else {
      html = `<div class="cats">${cats.map(btnCat).join('')}</div>`;
    }
    return html;
  }
  if (R.tipo === 'ahorro') {
    if (!E.metas.length) return `<div class="vacio-hoja"><p>Aún no tiene metas de ahorro.</p><button class="btn secundario" data-accion="nueva-meta">Crear una meta</button></div>`;
    return `<div class="opciones">${E.metas.map(m => `<button class="opcion ${R.metaId === m.id ? 'activo' : ''}" data-accion="r-meta" data-id="${m.id}">
      <span class="cat-emoji">${m.emoji}</span><span><strong>${esc(m.nombre)}</strong><small>${M(ahorradoMeta(m))}${m.objetivo ? ` de ${M(m.objetivo)}` : ''}</small></span></button>`).join('')}</div>`;
  }
  const activas = E.deudas.filter(d => saldoDeuda(d) > 0 || d.id === R.deudaId);
  if (!activas.length) return `<div class="vacio-hoja"><p>No tiene deudas pendientes. 🦅</p><button class="btn secundario" data-accion="nueva-deuda">Agregar una deuda</button></div>`;
  return `<div class="opciones">${ordenarDeudas(activas, E.ajustes.estrategiaDeuda).map(d => `<button class="opcion ${R.deudaId === d.id ? 'activo' : ''}" data-accion="r-deuda" data-id="${d.id}">
    <span class="cat-emoji">${d.emoji}</span><span><strong>${esc(d.nombre)}</strong><small>Saldo ${M(saldoDeuda(d))} · mínimo ${M(d.pagoMinimo || 0)}</small></span></button>`).join('')}</div>`;
}

function btnCat(c) {
  return `<button class="cat ${R.cat === c.id ? 'activo' : ''}" data-accion="r-cat" data-id="${c.id}"><span class="cat-emoji">${c.emoji}</span><span>${esc(c.nombre)}</span></button>`;
}

function htmlExtrasRegistro() {
  const metodos = E.metodos.filter(m => !m.oculto || m.id === R.metodo);
  const met = metodo(R.metodo);
  const h = hoy(), ayer = sumarDias(h, -1);
  const otra = R.fecha !== h && R.fecha !== ayer;
  const sugerencias = R.cat ? notasFrecuentes(R.cat) : [];
  return `<div class="r-extras">
    <div class="chips desliza" role="group" aria-label="${R.tipo === 'ingreso' ? 'Dónde lo recibió' : 'Medio de pago'}">${metodos.map(m =>
      `<button class="chip ${R.metodo === m.id ? 'activo' : ''}" data-accion="r-metodo" data-id="${m.id}">${m.emoji} ${esc(m.nombre)}</button>`).join('')}</div>
    ${met.credito && R.tipo === 'gasto' ? `<label class="campo en-linea"><span>Cuotas</span><select id="r-cuotas">${[1, 2, 3, 6, 12, 18, 24, 36].map(n => `<option value="${n}" ${R.cuotas == n ? 'selected' : ''}>${n}</option>`).join('')}</select><small>Ojo: algunas tarjetas cobran interés incluso a una cuota.</small></label>` : ''}
    <input id="r-nota" class="nota" placeholder="Nota (opcional): panadería, almuerzo…" value="${esc(R.nota)}" list="r-sugerencias" autocomplete="off" maxlength="60" enterkeyhint="done">
    <datalist id="r-sugerencias">${sugerencias.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    ${sugerencias.length ? `<div class="chips desliza">${sugerencias.slice(0, 5).map(s => `<button class="chip suave" data-accion="r-nota-sug" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
    <div class="chips" role="group" aria-label="Fecha">
      <button class="chip ${R.fecha === h ? 'activo' : ''}" data-accion="r-fecha" data-v="${h}">Hoy</button>
      <button class="chip ${R.fecha === ayer ? 'activo' : ''}" data-accion="r-fecha" data-v="${ayer}">Ayer</button>
      <label class="chip ${otra ? 'activo' : ''} chip-fecha">📅 ${otra ? fechaCorta(R.fecha) : 'Otra'}<input type="date" id="r-fecha-otra" max="${h}" value="${R.fecha}"></label>
    </div>
  </div>`;
}

function refrescarRegistro() {
  const cuerpo = $('#hoja .r-cuerpo');
  const scroll = cuerpo ? cuerpo.scrollTop : 0;
  $('#hoja').innerHTML = htmlRegistro();
  const nuevo = $('#hoja .r-cuerpo');
  if (nuevo) nuevo.scrollTop = scroll;
}

function teclear(k) {
  if (!R) return;
  if (k === 'borrar') R.monto = R.monto.slice(0, -1);
  else if ((R.monto + k).length <= 11) R.monto = (R.monto + k).replace(/^0+/, '');
  const el = $('#r-monto');
  if (el) { el.textContent = pesos(Number(R.monto || 0)); el.classList.toggle('vacio', !R.monto); }
  vibrar(5);
}

function guardarRegistro() {
  if (!R) return;
  const monto = Number(R.monto || 0);
  const nota = ($('#r-nota') ? $('#r-nota').value : R.nota).trim();
  if (!monto) return sacudir('Escriba el monto');
  if ((R.tipo === 'gasto' || R.tipo === 'ingreso') && !R.cat) return sacudir('Elija una categoría');
  if (R.tipo === 'ahorro' && !R.metaId) return sacudir('Elija la meta');
  if (R.tipo === 'deuda' && !R.deudaId) return sacudir('Elija la deuda');
  const datos = {
    tipo: R.tipo, monto, nota, fecha: R.fecha, metodo: R.metodo,
    cat: R.tipo === 'gasto' || R.tipo === 'ingreso' ? R.cat : null,
    metaId: R.tipo === 'ahorro' ? R.metaId : null,
    deudaId: R.tipo === 'deuda' ? R.deudaId : null,
    facturaId: R.tipo === 'gasto' ? R.facturaId : null,
    cuotas: R.tipo === 'gasto' && metodo(R.metodo).credito ? Number(R.cuotas) : null,
  };
  E.ajustes.ultimoMetodo = R.metodo;
  if (R.editId) {
    const m = E.movimientos.find(x => x.id === R.editId);
    if (m) { Object.assign(m, datos); alEditar(m); }
    guardar(); cerrarHoja(); render();
    avisar('Cambios guardados');
    mostrarCelebraciones();
    return;
  }
  const m = { id: nuevoId(), ...datos, creado: new Date().toISOString(), creadoDia: hoy() };
  E.movimientos.push(m);
  const res = alRegistrar(m);
  guardar(); cerrarHoja(); render();
  let msg = `✔ Guardado${res.xp > 0 ? ` · +${res.xp} XP` : ''}`;
  if (res.quitado) msg = `✔ Guardado. Ese día ya no cuenta como "sin gastos".`;
  const alerta = alertaPresupuesto(m);
  avisar(alerta ? `${msg}<br><small>${alerta}</small>` : msg);
  vibrar(15);
  mostrarCelebraciones();
  if (m.tipo === 'ingreso' && E.metas.some(x => x.porcentaje > 0)) setTimeout(() => sugerirPagatePrimero(m), 350);
}

// Aviso suave cuando una categoría se acerca a su tope (sin regaños).
function alertaPresupuesto(m) {
  if (m.tipo !== 'gasto') return '';
  const mes = mesDe(m.fecha);
  const tope = E.presupuestos[m.cat];
  if (tope) {
    const g = suma(movsDelMes(mes).filter(x => x.tipo === 'gasto' && x.cat === m.cat));
    const antes = g - m.monto;
    if (antes < tope && g >= tope) return `${categoria(m.cat).emoji} ${esc(categoria(m.cat).nombre)} llegó al tope del mes. Puede mover plata de otra categoría.`;
    if (antes < tope * 0.85 && g >= tope * 0.85) return `${categoria(m.cat).emoji} ${esc(categoria(m.cat).nombre)} va en el ${Math.round(g / tope * 100)}% de su tope.`;
  }
  if (mes === mesActual() && esDiaADia(m)) {
    const d = disponibleHoy();
    if (d && d.disponible < 0 && d.disponible + m.monto >= 0) return 'Hoy ya usó el cupo del día. Mañana se recalcula.';
  }
  return '';
}

function sacudir(texto) {
  const h = $('#hoja .registro');
  if (h) { h.classList.remove('sacude'); void h.offsetWidth; h.classList.add('sacude'); }
  avisar(`✋ ${texto}`);
  vibrar([20, 40, 20]);
}

/* ---------- Págate primero ---------- */

function sugerirPagatePrimero(ingreso) {
  const metas = E.metas.filter(m => m.porcentaje > 0);
  abrirHoja(`<div class="hoja-asa" data-accion="cerrar-hoja"></div>
    <div class="hoja-contenido">
      <h2 class="hoja-titulo">💰 ¡Entró plata! Págate primero</h2>
      <p>Antes de gastar, separe para sus metas. Lo que se aparta primero, no se gasta.</p>
      <form id="form-pp" class="form">
        ${metas.map(m => `<label class="fila-check"><input type="checkbox" name="${m.id}" checked>
          <span>${m.emoji} ${esc(m.nombre)} <small>${m.porcentaje}%</small></span><strong>${M(redondear(ingreso.monto * m.porcentaje / 100, 100))}</strong></label>`).join('')}
        <div class="form-acciones">
          <button type="button" class="btn texto" data-accion="cerrar-hoja">Ahora no</button>
          <button type="submit" class="btn primario">Separar ahora</button>
        </div>
      </form>
    </div>`, 'pagate');
  $('#form-pp').dataset.ingreso = ingreso.id;
}

function separarPagatePrimero(form) {
  const ingreso = E.movimientos.find(m => m.id === form.dataset.ingreso);
  if (!ingreso) return cerrarHoja();
  let total = 0, xp = 0;
  for (const m of E.metas.filter(x => x.porcentaje > 0)) {
    if (!form.elements[m.id] || !form.elements[m.id].checked) continue;
    const monto = redondear(ingreso.monto * m.porcentaje / 100, 100);
    if (!monto) continue;
    const mov = { id: nuevoId(), tipo: 'ahorro', monto, nota: 'Págate primero', fecha: ingreso.fecha, metodo: ingreso.metodo, cat: null, metaId: m.id, creado: new Date().toISOString(), creadoDia: hoy() };
    E.movimientos.push(mov);
    xp += alRegistrar(mov).xp;
    total += monto;
  }
  guardar(); cerrarHoja(); render();
  if (total) avisar(`🐷 Separó ${pesos(total)} para sus metas · +${xp} XP`);
  mostrarCelebraciones();
}

/* ---------- Formularios genéricos ---------- */

let FORM = null;

function abrirFormulario(cfg) {
  FORM = cfg;
  abrirHoja(`<div class="hoja-asa" data-accion="cerrar-hoja"></div>
    <div class="hoja-contenido">
      <h2 class="hoja-titulo">${cfg.titulo}</h2>
      ${cfg.intro ? `<p class="peque">${cfg.intro}</p>` : ''}
      <form id="form-hoja" class="form" novalidate>
        ${cfg.campos.map(campoHTML).join('')}
        <div class="form-acciones">
          ${cfg.onEliminar ? `<button type="button" class="btn peligro" data-accion="form-eliminar">${cfg.textoEliminar || 'Eliminar'}</button>` : '<button type="button" class="btn texto" data-accion="cerrar-hoja">Cancelar</button>'}
          <button type="submit" class="btn primario">${cfg.boton || 'Guardar'}</button>
        </div>
      </form>
    </div>`, 'form');
  const primero = $('#form-hoja input:not([type=checkbox]), #form-hoja select');
  if (primero && !matchMedia('(pointer: coarse)').matches) primero.focus();
}

function campoHTML(c) {
  const id = `f-${c.id}`, v = c.valor ?? '';
  const ayuda = c.ayuda ? `<small>${c.ayuda}</small>` : '';
  switch (c.tipo) {
    case 'dinero': return `<label class="campo"><span>${c.label}</span><input id="${id}" name="${c.id}" inputmode="numeric" autocomplete="off" data-dinero value="${v !== '' && v !== null ? pesos(v) : ''}" placeholder="$0">${ayuda}</label>`;
    case 'numero': return `<label class="campo"><span>${c.label}</span><input id="${id}" name="${c.id}" type="number" inputmode="decimal" step="${c.paso || 'any'}" min="${c.min ?? ''}" max="${c.max ?? ''}" value="${esc(v)}">${ayuda}</label>`;
    case 'select': return `<label class="campo"><span>${c.label}</span><select id="${id}" name="${c.id}">${c.opciones.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(v) ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select>${ayuda}</label>`;
    case 'check': return `<label class="fila-check"><input type="checkbox" id="${id}" name="${c.id}" ${v ? 'checked' : ''}><span>${c.label}${ayuda}</span></label>`;
    case 'fecha': return `<label class="campo"><span>${c.label}</span><input id="${id}" name="${c.id}" type="date" value="${esc(v)}">${ayuda}</label>`;
    case 'mes': return `<label class="campo"><span>${c.label}</span><input id="${id}" name="${c.id}" type="month" value="${esc(v)}">${ayuda}</label>`;
    case 'texto':
    default: return `<label class="campo"><span>${c.label}</span><input id="${id}" name="${c.id}" value="${esc(v)}" maxlength="${c.max || 40}" placeholder="${esc(c.placeholder || '')}" autocomplete="off">${ayuda}</label>`;
  }
}

function leerDinero(txt) { return Number(String(txt || '').replace(/[^\d]/g, '')) || 0; }

function enviarFormulario() {
  if (!FORM) return;
  const form = $('#form-hoja'), vals = {};
  for (const c of FORM.campos) {
    const el = form.elements[c.id];
    if (!el) continue;
    vals[c.id] = c.tipo === 'dinero' ? leerDinero(el.value) : c.tipo === 'numero' ? (el.value === '' ? 0 : Number(el.value)) : c.tipo === 'check' ? el.checked : el.value.trim();
  }
  const error = FORM.onGuardar(vals);
  if (error) return avisar(`✋ ${error}`);
  guardar(); cerrarHoja(); render();
  setTimeout(mostrarCelebraciones, 250);
}

/* ---------- Formularios concretos ---------- */

function formPresupuesto() {
  const sug = sugerenciaPresupuesto();
  abrirFormulario({
    titulo: 'Presupuesto del día a día',
    intro: 'Cuánto quiere gastar al mes en mercado, comida, transporte y antojos. Las facturas fijas van aparte.',
    campos: [{ id: 'p', tipo: 'dinero', label: 'Tope mensual', valor: E.ajustes.presupuestoMes || sug || '', ayuda: sug ? `Sus últimos meses: unos ${pesosCorto(sug)} en promedio.` : '' }],
    onGuardar: v => { E.ajustes.presupuestoMes = v.p; avisar('Presupuesto actualizado'); },
  });
}

function formTopes() {
  const cats = E.categorias.filter(c => ['variable', 'fijo'].includes(c.grupo) && !c.oculta);
  const tresMeses = [1, 2, 3].map(i => sumarMeses(mesActual(), -i));
  const prom = id => suma(E.movimientos.filter(m => m.cat === id && tresMeses.includes(mesDe(m.fecha)))) / 3;
  abrirFormulario({
    titulo: 'Topes por categoría',
    intro: 'Deje en blanco las que no quiera controlar. Debajo ve su promedio de los últimos 3 meses.',
    campos: cats.map(c => ({ id: c.id, tipo: 'dinero', label: `${c.emoji} ${esc(c.nombre)}`, valor: E.presupuestos[c.id] || '', ayuda: prom(c.id) ? `Promedio: ${pesos(redondear(prom(c.id), 1000))}` : '' })),
    onGuardar: v => {
      for (const [k, val] of Object.entries(v)) { if (val > 0) E.presupuestos[k] = val; else delete E.presupuestos[k]; }
      revisarLogros();
    },
  });
}

function formFactura(f) {
  const nueva = !f;
  f = f || { id: nuevoId(), nombre: '', cat: 'servicios', monto: 0, dia: 1, periodo: 1, mesInicio: mesActual(), activa: true };
  abrirFormulario({
    titulo: nueva ? 'Nueva factura fija' : 'Editar factura',
    campos: [
      { id: 'nombre', tipo: 'texto', label: 'Nombre', valor: f.nombre, placeholder: 'Arriendo, luz, Netflix…' },
      { id: 'cat', tipo: 'select', label: 'Categoría', valor: f.cat, opciones: E.categorias.filter(c => c.grupo === 'fijo' || c.grupo === 'variable').map(c => ({ v: c.id, t: `${c.emoji} ${c.nombre}` })) },
      { id: 'monto', tipo: 'dinero', label: 'Valor aproximado', valor: f.monto },
      { id: 'dia', tipo: 'numero', label: 'Día del mes en que vence', valor: f.dia, min: 1, max: 31, paso: 1 },
      { id: 'periodo', tipo: 'select', label: 'Cada cuánto', valor: f.periodo || 1, opciones: [{ v: 1, t: 'Cada mes' }, { v: 2, t: 'Cada 2 meses (ej. agua)' }, { v: 3, t: 'Cada 3 meses' }, { v: 6, t: 'Cada 6 meses' }, { v: 12, t: 'Una vez al año (ej. SOAT)' }] },
      { id: 'mesInicio', tipo: 'mes', label: 'Mes del próximo cobro (si no es mensual)', valor: f.mesInicio || mesActual() },
    ],
    onEliminar: nueva ? null : () => { f.activa = false; },
    textoEliminar: 'Quitar',
    onGuardar: v => {
      if (!v.nombre) return 'Póngale un nombre';
      Object.assign(f, { nombre: v.nombre, cat: v.cat, monto: v.monto, dia: Math.min(31, Math.max(1, Math.round(v.dia) || 1)), periodo: Number(v.periodo), mesInicio: v.mesInicio || mesActual() });
      if (nueva) E.facturas.push(f);
    },
  });
}

function formMeta(m) {
  const nueva = !m;
  m = m || { id: nuevoId(), nombre: '', emoji: '🎯', objetivo: 0, inicial: 0, porcentaje: 0, fechaLimite: '' };
  const ahorrado = nueva ? 0 : ahorradoMeta(m);
  abrirFormulario({
    titulo: nueva ? 'Nueva meta de ahorro' : 'Editar meta',
    campos: [
      { id: 'emoji', tipo: 'texto', label: 'Emoji', valor: m.emoji, max: 8 },
      { id: 'nombre', tipo: 'texto', label: 'Nombre', valor: m.nombre, placeholder: 'Fondo de emergencia, viaje, moto…' },
      { id: 'objetivo', tipo: 'dinero', label: 'Meta (cuánto quiere juntar)', valor: m.objetivo || '', ayuda: 'Para un fondo de emergencia, lo usual es de 3 a 6 meses de gastos.' },
      { id: 'ahorrado', tipo: 'dinero', label: 'Lo que ya tiene ahorrado', valor: ahorrado || '' },
      { id: 'porcentaje', tipo: 'numero', label: 'Págate primero: % de cada ingreso', valor: m.porcentaje || 0, min: 0, max: 100, paso: 1 },
      { id: 'fechaLimite', tipo: 'fecha', label: 'Fecha para lograrla (opcional)', valor: m.fechaLimite },
    ],
    onEliminar: nueva ? null : () => {
      if (!confirm('¿Eliminar esta meta? Los abonos quedan en el historial como movimientos.')) return 'cancelado';
      E.metas = E.metas.filter(x => x.id !== m.id);
    },
    onGuardar: v => {
      if (!v.nombre) return 'Póngale un nombre';
      const aportes = nueva ? 0 : ahorradoMeta(m) - (m.inicial || 0);
      Object.assign(m, { emoji: v.emoji || '🎯', nombre: v.nombre, objetivo: v.objetivo, porcentaje: Math.max(0, Math.min(100, v.porcentaje)), fechaLimite: v.fechaLimite, inicial: Math.max(0, v.ahorrado - aportes) });
      if (nueva) E.metas.push(m);
      revisarLogros();
    },
  });
}

function formDeuda(d) {
  const nueva = !d;
  d = d || { id: nuevoId(), nombre: '', emoji: '💳', montoOriginal: 0, saldoInicial: 0, tasaEA: 0, pagoMinimo: 0, diaPago: 0, persona: false };
  abrirFormulario({
    titulo: nueva ? 'Nueva deuda' : 'Editar deuda',
    intro: d.nota ? esc(d.nota) : '',
    campos: [
      { id: 'emoji', tipo: 'texto', label: 'Emoji', valor: d.emoji, max: 8 },
      { id: 'nombre', tipo: 'texto', label: 'Nombre', valor: d.nombre, placeholder: 'Tarjeta Visa, préstamo de…' },
      { id: 'saldo', tipo: 'dinero', label: 'Saldo de hoy', valor: nueva ? '' : saldoDeuda(d), ayuda: 'Tómelo del extracto o de la app del banco.' },
      { id: 'montoOriginal', tipo: 'dinero', label: 'Monto original (para ver el avance)', valor: d.montoOriginal || '' },
      { id: 'tasaEA', tipo: 'numero', label: 'Tasa de interés efectiva anual (%)', valor: d.tasaEA || 0, min: 0, max: 100, paso: 0.01, ayuda: 'Préstamos de familia suelen ser 0%. La usura de noviembre de 2026 es 28,34% E.A.' },
      { id: 'pagoMinimo', tipo: 'dinero', label: 'Pago mínimo mensual', valor: d.pagoMinimo || '' },
      { id: 'diaPago', tipo: 'numero', label: 'Día de pago', valor: d.diaPago || '', min: 1, max: 31, paso: 1 },
    ],
    onEliminar: nueva ? null : () => {
      if (!confirm('¿Eliminar esta deuda? Los abonos quedan como movimientos.')) return 'cancelado';
      E.deudas = E.deudas.filter(x => x.id !== d.id);
    },
    onGuardar: v => {
      if (!v.nombre) return 'Póngale un nombre';
      const pagado = nueva ? 0 : pagadoDeuda(d);
      Object.assign(d, {
        emoji: v.emoji || '💳', nombre: v.nombre, tasaEA: v.tasaEA, pagoMinimo: v.pagoMinimo, diaPago: v.diaPago,
        saldoInicial: v.saldo + pagado, montoOriginal: Math.max(v.montoOriginal, v.saldo + pagado), persona: !v.tasaEA,
      });
      delete d.nota;
      if (nueva) E.deudas.push(d);
      revisarLogros();
    },
  });
}

function formPagoDeudas() {
  const minimos = E.deudas.filter(d => saldoDeuda(d) > 0).reduce((t, d) => t + (d.pagoMinimo || 0), 0);
  abrirFormulario({
    titulo: 'Pago mensual a deudas',
    intro: `Cuánto destina cada mes a todas sus deudas. La suma de mínimos es ${pesos(minimos)}; lo que ponga por encima va a la deuda prioritaria.`,
    campos: [{ id: 'p', tipo: 'dinero', label: 'Total al mes', valor: E.ajustes.pagoDeudaMensual || minimos }],
    onGuardar: v => { E.ajustes.pagoDeudaMensual = v.p; },
  });
}

function formCategoria(c) {
  const nueva = !c;
  c = c || { id: 'c-' + nuevoId(), nombre: '', emoji: '🏷️', grupo: 'variable', tipo50: 'gusto', oculta: false };
  abrirFormulario({
    titulo: nueva ? 'Nueva categoría' : 'Editar categoría',
    campos: [
      { id: 'emoji', tipo: 'texto', label: 'Emoji', valor: c.emoji, max: 8 },
      { id: 'nombre', tipo: 'texto', label: 'Nombre', valor: c.nombre },
      { id: 'grupo', tipo: 'select', label: 'Grupo', valor: c.grupo, opciones: Object.entries(GRUPOS).map(([k, g]) => ({ v: k, t: g.nombre })) },
      { id: 'tipo50', tipo: 'select', label: 'Para el reparto 50/30/20', valor: c.tipo50 || 'gusto', opciones: [{ v: 'necesidad', t: 'Necesidad' }, { v: 'gusto', t: 'Gusto' }, { v: 'inversion', t: 'Inversión' }] },
      { id: 'oculta', tipo: 'check', label: 'Ocultar del registro rápido', valor: c.oculta },
    ],
    onGuardar: v => {
      if (!v.nombre) return 'Póngale un nombre';
      Object.assign(c, { emoji: v.emoji || '🏷️', nombre: v.nombre, grupo: v.grupo, tipo50: v.grupo === 'ingreso' ? null : v.tipo50, oculta: v.oculta });
      if (nueva) E.categorias.push(c);
    },
  });
}

function formMetodo(m) {
  const nuevo = !m;
  m = m || { id: 'm-' + nuevoId(), nombre: '', emoji: '💳', gmf: false, credito: false, oculto: false };
  abrirFormulario({
    titulo: nuevo ? 'Nuevo medio de pago' : 'Editar medio de pago',
    campos: [
      { id: 'emoji', tipo: 'texto', label: 'Emoji', valor: m.emoji, max: 8 },
      { id: 'nombre', tipo: 'texto', label: 'Nombre', valor: m.nombre, placeholder: 'Ahorros Bancolombia, Nu…' },
      { id: 'gmf', tipo: 'check', label: 'Cobra 4x1000 (cuenta no exenta)', valor: m.gmf },
      { id: 'credito', tipo: 'check', label: 'Es tarjeta de crédito (pregunta cuotas)', valor: m.credito },
      { id: 'oculto', tipo: 'check', label: 'Ocultar del registro', valor: m.oculto },
    ],
    onGuardar: v => {
      if (!v.nombre) return 'Póngale un nombre';
      Object.assign(m, { emoji: v.emoji || '💳', nombre: v.nombre, gmf: v.gmf, credito: v.credito, oculto: v.oculto });
      if (nuevo) E.metodos.push(m);
    },
  });
}

/* =========================================================================
   Avisos, celebraciones y efectos
   ========================================================================= */

function avisar(html, accion) {
  const div = document.createElement('div');
  div.className = 'aviso';
  div.innerHTML = `<span>${html}</span>${accion ? `<button>${esc(accion.texto)}</button>` : ''}`;
  if (accion) div.querySelector('button').onclick = () => { accion.fn(); div.remove(); };
  $('#avisos').append(div);
  const dura = accion ? 5500 : 2800;
  setTimeout(() => div.classList.add('fuera'), dura);
  setTimeout(() => div.remove(), dura + 400);
}

function vibrar(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* sin vibración */ } }

function mostrarCelebraciones() {
  let i = 0;
  while (colaCelebraciones.length) {
    const c = colaCelebraciones.shift(), retraso = i++ * 900;
    setTimeout(() => {
      if (c.tipo === 'nivel') celebrarNivel(c);
      else if (c.tipo === 'logro') { avisar(`🏅 Logro: ${c.emoji} <strong>${esc(c.nombre)}</strong> · +${c.xp} XP`); if (c.xp >= 100) confeti(60); }
      else if (c.tipo === 'reto') { avisar(`🎯 Reto cumplido · +${c.xp} XP`); confeti(40); }
      else if (c.tipo === 'comodin') avisar('🛡️ ¡Ganó un comodín! Cuida su racha si un día se le olvida anotar.');
    }, retraso);
  }
}

function celebrarNivel(n) {
  const el = $('#celebra');
  el.innerHTML = `<div class="celebra-caja" role="dialog" aria-modal="true" aria-label="Subió de nivel">
    <div class="celebra-emoji">${n.emoji}</div>
    <p class="etiqueta">¡Subió de nivel!</p>
    <h2>Nivel ${n.nivel}</h2>
    <p class="lead">${esc(n.nombre)}</p>
    <button class="btn primario grande" data-accion="cerrar-celebra">¡Vamos!</button>
  </div>`;
  el.hidden = false;
  confeti(160);
  vibrar([30, 40, 30]);
}

function confeti(cantidad = 100) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#confeti'), ctx = cv.getContext('2d');
  cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const colores = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6'];
  const ps = Array.from({ length: cantidad }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 9 - 3, r: Math.random() * 5 + 3,
    c: colores[Math.floor(Math.random() * colores.length)], g: Math.random() * Math.PI, vg: (Math.random() - 0.5) * 0.3,
  }));
  const inicio = performance.now();
  cv.hidden = false;
  (function cuadro(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of ps) {
      p.vy += 0.22; p.x += p.vx; p.y += p.vy; p.g += p.vg;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.g); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
    }
    if (t - inicio < 2600) requestAnimationFrame(cuadro);
    else { ctx.clearRect(0, 0, innerWidth, innerHeight); cv.hidden = true; ctx.setTransform(1, 0, 0, 1, 0, 0); }
  })(inicio);
}

/* ---------- Tooltip de gráficos ---------- */

function mostrarTip(el, x, y) {
  const tip = $('#tip');
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  const w = tip.offsetWidth;
  tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, x - w / 2))}px`;
  tip.style.top = `${Math.max(8, y - 44)}px`;
}
function ocultarTip() { $('#tip').hidden = true; }

/* =========================================================================
   Archivos: respaldo, CSV, recordatorio
   ========================================================================= */

function descargar(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const archivo = typeof File === 'function' ? new File([blob], nombre, { type: tipo }) : null;
  if (archivo && navigator.canShare && navigator.canShare({ files: [archivo] }) && matchMedia('(pointer: coarse)').matches) {
    navigator.share({ files: [archivo], title: nombre }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function guardarRespaldo() {
  E.ajustes.ultimoRespaldo = new Date().toISOString();
  descargar(`finanzas-copia-${hoy()}.json`, respaldoJSON(), 'application/json');
  revisarLogros(); guardar(); render();
  avisar('💾 Copia guardada. Guárdela en Drive o en su correo.');
  mostrarCelebraciones();
}

function restaurarDesde(archivo) {
  const lector = new FileReader();
  lector.onload = () => {
    try {
      const obj = JSON.parse(lector.result);
      if (obj.tipo === 'finanzas-respaldo' && obj.datos) {
        if (!confirm('Esto reemplaza todos los datos actuales por los de la copia. ¿Continuar?')) return;
        E = migrar(obj.datos); guardar(); aplicarPreferencias(); render();
        avisar(`✔ Copia restaurada: ${plural(E.movimientos.length, 'movimiento', 'movimientos')}.`);
      } else if (obj.tipo === 'finanzas-planilla') {
        importarPlanilla(obj);
      } else avisar('✋ Ese archivo no es una copia de Finanzas.');
    } catch { avisar('✋ No se pudo leer el archivo.'); }
  };
  lector.readAsText(archivo);
}

function importarPlanilla(obj = PLANILLA) {
  if (!obj) return;
  const r = unirImportacion(obj);
  revisarTodo(); guardar(); render();
  avisar(r.movimientos || r.deudas || r.metas || r.facturas
    ? `📥 Listo: ${plural(r.movimientos, 'movimiento', 'movimientos')}, ${plural(r.facturas, 'factura', 'facturas')}, ${plural(r.metas, 'meta', 'metas')} y ${plural(r.deudas, 'deuda', 'deudas')}.`
    : 'Esos datos ya estaban en la app.');
  if (E.ajustes.onboarding) mostrarCelebraciones(); // en la bienvenida se guardan para después
}

function descargarRecordatorio(hora) {
  const [hh, mm] = (hora || '20:30').split(':');
  const f = hoy().replace(/-/g, '');
  const sello = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Finanzas//ES', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:finanzas-recordatorio-${Date.now()}@finanzas.local`, `DTSTAMP:${sello}`, `DTSTART:${f}T${hh}${mm}00`, 'DURATION:PT5M',
    'RRULE:FREQ=DAILY', 'SUMMARY:🐷 Anotar los gastos de hoy',
    'DESCRIPTION:Abra Finanzas y anote lo que gastó hoy. Toma menos de un minuto.',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Anotar gastos', 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  descargar('recordatorio-finanzas.ics', ics, 'text/calendar');
}

/* =========================================================================
   Acciones (delegación de eventos)
   ========================================================================= */

const ACCIONES = {
  registrar: () => abrirRegistro(),
  volver: () => { if (history.length > 1) history.back(); else location.hash = '#/inicio'; },
  ocultar: () => { E.ajustes.ocultarMontos = !E.ajustes.ocultarMontos; guardar(); aplicarPreferencias(); pintarBarra(UI.ruta); },
  'cerrar-hoja': () => cerrarHoja(),
  'cerrar-celebra': () => { $('#celebra').hidden = true; },

  'b-empezar': () => {
    E.ajustes.nombre = $('#b-nombre').value.trim();
    E.ajustes.presupuestoMes = leerDinero($('#b-presupuesto').value);
    E.ajustes.onboarding = true;
    guardar(); render();
    setTimeout(() => avisar('¡Bienvenido! Toque <strong>+</strong> para registrar su primer gasto.'), 300);
    setTimeout(mostrarCelebraciones, 1200);
  },
  'importar-planilla': () => {
    const nombre = $('#b-nombre'), pres = $('#b-presupuesto');
    if (nombre) E.ajustes.nombre = nombre.value.trim();
    if (pres && leerDinero(pres.value)) E.ajustes.presupuestoMes = leerDinero(pres.value);
    importarPlanilla();
  },

  // Registro
  atajo: el => abrirRegistro({ cat: el.dataset.cat, nota: el.dataset.nota || '', monto: Number(el.dataset.monto) || '', metodo: el.dataset.metodo || E.ajustes.ultimoMetodo }),
  tecla: el => teclear(el.dataset.k),
  'r-tipo': el => { R.tipo = el.dataset.v; R.cat = null; R.verTodas = false; R.nota = $('#r-nota') ? $('#r-nota').value : R.nota; refrescarRegistro(); },
  'r-cat': el => { R.cat = el.dataset.id; R.nota = $('#r-nota') ? $('#r-nota').value : R.nota; refrescarRegistro(); },
  'r-ver-todas': () => { R.verTodas = true; R.nota = $('#r-nota').value; refrescarRegistro(); },
  'r-meta': el => { R.metaId = el.dataset.id; R.nota = $('#r-nota').value; refrescarRegistro(); },
  'r-deuda': el => {
    R.deudaId = el.dataset.id; R.nota = $('#r-nota').value;
    const d = deuda(R.deudaId);
    if (!R.monto && d && d.pagoMinimo) R.monto = String(Math.min(d.pagoMinimo, saldoDeuda(d)));
    refrescarRegistro();
  },
  'r-metodo': el => { R.metodo = el.dataset.id; R.nota = $('#r-nota').value; refrescarRegistro(); },
  'r-fecha': el => { R.fecha = el.dataset.v; R.nota = $('#r-nota').value; refrescarRegistro(); },
  'r-nota-sug': el => { R.nota = el.dataset.v; $('#r-nota').value = R.nota; },
  'r-guardar': () => guardarRegistro(),
  'r-eliminar': () => {
    const id = R.editId, i = E.movimientos.findIndex(m => m.id === id);
    if (i < 0) return;
    const [m] = E.movimientos.splice(i, 1);
    guardar(); cerrarHoja(); render();
    avisar('Movimiento eliminado', { texto: 'Deshacer', fn: () => { E.movimientos.push(m); guardar(); render(); } });
  },
  'editar-mov': el => {
    const m = E.movimientos.find(x => x.id === el.dataset.id);
    if (!m) return;
    abrirRegistro({ ...m, editId: m.id, metodo: m.metodo || E.ajustes.ultimoMetodo, nota: m.nota || '', cuotas: m.cuotas || 1, verTodas: true });
  },

  // Inicio
  'sin-gasto': el => {
    const r = declararSinGasto(el.dataset.fecha);
    if (r.error) return avisar(`✋ ${r.error}`);
    guardar(); render();
    avisar(`🧘 ¡Día sin gastos! · +${r.xp} XP`);
    mostrarCelebraciones();
  },
  'pagar-factura': el => {
    const f = E.facturas.find(x => x.id === el.dataset.id);
    if (f) abrirRegistro({ tipo: 'gasto', cat: f.cat, monto: f.monto, nota: f.nombre, facturaId: f.id, verTodas: true });
  },

  // Movimientos y análisis
  mes: el => { const k = el.dataset.clave; UI[k] = sumarMeses(UI[k], Number(el.dataset.paso)); render(); },
  'filtro-mov': el => { UI.filtroMov = el.dataset.v; render(); },
  'quitar-cat': () => { UI.catMov = null; render(); },
  'ver-cat': el => { if (!el.dataset.cat) return; UI.catMov = el.dataset.cat; UI.mesMov = UI.mesAnalisis; UI.filtroMov = 'todos'; location.hash = '#/movimientos'; },

  // Plan
  ancla: el => { const s = document.getElementById(el.dataset.id); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  'editar-presupuesto': () => formPresupuesto(),
  'topes-categoria': () => formTopes(),
  'nueva-factura': () => formFactura(),
  'editar-factura': el => formFactura(E.facturas.find(f => f.id === el.dataset.id)),
  'nueva-meta': () => formMeta(),
  'editar-meta': el => formMeta(meta(el.dataset.id)),
  'abonar-meta': el => abrirRegistro({ tipo: 'ahorro', metaId: el.dataset.id }),
  'nueva-deuda': () => formDeuda(),
  'editar-deuda': el => formDeuda(deuda(el.dataset.id)),
  'abonar-deuda': el => { const d = deuda(el.dataset.id); abrirRegistro({ tipo: 'deuda', deudaId: d.id, monto: Math.min(d.pagoMinimo || 0, saldoDeuda(d)) || '' }); },
  estrategia: el => { E.ajustes.estrategiaDeuda = el.dataset.v; guardar(); render(); },
  'pago-deudas': () => formPagoDeudas(),
  'form-eliminar': () => {
    if (!FORM || !FORM.onEliminar) return;
    if (FORM.onEliminar() === 'cancelado') return;
    guardar(); cerrarHoja(); render();
  },

  // Ajustes
  'nueva-categoria': () => formCategoria(),
  'editar-categoria': el => formCategoria(E.categorias.find(c => c.id === el.dataset.id)),
  'nuevo-metodo': () => formMetodo(),
  'editar-metodo': el => formMetodo(E.metodos.find(m => m.id === el.dataset.id)),
  recordatorio: () => {
    const hora = $('#hora-recordatorio').value || '20:30';
    E.ajustes.horaRecordatorio = hora; guardar();
    descargarRecordatorio(hora);
    avisar('📅 Abra el archivo para agregar el recordatorio a su calendario.');
  },
  respaldo: () => guardarRespaldo(),
  restaurar: () => {
    const nombre = $('#b-nombre'), pres = $('#b-presupuesto');
    if (nombre) E.ajustes.nombre = nombre.value.trim();
    if (pres && leerDinero(pres.value)) E.ajustes.presupuestoMes = leerDinero(pres.value);
    $('#archivo-respaldo').click();
  },
  'exportar-csv': () => { descargar(`finanzas-movimientos-${hoy()}.csv`, exportarCSV(), 'text/csv;charset=utf-8'); avisar('📊 Archivo listo. Se abre con Excel o Google Sheets.'); },
  'borrar-todo': () => {
    if (!confirm('¿Borrar TODOS los datos de este dispositivo? Esto no se puede deshacer. Le recomendamos guardar una copia primero.')) return;
    if (!confirm('¿Está completamente seguro?')) return;
    localStorage.removeItem(CLAVE_ALMACEN);
    cargar(); aplicarPreferencias(); location.hash = '#/inicio'; render();
    avisar('Datos borrados.');
  },
};

document.addEventListener('click', e => {
  const a = e.target.closest('[data-accion]');
  if (a && !a.disabled) {
    const fn = ACCIONES[a.dataset.accion];
    if (fn) { e.preventDefault(); fn(a, e); return; }
  }
  const ir = e.target.closest('[data-ir]');
  if (ir) { location.hash = `#/${ir.dataset.ir}`; return; }
  if (e.target.id === 'fondo-hoja') cerrarHoja();
  if (e.target.id === 'celebra') $('#celebra').hidden = true;
});

document.addEventListener('keydown', e => {
  const enCampo = e.target.closest('input, textarea, select');
  if (e.key === 'Escape') { if (!$('#celebra').hidden) $('#celebra').hidden = true; else if (!$('#hoja').hidden) cerrarHoja(); return; }
  if (R && !enCampo) {
    if (/^[0-9]$/.test(e.key)) { teclear(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { teclear('borrar'); e.preventDefault(); }
    else if (e.key === 'Enter') { guardarRegistro(); e.preventDefault(); }
    return;
  }
  if (R && e.target.id === 'r-nota' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); return; }
  if (!enCampo && $('#hoja').hidden && E.ajustes.onboarding && (e.key === '+' || e.key === 'n')) { e.preventDefault(); abrirRegistro(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-ir][role=link]')) { e.preventDefault(); location.hash = `#/${e.target.dataset.ir}`; }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.matches('[data-dinero]')) {
    const n = leerDinero(t.value);
    t.value = n ? pesos(n) : '';
  }
  if (t.id === 'buscar') { UI.busqueda = t.value; $('#lista-movs').innerHTML = htmlListaMovs(); }
  if (t.id === 'r-nota' && R) R.nota = t.value;
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'r-fecha-otra' && R && t.value) { R.fecha = t.value > hoy() ? hoy() : t.value; R.nota = $('#r-nota').value; refrescarRegistro(); }
  if (t.id === 'r-cuotas' && R) R.cuotas = Number(t.value);
  if (t.id === 'archivo-respaldo' && t.files[0]) { restaurarDesde(t.files[0]); t.value = ''; }
  if (t.dataset.ajuste) {
    const clave = t.dataset.ajuste;
    const valor = t.matches('[data-dinero]') ? leerDinero(t.value) : t.type === 'number' ? Number(t.value) : t.value.trim();
    if (clave.startsWith('reparto.')) E.ajustes.reparto[clave.split('.')[1]] = Math.max(0, Math.min(100, valor));
    else E.ajustes[clave] = valor;
    guardar();
    avisar('✔ Guardado');
  }
});

document.addEventListener('submit', e => {
  if (e.target.id === 'form-hoja') { e.preventDefault(); enviarFormulario(); }
  if (e.target.id === 'form-pp') { e.preventDefault(); separarPagatePrimero(e.target); }
});

document.addEventListener('pointerover', e => { const el = e.target.closest('[data-tip]'); if (el && el.dataset.tip && e.pointerType === 'mouse') mostrarTip(el, e.clientX, e.clientY); });
document.addEventListener('pointermove', e => { const el = e.target.closest('[data-tip]'); if (el && el.dataset.tip && e.pointerType === 'mouse') mostrarTip(el, e.clientX, e.clientY); else if (e.pointerType === 'mouse') ocultarTip(); });
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-tip]');
  if (el && el.dataset.tip && e.pointerType !== 'mouse') { mostrarTip(el, e.clientX, e.clientY); clearTimeout(mostrarTip.t); mostrarTip.t = setTimeout(ocultarTip, 2200); }
});
document.addEventListener('scroll', ocultarTip, { passive: true });

window.addEventListener('hashchange', () => { if (!$('#hoja').hidden) cerrarHoja(); render(); });
document.addEventListener('visibilitychange', () => {
  // Si la app quedó abierta de un día para otro, refresca racha y retos.
  if (document.visibilityState === 'visible' && E && E.ajustes.onboarding) { const r = alAbrir(); render(); mostrarCelebraciones(); if (r && r.usados) avisar(`🛡️ Usamos ${plural(r.usados, 'comodín', 'comodines')} y su racha sigue viva.`); }
});

iniciar();
