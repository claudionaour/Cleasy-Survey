export type RolUsuario = 'admin' | 'encuestador' | 'cliente';

export type ModalidadRecoleccion = 'solo_encuestador' | 'mixta' | 'cawi_exclusiva';

export interface ConfiguracionEncuesta {
  estudio_id: string;
  titulo: string;
  universo_N: number;
  nivel_confianza_pct: 90 | 95 | 99;
  margen_error_pct: number;
  tamano_muestra_n: number;
  politica_cuota_estricta: boolean;
  version_instrumento: string;
  modalidad_recoleccion: ModalidadRecoleccion;
}

export interface PreguntaInstrumento {
  id: string;
  orden: number;
  texto: string;
  tipo: 'unica' | 'multiple' | 'escala_likert' | 'likert_7' | 'estrellas' | 'slider' | 'nps' | 'texto';
  alternativas: string[];
  obligatoria: boolean;
  salto_logico: string;
}

export interface CuotaDemografica {
  id: string;
  macro_zona: string;
  rango_etario: string;
  genero: string;
  meta: number;
  actual: number;
}

export interface RespuestaAnonimaRow {
  uuid_respuesta: string;
  timestamp_captura: string;
  timestamp_sync: string;
  macro_zona: string;
  rango_etario: string;
  genero: string;
  estado_cuota: 'ACEPTADA' | 'SOBRECUPO_ALERTA';
  respuestas_json: string;
}

export interface AuditoriaDesvinculadaRow {
  id_evento_auditoria: string;
  fecha_registro: string;
  operador_codigo: string;
  macro_zona_aprox: string;
  consentimiento_opt_in: boolean;
  nota_contacto_opcional: string;
}

export interface EncuestaPendienteOffline {
  uuid: string;
  operador_codigo: string;
  timestamp_captura: string;
  consentimiento_opt_in: boolean;
  macro_zona: string;
  rango_etario: string;
  genero: string;
  contacto_opcional: string;
  respuestas: Record<string, string | number>;
}

export interface ResultadoSyncItem {
  uuid: string;
  estado: 'GUARDADA' | 'DUPLICADO_IGNORADO' | 'RECHAZADA_CUOTA' | 'RECHAZADA_CONSENTIMIENTO';
  detalle: string;
}

export interface EventoLockLog {
  id: string;
  hora: string;
  operador: string;
  duracionMs: number;
  loteTamano: number;
  guardadas: number;
  duplicadas: number;
  rechazadas: number;
  mensaje: string;
}
