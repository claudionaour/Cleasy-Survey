import {
  ConfiguracionEncuesta,
  CuotaDemografica,
  PreguntaInstrumento,
  RespuestaAnonimaRow
} from '../types/survey';
import { calcularMargenErrorReal, Z_BY_CONFIDENCE } from '../data/initialWorkbook';

export interface PesoEstrato {
  id: string;
  segmento: string;
  meta: number;
  actual: number;
  propObjetivo: number;
  propMuestra: number;
  pesoWh: number;
  estado: 'Equilibrado' | 'Sub-representado' | 'Sobre-representado' | 'Sin datos';
}

export interface FrecuenciaItem {
  opcion: string;
  conteoBruto: number;
  pctBruto: number;
  conteoPonderado: number;
  pctPonderado: number;
}

export interface ResumenPreguntaEstadistica {
  pregunta: PreguntaInstrumento;
  totalValidas: number;
  frecuencias: FrecuenciaItem[];
  mediaBruta: number | null;
  mediaPonderada: number | null;
  npsBruto: number | null;
  npsPonderado: number | null;
}

export interface ReporteEjecutivoEstadistico {
  nTotal: number;
  nOptimo: number;
  coberturaMuestralPct: number;
  margenErrorRealBruto: number | null;
  margenErrorEfectivo: number | null;
  deffKish: number;
  nEfectivo: number;
  pesosEstratos: PesoEstrato[];
  resumenPreguntas: ResumenPreguntaEstadistica[];
  hallazgosClave: string[];
}

