// Synchronized verbatim with firebase-blueprint.json and firestore.rules
export const VALIDATION_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  ID_MAX: 128,
  SHORT_ID_MAX: 64,
  TITULO_MAX: 200,
  UNIVERSO_MIN: 1,
  UNIVERSO_MAX: 1000000000,
  MARGEN_ERROR_MIN: 0.5,
  MARGEN_ERROR_MAX: 20,
  MUESTRA_MAX: 100000000,
  VERSION_MAX: 40,
  QUESTION_TEXT_MAX: 500,
  QUESTION_ORDEN_MAX: 1000,
  ALTERNATIVAS_MAX: 30,
  ALTERNATIVA_ITEM_MAX: 200,
  SALTO_LOGICO_MAX: 200,
  MACRO_ZONA_MAX: 120,
  RANGO_ETARIO_MAX: 60,
  GENERO_MAX: 60,
  QUOTA_META_MAX: 1000000,
  TIMESTAMP_STR_MAX: 64,
  OPERADOR_MAX: 120,
  CONTACTO_OPCIONAL_MAX: 300,
  RESPUESTAS_KEYS_MAX: 100
} as const;

export function sanitizeValidId(raw: string, maxLen: number = VALIDATION_LIMITS.ID_MAX): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, maxLen);
  return cleaned || `ID-${Date.now()}`;
}

export function clampText(raw: string, maxLen: number, fallback = ''): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}
