import {
  AuditoriaDesvinculadaRow,
  ConfiguracionEncuesta,
  CuotaDemografica,
  PreguntaInstrumento,
  RespuestaAnonimaRow
} from '../types/survey';

const TAB_NAMES = [
  'Configuracion_Encuesta',
  'Preguntas',
  'Cuotas_Demograficas',
  'Respuestas_Anonimas',
  'Auditoria_Desvinculada'
] as const;

export interface ExportDataset {
  config: ConfiguracionEncuesta;
  preguntas: PreguntaInstrumento[];
  cuotas: CuotaDemografica[];
  respuestas: RespuestaAnonimaRow[];
  auditoria: AuditoriaDesvinculadaRow[];
}

export interface SpreadsheetMetadataInfo {
  spreadsheetId: string;
  title: string;
  existingTabs: string[];
}

export interface ExportResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  totalRowsWritten: number;
}

export interface LinkedSpreadsheetRef {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  updatedAt: string;
}

export class GoogleApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GoogleApiError';
    this.status = status;
  }
}

const LINKED_SHEETS_STORAGE_KEY = 'cleasy_linked_sheets_v1';

export function getLinkedSpreadsheet(estudioId: string): LinkedSpreadsheetRef | null {
  try {
    const raw = localStorage.getItem(LINKED_SHEETS_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, LinkedSpreadsheetRef>;
    return map[estudioId || 'default'] || null;
  } catch {
    return null;
  }
}

export function saveLinkedSpreadsheet(estudioId: string, result: ExportResult): void {
  try {
    const raw = localStorage.getItem(LINKED_SHEETS_STORAGE_KEY);
    const map: Record<string, LinkedSpreadsheetRef> = raw ? JSON.parse(raw) : {};
    map[estudioId || 'default'] = {
      spreadsheetId: result.spreadsheetId,
      spreadsheetUrl: result.spreadsheetUrl,
      title: result.title,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(LINKED_SHEETS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignorar errores de almacenamiento
  }
}

export function clearLinkedSpreadsheet(estudioId: string): void {
  try {
    const raw = localStorage.getItem(LINKED_SHEETS_STORAGE_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, LinkedSpreadsheetRef>;
    delete map[estudioId || 'default'];
    localStorage.setItem(LINKED_SHEETS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignorar
  }
}

export function extraerSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return trimmed;
}

function construirFilasPorPestana(dataset: ExportDataset) {
  const configRows: (string | number | boolean)[][] = [
    ['clave', 'valor'],
    ['estudio_id', dataset.config.estudio_id],
    ['titulo', dataset.config.titulo],
    ['universo_N', dataset.config.universo_N],
    ['nivel_confianza_pct', dataset.config.nivel_confianza_pct],
    ['margen_error_pct', dataset.config.margen_error_pct],
    ['tamano_muestra_n', dataset.config.tamano_muestra_n],
    ['politica_cuota_estricta', dataset.config.politica_cuota_estricta ? 'TRUE' : 'FALSE']
  ];

  const preguntasRows: (string | number | boolean)[][] = [
    ['id', 'orden', 'texto', 'tipo', 'alternativas_json', 'obligatoria'],
    ...dataset.preguntas.map((p) => [
      p.id,
      p.orden,
      p.texto,
      p.tipo,
      JSON.stringify(p.alternativas),
      p.obligatoria ? 'TRUE' : 'FALSE'
    ])
  ];

  const cuotasRows: (string | number)[][] = [
    ['id', 'macro_zona', 'rango_etario', 'genero', 'meta', 'actual'],
    ...dataset.cuotas.map((c) => [
      c.id,
      c.macro_zona,
      c.rango_etario,
      c.genero,
      c.meta,
      c.actual
    ])
  ];

  const respuestasRows: (string | number)[][] = [
    [
      'uuid_respuesta',
      'timestamp_captura',
      'timestamp_sync',
      'macro_zona',
      'rango_etario',
      'genero',
      'estado_cuota',
      ...dataset.preguntas.map((p) => `${p.id}: ${p.texto}`),
      'respuestas_json'
    ],
    ...dataset.respuestas.map((r) => {
      let parsed: Record<string, string | number> = {};
      try {
        parsed = JSON.parse(r.respuestas_json || '{}');
      } catch {
        parsed = {};
      }
      return [
        r.uuid_respuesta,
        r.timestamp_captura,
        r.timestamp_sync,
        r.macro_zona,
        r.rango_etario,
        r.genero,
        r.estado_cuota,
        ...dataset.preguntas.map((p) =>
          parsed[p.id] !== undefined ? String(parsed[p.id]) : ''
        ),
        r.respuestas_json
      ];
    })
  ];

  const auditoriaRows: (string | boolean)[][] = [
    [
      'id_evento_auditoria',
      'fecha_registro',
      'operador_codigo',
      'macro_zona_aprox',
      'consentimiento_opt_in',
      'nota_contacto_opcional'
    ],
    ...dataset.auditoria.map((a) => [
      a.id_evento_auditoria,
      a.fecha_registro,
      a.operador_codigo,
      a.macro_zona_aprox,
      a.consentimiento_opt_in ? 'TRUE' : 'FALSE',
      a.nota_contacto_opcional
    ])
  ];

  return {
    Configuracion_Encuesta: configRows,
    Preguntas: preguntasRows,
    Cuotas_Demograficas: cuotasRows,
    Respuestas_Anonimas: respuestasRows,
    Auditoria_Desvinculada: auditoriaRows
  };
}

export async function leerMetadatosSpreadsheet(
  accessToken: string,
  spreadsheetIdOrUrl: string
): Promise<SpreadsheetMetadataInfo> {
  const spreadsheetId = extraerSpreadsheetId(spreadsheetIdOrUrl);
  if (!spreadsheetId) {
    throw new Error('Ingrese un ID o enlace válido de Google Sheets.');
  }

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=properties.title,sheets.properties.title`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new GoogleApiError(
      errBody?.error?.message || `No se pudo leer la hoja (${res.status}). Verifica el enlace y permisos.`,
      res.status
    );
  }

  const data = await res.json();
  const existingTabs: string[] = Array.isArray(data.sheets)
    ? data.sheets.map((s: { properties?: { title?: string } }) => s.properties?.title || '').filter(Boolean)
    : [];

  return {
    spreadsheetId,
    title: data.properties?.title || 'Google Sheet',
    existingTabs
  };
}

export async function crearNuevoSpreadsheetYExportar(
  accessToken: string,
  dataset: ExportDataset,
  customTitle?: string
): Promise<ExportResult> {
  const title = (customTitle || `Cleasy Survey — ${dataset.config.titulo || 'Encuesta'}`).trim();

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: { title },
      sheets: TAB_NAMES.map((tabName) => ({
        properties: { title: tabName }
      }))
    })
  });

  if (!createRes.ok) {
    const errBody = await createRes.json().catch(() => ({}));
    throw new GoogleApiError(
      errBody?.error?.message || `Error al crear el Google Sheet (${createRes.status}).`,
      createRes.status
    );
  }

  const created = await createRes.json();
  const spreadsheetId: string = created.spreadsheetId;
  const spreadsheetUrl: string =
    created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  const totalRowsWritten = await escribirDatosEnPestanas(accessToken, spreadsheetId, dataset);

  return {
    spreadsheetId,
    spreadsheetUrl,
    title,
    totalRowsWritten
  };
}

export async function exportarASpreadsheetExistente(
  accessToken: string,
  metadata: SpreadsheetMetadataInfo,
  dataset: ExportDataset
): Promise<ExportResult> {
  const faltantes = TAB_NAMES.filter((name) => !metadata.existingTabs.includes(name));

  if (faltantes.length > 0) {
    const addRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        metadata.spreadsheetId
      )}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: faltantes.map((title) => ({
            addSheet: { properties: { title } }
          }))
        })
      }
    );

    if (!addRes.ok) {
      const errBody = await addRes.json().catch(() => ({}));
      throw new GoogleApiError(
        errBody?.error?.message || `No se pudieron crear las pestañas (${addRes.status}).`,
        addRes.status
      );
    }
  }

  // Limpiar contenido previo de nuestras 5 pestañas antes de escribir los datos actuales
  const clearRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      metadata.spreadsheetId
    )}/values:batchClear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ranges: TAB_NAMES.map((name) => `${name}!A:Z`)
      })
    }
  );

  if (!clearRes.ok) {
    const errBody = await clearRes.json().catch(() => ({}));
    throw new GoogleApiError(
      errBody?.error?.message || `No se pudo limpiar el rango previo (${clearRes.status}).`,
      clearRes.status
    );
  }

  const totalRowsWritten = await escribirDatosEnPestanas(
    accessToken,
    metadata.spreadsheetId,
    dataset
  );

  return {
    spreadsheetId: metadata.spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${metadata.spreadsheetId}/edit`,
    title: metadata.title,
    totalRowsWritten
  };
}

async function escribirDatosEnPestanas(
  accessToken: string,
  spreadsheetId: string,
  dataset: ExportDataset
): Promise<number> {
  const rowsMap = construirFilasPorPestana(dataset);
  const data = TAB_NAMES.map((name) => ({
    range: `${name}!A1`,
    majorDimension: 'ROWS',
    values: rowsMap[name]
  }));

  const batchRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data
      })
    }
  );

  if (!batchRes.ok) {
    const errBody = await batchRes.json().catch(() => ({}));
    throw new GoogleApiError(
      errBody?.error?.message || `Error al escribir datos en Google Sheets (${batchRes.status}).`,
      batchRes.status
    );
  }

  return Object.values(rowsMap).reduce((sum, arr) => sum + arr.length, 0);
}