export function generarReporteEstadistico(
  config: ConfiguracionEncuesta,
  cuotas: CuotaDemografica[],
  preguntas: PreguntaInstrumento[],
  respuestas: RespuestaAnonimaRow[]
): ReporteEjecutivoEstadistico {
  const totalMeta = cuotas.reduce((acc, c) => acc + Math.max(0, c.meta), 0);

  // Contar respuestas reales por segmento desde Respuestas_Anonimas (o usar cuotas.actual si aún hay historial base)
  const conteoPorClave = new Map<string, number>();
  respuestas.forEach((r) => {
    const k = `${r.macro_zona}|${r.rango_etario}|${r.genero}`.toLowerCase();
    conteoPorClave.set(k, (conteoPorClave.get(k) || 0) + 1);
  });

  // Si existen más acumulados en cuotas que filas detalladas (por estado inicial de demo),
  // utilizamos el conteo de cuotas para los pesos poblacionales vs muestrales para mantener coherencia.
  const totalActualCuotas = cuotas.reduce((acc, c) => acc + Math.max(0, c.actual), 0);

  const pesosEstratos: PesoEstrato[] = cuotas.map((c) => {
    const actualSeg = c.actual;
    const propObjetivo = totalMeta > 0 ? c.meta / totalMeta : 0;
    const propMuestra = totalActualCuotas > 0 ? actualSeg / totalActualCuotas : 0;
    const pesoWh = propMuestra > 0 ? propObjetivo / propMuestra : 1;

    let estado: PesoEstrato['estado'] = 'Equilibrado';
    if (actualSeg === 0) estado = 'Sin datos';
    else if (pesoWh > 1.08) estado = 'Sub-representado';
    else if (pesoWh < 0.92) estado = 'Sobre-representado';

    return {
      id: c.id,
      segmento: `${c.macro_zona} · ${c.rango_etario} · ${c.genero}`,
      meta: c.meta,
      actual: actualSeg,
      propObjetivo,
      propMuestra,
      pesoWh: Number(pesoWh.toFixed(3)),
      estado
    };
  });

  const mapaPesos = new Map<string, number>();
  cuotas.forEach((c, idx) => {
    const k = `${c.macro_zona}|${c.rango_etario}|${c.genero}`.toLowerCase();
    mapaPesos.set(k, pesosEstratos[idx]?.pesoWh ?? 1);
  });

  // Calcular Efecto de Diseño (Kish Deff = 1 + CV^2 de los pesos asignados a cada observación)
  const pesosObs: number[] = respuestas.map((r) => {
    const k = `${r.macro_zona}|${r.rango_etario}|${r.genero}`.toLowerCase();
    return mapaPesos.get(k) ?? 1;
  });

  let deffKish = 1;
  if (pesosObs.length > 1) {
    const sumW = pesosObs.reduce((a, b) => a + b, 0);
    const sumW2 = pesosObs.reduce((a, b) => a + b * b, 0);
    if (sumW > 0) {
      deffKish = Number(((pesosObs.length * sumW2) / (sumW * sumW)).toFixed(3));
    }
  }

  const nTotal = respuestas.length;
  const nEfectivo = deffKish > 0 ? Math.max(1, Math.round(nTotal / deffKish)) : nTotal;
  const margenErrorRealBruto = calcularMargenErrorReal(
    config.universo_N,
    Math.max(nTotal, totalActualCuotas),
    config.nivel_confianza_pct
  );

  let margenErrorEfectivo: number | null = null;
  if (nEfectivo > 1 && config.universo_N > 1) {
    const z = Z_BY_CONFIDENCE[config.nivel_confianza_pct] || 1.96;
    const fpc = Math.sqrt(Math.max(0, (config.universo_N - nEfectivo) / (config.universo_N - 1)));
    margenErrorEfectivo = Number((z * Math.sqrt(0.25 / nEfectivo) * fpc * 100).toFixed(2));
  }

  // Procesar tablas de frecuencias, medias y NPS por cada pregunta
  const resumenPreguntas: ResumenPreguntaEstadistica[] = preguntas.map((p) => {
    const mapaFrec = new Map<string, { bruto: number; pond: number }>();
    let sumValBruto = 0;
    let sumValPond = 0;
    let countNumBruto = 0;
    let sumWeightNum = 0;

    let promBruto = 0;
    let detBruto = 0;
    let promPond = 0;
    let detPond = 0;
    let totalValidas = 0;
    let totalPesoValidas = 0;

    respuestas.forEach((r, idx) => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(r.respuestas_json || '{}');
      } catch {
        parsed = {};
      }

      const rawVal = parsed[p.id];
      if (rawVal === undefined || rawVal === null || rawVal === '') return;

      const w = pesosObs[idx] ?? 1;
      const valores = Array.isArray(rawVal) ? rawVal : [rawVal];

      totalValidas += 1;
      totalPesoValidas += w;

      valores.forEach((v) => {
        const label = String(v);
        const cur = mapaFrec.get(label) || { bruto: 0, pond: 0 };
        cur.bruto += 1;
        cur.pond += w;
        mapaFrec.set(label, cur);

        const num = Number(v);
        if (!Number.isNaN(num) && typeof v !== 'boolean') {
          sumValBruto += num;
          sumValPond += num * w;
          countNumBruto += 1;
          sumWeightNum += w;

          if (p.tipo === 'nps') {
            if (num >= 9) {
              promBruto += 1;
              promPond += w;
            } else if (num <= 6) {
              detBruto += 1;
              detPond += w;
            }
          }
        }
      });
    });

    const frecuencias: FrecuenciaItem[] = Array.from(mapaFrec.entries())
      .map(([opcion, counts]) => ({
        opcion,
        conteoBruto: counts.bruto,
        pctBruto: totalValidas > 0 ? Number(((counts.bruto / totalValidas) * 100).toFixed(1)) : 0,
        conteoPonderado: Number(counts.pond.toFixed(2)),
        pctPonderado:
          totalPesoValidas > 0 ? Number(((counts.pond / totalPesoValidas) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.pctPonderado - a.pctPonderado);

    const mediaBruta = countNumBruto > 0 ? Number((sumValBruto / countNumBruto).toFixed(2)) : null;
    const mediaPonderada =
      sumWeightNum > 0 ? Number((sumValPond / sumWeightNum).toFixed(2)) : null;

    const npsBruto =
      p.tipo === 'nps' && totalValidas > 0
        ? Math.round(((promBruto - detBruto) / totalValidas) * 100)
        : null;
    const npsPonderado =
      p.tipo === 'nps' && totalPesoValidas > 0
        ? Math.round(((promPond - detPond) / totalPesoValidas) * 100)
        : null;

    return {
      pregunta: p,
      totalValidas,
      frecuencias,
      mediaBruta,
      mediaPonderada,
      npsBruto,
      npsPonderado
    };
  });

  // Síntesis ejecutiva automática en lenguaje claro
  const hallazgosClave: string[] = [];
  const avancePct = config.tamano_muestra_n > 0
    ? Math.round((totalActualCuotas / config.tamano_muestra_n) * 100)
    : 0;

  hallazgosClave.push(
    `Se han registrado ${nTotal} entrevistas detalladas válidas en Respuestas_Anonimas (${totalActualCuotas} cupos cubiertos en cuotas), alcanzando un margen de error muestral estimado de ±${margenErrorRealBruto ?? '—'}% al ${config.nivel_confianza_pct}% de confianza (avance ${avancePct}% respecto a la muestra óptima n=${config.tamano_muestra_n}).`
  );

  const masSub = [...pesosEstratos]
    .filter((e) => e.actual > 0)
    .sort((a, b) => b.pesoWh - a.pesoWh)[0];
  if (masSub && masSub.pesoWh > 1.05) {
    hallazgosClave.push(
      `El estrato "${masSub.segmento}" presenta sub-representación relativa (${masSub.actual}/${masSub.meta}); el motor aplica un factor de ponderación post-estratificación w = ${masSub.pesoWh} (Efecto de diseño Kish Deff = ${deffKish}).`
    );
  } else {
    hallazgosClave.push(
      `La distribución muestral entre estratos se mantiene equilibrada (Efecto de diseño Kish Deff = ${deffKish}), minimizando sesgos territoriales o etarios.`
    );
  }

  const pUnica = resumenPreguntas.find((rp) => rp.pregunta.tipo === 'unica' && rp.frecuencias.length > 0);
  if (pUnica) {
    const top = pUnica.frecuencias[0];
    hallazgosClave.push(
      `En "${pUnica.pregunta.texto}", la alternativa predominante tras ponderación es "${top.opcion}" con ${top.pctPonderado}% (${top.pctBruto}% sin ponderar).`
    );
  }

  const pNps = resumenPreguntas.find((rp) => rp.npsPonderado !== null);
  if (pNps) {
    hallazgosClave.push(
      `El indicador NPS territorial ponderado alcanza ${pNps.npsPonderado} puntos (${pNps.npsBruto} puntos sin ponderar).`
    );
  }

  return {
    nTotal,
    nOptimo: config.tamano_muestra_n,
    coberturaMuestralPct: avancePct,
    margenErrorRealBruto,
    margenErrorEfectivo,
    deffKish,
    nEfectivo,
    pesosEstratos,
    resumenPreguntas,
    hallazgosClave
  };
}
