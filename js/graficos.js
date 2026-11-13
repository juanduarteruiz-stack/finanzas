'use strict';
/* =========================================================================
   Finanzas · gráficos sin librerías (SVG y HTML)
   Marcas delgadas, puntas redondeadas ancladas a la base, rejilla discreta,
   un solo eje, y tooltip en cada marca (atributo data-tip).
   ========================================================================= */

function techo(max) {
  if (max <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  for (const f of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (f * p >= max) return f * p;
  return 10 * p;
}

function ejeCorto(v) {
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)} mil`;
  return String(Math.round(v));
}

// Barra con punta superior redondeada, anclada a la base.
function rutaBarra(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/* Barras verticales de una sola serie.
   datos: [{etiqueta, valor, tip, resaltar}]; referencia: {valor, texto} opcional */
function graficoBarras(datos, { alto = 150, referencia = null, etiquetasCada = 1, titulo = '', valorDirecto = null } = {}) {
  const W = 340, H = alto, pad = { l: 46, r: 8, t: 14, b: 22 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = techo(Math.max(...datos.map(d => d.valor), referencia ? referencia.valor * 1.1 : 0, 1));
  const y = v => pad.t + ih - (v / max) * ih;
  const paso = iw / datos.length;
  const bw = Math.max(3, Math.min(28, paso * 0.62));
  let s = `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titulo)}">`;
  for (const f of [0, 0.5, 1]) {
    const v = max * f;
    s += `<line class="${f === 0 ? 'base-eje' : 'rejilla'}" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    s += `<text class="eje" x="${pad.l - 6}" y="${y(v) + 3.5}" text-anchor="end">${ejeCorto(v)}</text>`;
  }
  datos.forEach((d, i) => {
    const x = pad.l + i * paso + (paso - bw) / 2;
    const h = (d.valor / max) * ih;
    if (d.valor > 0) s += `<path class="marca${d.resaltar ? ' resaltada' : ''}" d="${rutaBarra(x, y(d.valor), bw, h)}"/>`;
    const ultimo = i === datos.length - 1 && (i % etiquetasCada) >= Math.ceil(etiquetasCada / 2);
    if (i % etiquetasCada === 0 || ultimo) {
      s += `<text class="eje" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(d.etiqueta)}</text>`;
    }
    if (valorDirecto === i && d.valor > 0) {
      s += `<text class="valor-directo" x="${x + bw / 2}" y="${y(d.valor) - 5}" text-anchor="middle">${ejeCorto(d.valor)}</text>`;
    }
    // zona de toque más grande que la marca
    s += `<rect class="zona" x="${pad.l + i * paso}" y="${pad.t}" width="${paso}" height="${ih}" data-tip="${esc(d.tip)}"/>`;
  });
  if (referencia && referencia.valor > 0) {
    const yy = y(referencia.valor);
    s += `<line class="referencia" x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}"/>`;
  }
  return s + '</svg>';
}

/* Barras horizontales en HTML: magnitud por categoría (una sola serie). */
function barrasHorizontales(filas, total) {
  const max = Math.max(...filas.map(f => f.valor), 1);
  return `<div class="hbarras">${filas.map(f => `
    <button class="hbarra" data-accion="${f.accion || ''}" data-cat="${f.cat || ''}" data-tip="${esc(f.tip || '')}">
      <span class="hb-emoji">${f.emoji}</span>
      <span class="hb-cuerpo">
        <span class="hb-fila"><span class="hb-nombre">${esc(f.nombre)}</span><span class="hb-valor">${M(f.valor)}${total ? `<small>${Math.round(f.valor / total * 100)}%</small>` : ''}</span></span>
        <span class="hb-pista"><i style="width:${Math.max(1.5, f.valor / max * 100)}%"></i>${f.tope ? `<b class="hb-tope" style="left:${Math.min(100, f.tope / max * 100)}%" title="Tope"></b>` : ''}</span>
      </span>
    </button>`).join('')}</div>`;
}

/* Barra segmentada (partes de un todo) con leyenda y etiquetas directas. */
function barraSegmentada(partes) {
  const total = partes.reduce((t, p) => t + p.valor, 0) || 1;
  const segs = partes.filter(p => p.valor > 0).map(p =>
    `<i class="seg-${p.serie}" style="flex:${p.valor}" data-tip="${esc(`${p.nombre}: ${pesos(p.valor)} (${Math.round(p.valor / total * 100)}%)`)}"></i>`).join('');
  const leyenda = partes.map(p => `
    <div class="ley-fila">
      <span class="ley-muestra seg-${p.serie}"></span>
      <span class="ley-nombre">${esc(p.nombre)}</span>
      <span class="ley-valor"><strong>${Math.round(p.valor / total * 100)}%</strong>${p.ideal != null ? ` <small>ideal ${p.ideal}%</small>` : ''}</span>
    </div>`).join('');
  return `<div class="segmentada">${segs || '<i class="seg-vacia" style="flex:1"></i>'}</div><div class="leyenda">${leyenda}</div>`;
}

/* Anillo de progreso (medidor) para metas. */
function anillo(pct, tam = 56) {
  const r = (tam - 8) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return `<svg class="anillo" width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" aria-hidden="true">
    <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" class="anillo-pista"/>
    <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" class="anillo-valor" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 ${tam / 2} ${tam / 2})"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle">${Math.round(p * 100)}%</text>
  </svg>`;
}
