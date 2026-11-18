import {
  AuditoriaDesvinculadaRow,
  ConfiguracionEncuesta,
  CuotaDemografica,
  EncuestaPendienteOffline,
  PreguntaInstrumento,
  RespuestaAnonimaRow
} from '../types/survey';

export const Z_BY_CONFIDENCE: Record<90 | 95 | 99, number> = {
  90: 1.645,
  95: 1.96,
  99: 2.576
};

export function calcularTamanoMuestralFinito(
  universoN: number,
  confianzaPct: 90 | 95 | 99,
  margenErrorPct: number
): number {
  const z = Z_BY_CONFIDENCE[confianzaPct] || 1.96;
  const e = Math.max(0.1, margenErrorPct) / 100;
  const p = 0.5;
  const q = 0.5;
  const n = Math.max(2, universoN);
  const num = n * z * z * p * q;
  const den = e * e * (n - 1) + z * z * p * q;
  return den > 0 ? Math.ceil(num / den) : 0;
}

export function calcularMargenErrorReal(
  universoN: number,
  muestraAlcanzada: number,
  confianzaPct: 90 | 95 | 99
): number | null {
  if (muestraAlcanzada < 2 || universoN < 2) return null;
  const z = Z_BY_CONFIDENCE[confianzaPct] || 1.96;
  const fpc = Math.sqrt(Math.max(0, (universoN - muestraAlcanzada) / (universoN - 1)));
  const me = z * Math.sqrt(0.25 / muestraAlcanzada) * fpc * 100;
  return Number(me.toFixed(2));
}

export const INITIAL_CONFIG: ConfiguracionEncuesta = {
  estudio_id: `EST-${new Date().getFullYear()}`,
  titulo: 'Nueva Encuesta',
  universo_N: 1000,
  nivel_confianza_pct: 95,
  margen_error_pct: 5,
  tamano_muestra_n: calcularTamanoMuestralFinito(1000, 95, 5),
  politica_cuota_estricta: false,
  version_instrumento: 'v1.0',
  modalidad_recoleccion: 'mixta'
};

export const INITIAL_PREGUNTAS: PreguntaInstrumento[] = [];
export const INITIAL_CUOTAS: CuotaDemografica[] = [];
export const INITIAL_RESPUESTAS: RespuestaAnonimaRow[] = [];
export const INITIAL_AUDITORIA: AuditoriaDesvinculadaRow[] = [];
export const INITIAL_OFFLINE_QUEUE: EncuestaPendienteOffline[] = [];
