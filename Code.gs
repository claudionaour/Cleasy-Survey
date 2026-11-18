/**
 * ============================================================================
 * Cleasy Survey — Backend Google Apps Script (Code.gs)
 * Sincronización concurrente con Google Sheet maestro mediante doGet y doPost
 * Protección de concurrencia obligatoria con LockService.getScriptLock()
 *
 * Despliegue en Google Apps Script:
 *   1. Abrir el Google Sheet maestro -> Extensiones -> Apps Script.
 *   2. Pegar este código en Code.gs y guardar.
 *   3. Implementar -> Nueva implementación -> Tipo: "Aplicación web".
 *      - Ejecutar como: "Yo" (propietario del Google Sheet maestro).
 *      - Quién tiene acceso: "Cualquier usuario".
 *   4. Usar la URL /exec resultante en Cleasy Survey.
 * ============================================================================
 */

const HOJAS = Object.freeze({
  CONFIG: 'Configuracion_Encuesta',
  PREGUNTAS: 'Preguntas',
  CUOTAS: 'Cuotas_Demograficas',
  RESPUESTAS: 'Respuestas_Anonimas',
  AUDITORIA: 'Auditoria_Desvinculada'
});

/**
 * Punto de entrada GET:
 * Permite a los dispositivos de encuestadores consultar la configuración del
 * estudio, el cuestionario y el estado actualizado de cuotas antes de sincronizar.
 * Parámetros opcionales:
 *   ?action=cuotas   -> devuelve solo el estado vigente de Cuotas_Demograficas
 *   ?action=estado   -> devuelve configuración, preguntas, cuotas y conteos
 */
function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = String(params.action || 'estado').toLowerCase();

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    asegurarEstructura5Pestanas_(ss);

    if (action === 'cuotas') {
      return respuestaJson_({
        ok: true,
        timestamp: new Date().toISOString(),
        cuotas: leerCuotas_(ss)
      });
    }

    const config = leerConfiguracion_(ss);
    const preguntas = leerPreguntas_(ss);
    const cuotas = leerCuotas_(ss);
    const sheetResp = ss.getSheetByName(HOJAS.RESPUESTAS);
    const totalRespuestas = sheetResp ? Math.max(0, sheetResp.getLastRow() - 1) : 0;

    return respuestaJson_({
      ok: true,
      servicio: 'Cleasy Survey · Google Sheet Maestro',
      timestamp: new Date().toISOString(),
      config: config,
      preguntas: preguntas,
      cuotas: cuotas,
      total_respuestas: totalRespuestas
    });
  } catch (err) {
    return respuestaJson_({
      ok: false,
      error: 'Error en doGet: ' + err.message
    });
  }
}

/**
 * Punto de entrada POST:
 * Recibe datos desde múltiples encuestadores y sincroniza 'respuestas',
 * 'auditoria' y 'cuotas' en el Google Sheet maestro bajo LockService.
 */
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return respuestaJson_({
      ok: false,
      error: 'Solicitud POST vacía: no se recibió e.postData.contents.'
    });
  }

  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (parseErr) {
    return respuestaJson_({
      ok: false,
      error: 'JSON inválido en la solicitud POST: ' + parseErr.message
    });
  }

  const lock = LockService.getScriptLock();
  const inicioLock = Date.now();

  try {
    // Bloqueo exclusivo de hasta 30 segundos para serializar escrituras concurrentes
    lock.waitLock(30000);
  } catch (lockErr) {
    return respuestaJson_({
      ok: false,
      codigo: 'LOCK_TIMEOUT',
      error: 'Libro ocupado por otro encuestador sincronizando. Reintente en unos segundos.'
    });
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    asegurarEstructura5Pestanas_(ss);

    const resultado = sincronizarConLibroMaestro_(ss, payload);
    resultado.tiempo_lock_ms = Date.now() - inicioLock;
    return respuestaJson_(resultado);
  } catch (err) {
    return respuestaJson_({
      ok: false,
      error: 'Error durante escritura concurrente protegida: ' + err.message
    });
  } finally {
    // Liberación garantizada del bloqueo para evitar deadlocks
    lock.releaseLock();
  }
}

/**
 * Sincroniza de forma atómica configuración, preguntas, cuotas, respuestas
 * anónimas y auditoría desvinculada dentro de la sección crítica de LockService.
 */