export interface WebhookCodeGsResult {
  ok: boolean;
  tiempo_lock_ms?: number;
  resumen?: {
    recibidas: number;
    guardadas: number;
    duplicadas: number;
    rechazadas: number;
  };
  error?: string;
}

export async function enviarPorWebhookCodeGs(
  webAppUrl: string,
  dataset: ExportDataset
): Promise<WebhookCodeGsResult> {
  const url = webAppUrl.trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/i.test(url)) {
    throw new Error(
      'Ingresa una URL válida de aplicación web de Google Apps Script (debe terminar en /exec).'
    );
  }

  const lote = dataset.respuestas.map((r, idx) => ({
    uuid: r.uuid_respuesta,
    timestamp_captura: r.timestamp_captura,
    macro_zona: r.macro_zona,
    rango_etario: r.rango_etario,
    genero: r.genero,
    respuestas_json: r.respuestas_json,
    operador_codigo: dataset.auditoria[idx]?.operador_codigo || 'Encuestador',
    consentimiento_opt_in: dataset.auditoria[idx]?.consentimiento_opt_in ?? true,
    contacto_opcional: dataset.auditoria[idx]?.nota_contacto_opcional || ''
  }));

  // Se utiliza text/plain para evitar preflight CORS OPTIONS que GAS Web Apps no procesan
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({
      action: 'sincronizarEncuesta',
      config: dataset.config,
      preguntas: dataset.preguntas,
      cuotas: dataset.cuotas,
      lote
    })
  });

  if (!res.ok) {
    throw new Error(`El servidor respondió con estado ${res.status}.`);
  }

  const data = (await res.json()) as WebhookCodeGsResult;
  if (!data.ok) {
    throw new Error(data.error || 'Error reportado por Code.gs durante doPost.');
  }

  return data;
}