function sincronizarConLibroMaestro_(ss, payload) {
  const sheetConfig = ss.getSheetByName(HOJAS.CONFIG);
  const sheetPreguntas = ss.getSheetByName(HOJAS.PREGUNTAS);
  const sheetCuotas = ss.getSheetByName(HOJAS.CUOTAS);
  const sheetRespuestas = ss.getSheetByName(HOJAS.RESPUESTAS);
  const sheetAuditoria = ss.getSheetByName(HOJAS.AUDITORIA);

  // 1. Actualizar Configuracion_Encuesta si se envía en el payload
  if (payload.config && typeof payload.config === 'object') {
    const cfg = payload.config;
    const filasConfig = [
      ['clave', 'valor'],
      ['estudio_id', String(cfg.estudio_id || '')],
      ['titulo', String(cfg.titulo || '')],
      ['universo_N', Number(cfg.universo_N || 0)],
      ['nivel_confianza_pct', Number(cfg.nivel_confianza_pct || 95)],
      ['margen_error_pct', Number(cfg.margen_error_pct || 5)],
      ['tamano_muestra_n', Number(cfg.tamano_muestra_n || 0)],
      ['politica_cuota_estricta', cfg.politica_cuota_estricta ? 'TRUE' : 'FALSE']
    ];
    sheetConfig.clearContents();
    sheetConfig.getRange(1, 1, filasConfig.length, 2).setValues(filasConfig);
  }

  // 2. Actualizar Preguntas si se envían en el payload
  if (Array.isArray(payload.preguntas) && payload.preguntas.length > 0) {
    const filasPreguntas = [
      ['id', 'orden', 'texto', 'tipo', 'alternativas_json', 'obligatoria']
    ];
    payload.preguntas.forEach(function (p, idx) {
      filasPreguntas.push([
        String(p.id || 'P' + (idx + 1)),
        Number(p.orden || idx + 1),
        String(p.texto || ''),
        String(p.tipo || 'unica'),
        JSON.stringify(p.alternativas || []),
        p.obligatoria !== false ? 'TRUE' : 'FALSE'
      ]);
    });
    sheetPreguntas.clearContents();
    sheetPreguntas.getRange(1, 1, filasPreguntas.length, 6).setValues(filasPreguntas);
  }

  // 3. Inicializar Cuotas_Demograficas si el libro maestro aún no tiene metas cargadas
  if (Array.isArray(payload.cuotas) && payload.cuotas.length > 0 && sheetCuotas.getLastRow() <= 1) {
    const filasCuotas = [['id', 'macro_zona', 'rango_etario', 'genero', 'meta', 'actual']];
    payload.cuotas.forEach(function (c, idx) {
      filasCuotas.push([
        String(c.id || 'C-' + (idx + 1)),
        String(c.macro_zona || ''),
        String(c.rango_etario || ''),
        String(c.genero || ''),
        Number(c.meta || 0),
        0
      ]);
    });
    sheetCuotas.clearContents();
    sheetCuotas.getRange(1, 1, filasCuotas.length, 6).setValues(filasCuotas);
  }

  // 4. Normalizar lote entrante (acepta 'lote' o 'respuestas')
  const loteRespuestas = Array.isArray(payload.lote)
    ? payload.lote
    : (Array.isArray(payload.respuestas) ? payload.respuestas : []);

  const auditoriaExterna = Array.isArray(payload.auditoria) ? payload.auditoria : [];

  const uuidsExistentes = obtenerSetUuids_(sheetRespuestas);
  const datosCuotas = sheetCuotas.getDataRange().getValues();
  const mapaCuotas = construirMapaCuotas_(datosCuotas);
  const configActual = leerConfiguracion_(ss);
  const politicaEstricta = payload.config && payload.config.politica_cuota_estricta !== undefined
    ? Boolean(payload.config.politica_cuota_estricta)
    : configActual.politica_cuota_estricta;

  const nuevasRespuestas = [];
  const nuevasAuditorias = [];
  const ahoraIso = new Date().toISOString();

  let guardadas = 0;
  let duplicadas = 0;
  let rechazadas = 0;

  for (let i = 0; i < loteRespuestas.length; i++) {
    const item = loteRespuestas[i];
    const uuid = String(item.uuid || item.uuid_respuesta || '').trim();

    if (!uuid) {
      rechazadas++;
      continue;
    }

    // Idempotencia: evita duplicados si un encuestador reintenta el envío
    if (uuidsExistentes.has(uuid)) {
      duplicadas++;
      continue;
    }

    const macroZona = String(item.macro_zona || 'General').trim();
    const rangoEtario = String(item.rango_etario || '').trim();
    const genero = String(item.genero || '').trim();

    // Validación y descuento atómico de cuota
    const validacionCuota = validarYActualizarCuota_(
      mapaCuotas,
      datosCuotas,
      macroZona,
      rangoEtario,
      genero,
      politicaEstricta
    );

    if (!validacionCuota.permitida) {
      rechazadas++;
      continue;
    }

    const respuestasObj = item.respuestas
      ? sanitizarPii_(item.respuestas)
      : sanitizarPiiSeguroJson_(item.respuestas_json);

    nuevasRespuestas.push([
      uuid,
      String(item.timestamp_captura || ahoraIso),
      ahoraIso,
      macroZona,
      rangoEtario,
      genero,
      validacionCuota.estado,
      JSON.stringify(respuestasObj)
    ]);

    // Auditoría desvinculada: se registra sin el uuid_respuesta
    const audItem = auditoriaExterna[i] || {};
    nuevasAuditorias.push([
      String(audItem.id_evento_auditoria || 'AUD-' + Utilities.getUuid().slice(0, 8)),
      ahoraIso,
      String(item.operador_codigo || audItem.operador_codigo || 'Encuestador').trim(),
      String(audItem.macro_zona_aprox || macroZona),
      (item.consentimiento_opt_in !== false && audItem.consentimiento_opt_in !== false) ? 'TRUE' : 'FALSE',
      String(item.contacto_opcional || audItem.nota_contacto_opcional || '').trim()
    ]);

    uuidsExistentes.add(uuid);
    guardadas++;
  }

  // 5. Escritura atómica por bloque con setValues()
  if (nuevasRespuestas.length > 0) {
    const startResp = sheetRespuestas.getLastRow() + 1;
    sheetRespuestas
      .getRange(startResp, 1, nuevasRespuestas.length, nuevasRespuestas[0].length)
      .setValues(nuevasRespuestas);

    const startAud = sheetAuditoria.getLastRow() + 1;
    sheetAuditoria
      .getRange(startAud, 1, nuevasAuditorias.length, nuevasAuditorias[0].length)
      .setValues(nuevasAuditorias);

    if (datosCuotas.length > 1) {
      sheetCuotas.getRange(1, 1, datosCuotas.length, datosCuotas[0].length).setValues(datosCuotas);
    }
  }

  SpreadsheetApp.flush();

  return {
    ok: true,
    timestamp_sync: ahoraIso,
    resumen: {
      recibidas: loteRespuestas.length,
      guardadas: guardadas,
      duplicadas: duplicadas,
      rechazadas: rechazadas
    },
    cuotas: leerCuotas_(ss)
  };
}

/* ============================================================================
 * FUNCIONES AUXILIARES DE LECTURA, ESQUEMA, CUOTAS Y SANITIZACIÓN
 * ============================================================================ */

function asegurarEstructura5Pestanas_(ss) {
  const esquemas = [
    { nombre: HOJAS.CONFIG, cabeceras: ['clave', 'valor'] },
    { nombre: HOJAS.PREGUNTAS, cabeceras: ['id', 'orden', 'texto', 'tipo', 'alternativas_json', 'obligatoria'] },
    { nombre: HOJAS.CUOTAS, cabeceras: ['id', 'macro_zona', 'rango_etario', 'genero', 'meta', 'actual'] },
    { nombre: HOJAS.RESPUESTAS, cabeceras: ['uuid_respuesta', 'timestamp_captura', 'timestamp_sync', 'macro_zona', 'rango_etario', 'genero', 'estado_cuota', 'respuestas_json'] },
    { nombre: HOJAS.AUDITORIA, cabeceras: ['id_evento_auditoria', 'fecha_registro', 'operador_codigo', 'macro_zona_aprox', 'consentimiento_opt_in', 'nota_contacto_opcional'] }
  ];

  esquemas.forEach(function (def) {
    let sheet = ss.getSheetByName(def.nombre);
    if (!sheet) {
      sheet = ss.insertSheet(def.nombre);
      sheet.getRange(1, 1, 1, def.cabeceras.length).setValues([def.cabeceras]);
    } else if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, def.cabeceras.length).setValues([def.cabeceras]);
    }
  });
}

function leerConfiguracion_(ss) {
  const sheet = ss.getSheetByName(HOJAS.CONFIG);
  if (!sheet || sheet.getLastRow() <= 1) {
    return {
      estudio_id: '',
      titulo: '',
      universo_N: 0,
      nivel_confianza_pct: 95,
      margen_error_pct: 5,
      politica_cuota_estricta: false
    };
  }
  const rows = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) map[String(rows[i][0]).trim()] = rows[i][1];
  }
  return {
    estudio_id: String(map.estudio_id || ''),
    titulo: String(map.titulo || ''),
    universo_N: Number(map.universo_N || 0),
    nivel_confianza_pct: Number(map.nivel_confianza_pct || 95),
    margen_error_pct: Number(map.margen_error_pct || 5),
    politica_cuota_estricta: String(map.politica_cuota_estricta || 'FALSE').toUpperCase() === 'TRUE'
  };
}

function leerPreguntas_(ss) {
  const sheet = ss.getSheetByName(HOJAS.PREGUNTAS);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const rows = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    let alternativas = [];
    try {
      alternativas = rows[i][4] ? JSON.parse(rows[i][4]) : [];
    } catch (e) {
      alternativas = [];
    }
    list.push({
      id: String(rows[i][0]),
      orden: Number(rows[i][1] || i),
      texto: String(rows[i][2] || ''),
      tipo: String(rows[i][3] || 'unica'),
      alternativas: alternativas,
      obligatoria: String(rows[i][5] || 'TRUE').toUpperCase() === 'TRUE'
    });
  }
  return list.sort(function (a, b) { return a.orden - b.orden; });
}

function leerCuotas_(ss) {
  const sheet = ss.getSheetByName(HOJAS.CUOTAS);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const rows = sheet.getDataRange().getValues();
  const cuotas = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    const meta = Number(rows[i][4] || 0);
    const actual = Number(rows[i][5] || 0);
    cuotas.push({
      id: String(rows[i][0]),
      macro_zona: String(rows[i][1]),
      rango_etario: String(rows[i][2]),
      genero: String(rows[i][3]),
      meta: meta,
      actual: actual,
      disponible: Math.max(0, meta - actual),
      completa: actual >= meta
    });
  }
  return cuotas;
}

function validarYActualizarCuota_(mapaCuotas, datosCuotas, macroZona, rangoEtario, genero, politicaEstricta) {
  const clave = [macroZona, rangoEtario, genero].join('|').toLowerCase();
  const idx = mapaCuotas[clave];

  if (idx === undefined) {
    if (politicaEstricta && datosCuotas.length > 1) {
      return { permitida: false, estado: 'NO_DEFINIDA' };
    }
    return { permitida: true, estado: 'ACEPTADA' };
  }

  const meta = Number(datosCuotas[idx][4]) || 0;
  const actual = Number(datosCuotas[idx][5]) || 0;

  if (actual >= meta) {
    if (politicaEstricta) {
      return { permitida: false, estado: 'CUOTA_COMPLETA' };
    }
    datosCuotas[idx][5] = actual + 1;
    return { permitida: true, estado: 'SOBRECUPO_ALERTA' };
  }

  datosCuotas[idx][5] = actual + 1;
  return { permitida: true, estado: 'ACEPTADA' };
}

function construirMapaCuotas_(datosCuotas) {
  const mapa = {};
  for (let i = 1; i < datosCuotas.length; i++) {
    const clave = [datosCuotas[i][1], datosCuotas[i][2], datosCuotas[i][3]]
      .map(function (v) { return String(v || '').trim(); })
      .join('|')
      .toLowerCase();
    mapa[clave] = i;
  }
  return mapa;
}

function obtenerSetUuids_(sheetRespuestas) {
  const set = new Set();
  const lastRow = sheetRespuestas.getLastRow();
  if (lastRow <= 1) return set;
  const values = sheetRespuestas.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][0]) set.add(String(values[i][0]).trim());
  }
  return set;
}

function sanitizarPii_(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const prohibidos = new Set([
    'nombre', 'apellido', 'correo', 'email', 'telefono', 'celular', 'rut', 'dni', 'ip', 'direccion'
  ]);
  const limpio = {};
  Object.keys(obj).forEach(function (k) {
    if (!prohibidos.has(String(k).toLowerCase())) {
      limpio[k] = obj[k];
    }
  });
  return limpio;
}

function sanitizarPiiSeguroJson_(rawJson) {
  if (!rawJson) return {};
  try {
    return sanitizarPii_(JSON.parse(rawJson));
  } catch (e) {
    return {};
  }
}

function respuestaJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
