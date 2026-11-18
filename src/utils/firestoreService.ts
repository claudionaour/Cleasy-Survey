import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AuditoriaDesvinculadaRow,
  ConfiguracionEncuesta,
  CuotaDemografica,
  EncuestaPendienteOffline,
  ModalidadRecoleccion,
  PreguntaInstrumento,
  RespuestaAnonimaRow
} from '../types/survey';
import { clampText, sanitizeValidId, VALIDATION_LIMITS } from './validationLimits';

export function buildStudyDocId(uid: string, estudioId: string): string {
  const prefix = sanitizeValidId(uid.slice(0, 14), 16);
  const cleanEst = sanitizeValidId(estudioId || 'EST-2026', 80);
  return sanitizeValidId(`${prefix}_${cleanEst}`, VALIDATION_LIMITS.ID_MAX);
}

function normalizeModalidad(val: unknown): ModalidadRecoleccion {
  if (val === 'solo_encuestador' || val === 'cawi_exclusiva' || val === 'mixta') {
    return val;
  }
  return 'mixta';
}

function sanitizeStudyPayload(
  uid: string,
  config: ConfiguracionEncuesta,
  isCreate: boolean
) {
  const confianza: 90 | 95 | 99 =
    config.nivel_confianza_pct === 90 || config.nivel_confianza_pct === 99
      ? config.nivel_confianza_pct
      : 95;
  const universoN = Math.min(
    VALIDATION_LIMITS.UNIVERSO_MAX,
    Math.max(VALIDATION_LIMITS.UNIVERSO_MIN, Math.round(Number(config.universo_N) || 1000))
  );
  const margenError = Math.min(
    VALIDATION_LIMITS.MARGEN_ERROR_MAX,
    Math.max(VALIDATION_LIMITS.MARGEN_ERROR_MIN, Number(config.margen_error_pct) || 5)
  );
  const tamanoMuestra = Math.min(
    VALIDATION_LIMITS.MUESTRA_MAX,
    Math.max(1, Math.round(Number(config.tamano_muestra_n) || 1))
  );

  const base = {
    titulo: clampText(config.titulo, VALIDATION_LIMITS.TITULO_MAX, 'Nueva Encuesta'),
    universo_N: universoN,
    nivel_confianza_pct: confianza,
    margen_error_pct: margenError,
    tamano_muestra_n: tamanoMuestra,
    politica_cuota_estricta: Boolean(config.politica_cuota_estricta),
    version_instrumento: clampText(
      config.version_instrumento,
      VALIDATION_LIMITS.VERSION_MAX,
      'v1.0'
    ),
    modalidad_recoleccion: normalizeModalidad(config.modalidad_recoleccion),
    updatedAt: serverTimestamp()
  };

  if (isCreate) {
    return {
      ...base,
      ownerId: uid,
      estudio_id: sanitizeValidId(config.estudio_id || 'EST-2026', VALIDATION_LIMITS.ID_MAX),
      createdAt: serverTimestamp()
    };
  }

  return base;
}

function sanitizeQuestionPayload(
  uid: string,
  studyId: string,
  p: PreguntaInstrumento,
  cawiEnabled: boolean
) {
  const cleanId = sanitizeValidId(p.id, VALIDATION_LIMITS.SHORT_ID_MAX);
  const cleanAlts = (Array.isArray(p.alternativas) ? p.alternativas : [])
    .slice(0, VALIDATION_LIMITS.ALTERNATIVAS_MAX)
    .map((alt) => clampText(String(alt), VALIDATION_LIMITS.ALTERNATIVA_ITEM_MAX))
    .filter(Boolean);

  return {
    id: cleanId,
    studyId,
    ownerId: uid,
    orden: Math.min(VALIDATION_LIMITS.QUESTION_ORDEN_MAX, Math.max(1, Math.round(p.orden || 1))),
    texto: clampText(p.texto, VALIDATION_LIMITS.QUESTION_TEXT_MAX, 'Pregunta sin texto'),
    tipo: p.tipo,
    alternativas: cleanAlts,
    obligatoria: Boolean(p.obligatoria),
    salto_logico: clampText(p.salto_logico, VALIDATION_LIMITS.SALTO_LOGICO_MAX),
    cawiEnabled,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function sanitizeQuotaPayload(
  uid: string,
  studyId: string,
  c: CuotaDemografica,
  cawiEnabled: boolean
) {
  const cleanId = sanitizeValidId(c.id, VALIDATION_LIMITS.SHORT_ID_MAX);
  return {
    id: cleanId,
    studyId,
    ownerId: uid,
    macro_zona: clampText(c.macro_zona, VALIDATION_LIMITS.MACRO_ZONA_MAX, 'General'),
    rango_etario: clampText(c.rango_etario, VALIDATION_LIMITS.RANGO_ETARIO_MAX, '18-29'),
    genero: clampText(c.genero, VALIDATION_LIMITS.GENERO_MAX, 'Femenino'),
    meta: Math.min(VALIDATION_LIMITS.QUOTA_META_MAX, Math.max(1, Math.round(c.meta || 1))),
    actual: Math.min(VALIDATION_LIMITS.QUOTA_META_MAX, Math.max(0, Math.round(c.actual || 0))),
    cawiEnabled,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function sanitizeResponsePayload(
  uid: string,
  studyId: string,
  r: RespuestaAnonimaRow
) {
  const cleanUuid = sanitizeValidId(r.uuid_respuesta, VALIDATION_LIMITS.ID_MAX);
  let parsedMap: Record<string, string | number> = {};
  try {
    const raw = JSON.parse(r.respuestas_json || '{}') as Record<string, unknown>;
    const entries = Object.entries(raw).slice(0, VALIDATION_LIMITS.RESPUESTAS_KEYS_MAX);
    entries.forEach(([k, v]) => {
      if (typeof v === 'number' && Number.isFinite(v)) {
        parsedMap[k] = v;
      } else {
        parsedMap[k] = clampText(String(v ?? ''), 1000);
      }
    });
  } catch {
    parsedMap = {};
  }

  return {
    uuid_respuesta: cleanUuid,
    studyId,
    ownerId: uid,
    timestamp_captura: clampText(
      r.timestamp_captura,
      VALIDATION_LIMITS.TIMESTAMP_STR_MAX,
      new Date().toISOString()
    ),
    timestamp_sync: clampText(
      r.timestamp_sync,
      VALIDATION_LIMITS.TIMESTAMP_STR_MAX,
      new Date().toISOString()
    ),
    macro_zona: clampText(r.macro_zona, VALIDATION_LIMITS.MACRO_ZONA_MAX, 'General'),
    rango_etario: clampText(r.rango_etario, VALIDATION_LIMITS.RANGO_ETARIO_MAX),
    genero: clampText(r.genero, VALIDATION_LIMITS.GENERO_MAX),
    estado_cuota: r.estado_cuota === 'SOBRECUPO_ALERTA' ? 'SOBRECUPO_ALERTA' : 'ACEPTADA',
    respuestas: parsedMap,
    createdAt: serverTimestamp()
  };
}

function sanitizeAuditPayload(
  uid: string,
  studyId: string,
  a: AuditoriaDesvinculadaRow
) {
  const cleanId = sanitizeValidId(a.id_evento_auditoria, VALIDATION_LIMITS.ID_MAX);
  return {
    id_evento_auditoria: cleanId,
    studyId,
    ownerId: uid,
    fecha_registro: clampText(
      a.fecha_registro,
      VALIDATION_LIMITS.TIMESTAMP_STR_MAX,
      new Date().toISOString()
    ),
    operador_codigo: clampText(
      a.operador_codigo,
      VALIDATION_LIMITS.OPERADOR_MAX,
      'Encuestador'
    ),
    macro_zona_aprox: clampText(
      a.macro_zona_aprox,
      VALIDATION_LIMITS.MACRO_ZONA_MAX,
      'General'
    ),
    consentimiento_opt_in: Boolean(a.consentimiento_opt_in),
    nota_contacto_opcional: clampText(
      a.nota_contacto_opcional,
      VALIDATION_LIMITS.CONTACTO_OPCIONAL_MAX
    ),
    createdAt: serverTimestamp()
  };
}

export async function ensureUserStudy(
  uid: string,
  localState: {
    config: ConfiguracionEncuesta;
    preguntas: PreguntaInstrumento[];
    cuotas: CuotaDemografica[];
    respuestas: RespuestaAnonimaRow[];
    auditoria: AuditoriaDesvinculadaRow[];
  }
): Promise<string> {
  const studiesPath = 'studies';
  try {
    const q = query(
      collection(db, studiesPath),
      where('ownerId', '==', uid),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].id;
    }

    const studyId = buildStudyDocId(uid, localState.config.estudio_id);
    const studyRef = doc(db, studiesPath, studyId);
    const cawiEnabled = normalizeModalidad(localState.config.modalidad_recoleccion) !== 'solo_encuestador';
    await setDoc(studyRef, sanitizeStudyPayload(uid, localState.config, true));

    const hasLocalItems =
      localState.preguntas.length > 0 ||
      localState.cuotas.length > 0 ||
      localState.respuestas.length > 0 ||
      localState.auditoria.length > 0;

    if (hasLocalItems) {
      const batch = writeBatch(db);
      localState.preguntas.forEach((p) => {
        const cleanP = sanitizeQuestionPayload(uid, studyId, p, cawiEnabled);
        batch.set(doc(db, studiesPath, studyId, 'questions', cleanP.id), cleanP);
      });
      localState.cuotas.forEach((c) => {
        const cleanC = sanitizeQuotaPayload(uid, studyId, c, cawiEnabled);
        batch.set(doc(db, studiesPath, studyId, 'quotas', cleanC.id), cleanC);
      });
      localState.respuestas.forEach((r) => {
        const cleanR = sanitizeResponsePayload(uid, studyId, r);
        batch.set(
          doc(db, studiesPath, studyId, 'responses', cleanR.uuid_respuesta),
          cleanR
        );
      });
      localState.auditoria.forEach((a) => {
        const cleanA = sanitizeAuditPayload(uid, studyId, a);
        batch.set(
          doc(db, studiesPath, studyId, 'audits', cleanA.id_evento_auditoria),
          cleanA
        );
      });
      await batch.commit();
    }

    return studyId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, studiesPath);
  }
}

export function subscribeStudyRealtime(
  uid: string,
  studyId: string,
  callbacks: {
    onConfig: (config: ConfiguracionEncuesta) => void;
    onPreguntas: (preguntas: PreguntaInstrumento[]) => void;
    onCuotas: (cuotas: CuotaDemografica[]) => void;
    onRespuestas: (respuestas: RespuestaAnonimaRow[]) => void;
    onAuditoria: (auditoria: AuditoriaDesvinculadaRow[]) => void;
    onError: (err: Error) => void;
  }
): () => void {
  const studyPath = `studies/${studyId}`;
  const unsubStudy = onSnapshot(
    doc(db, 'studies', studyId),
    (snapshot) => {
      if (!snapshot.exists()) return;
      const d = snapshot.data();
      callbacks.onConfig({
        estudio_id: String(d.estudio_id || 'EST-2026'),
        titulo: String(d.titulo || 'Nueva Encuesta'),
        universo_N: Number(d.universo_N || 1000),
        nivel_confianza_pct:
          d.nivel_confianza_pct === 90 || d.nivel_confianza_pct === 99
            ? d.nivel_confianza_pct
            : 95,
        margen_error_pct: Number(d.margen_error_pct || 5),
        tamano_muestra_n: Number(d.tamano_muestra_n || 278),
        politica_cuota_estricta: Boolean(d.politica_cuota_estricta),
        version_instrumento: String(d.version_instrumento || 'v1.0'),
        modalidad_recoleccion: normalizeModalidad(d.modalidad_recoleccion)
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, studyPath);
      } catch (e) {
        callbacks.onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  const questionsPath = `${studyPath}/questions`;
  const unsubQuestions = onSnapshot(
    query(collection(db, 'studies', studyId, 'questions'), where('ownerId', '==', uid)),
    (snapshot) => {
      const list: PreguntaInstrumento[] = snapshot.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: String(d.id || docSnap.id),
            orden: Number(d.orden || 1),
            texto: String(d.texto || ''),
            tipo: d.tipo as PreguntaInstrumento['tipo'],
            alternativas: Array.isArray(d.alternativas)
              ? d.alternativas.map((x) => String(x))
              : [],
            obligatoria: Boolean(d.obligatoria),
            salto_logico: String(d.salto_logico || '')
          };
        })
        .sort((a, b) => a.orden - b.orden);
      callbacks.onPreguntas(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, questionsPath);
      } catch (e) {
        callbacks.onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  const quotasPath = `${studyPath}/quotas`;
  const unsubQuotas = onSnapshot(
    query(collection(db, 'studies', studyId, 'quotas'), where('ownerId', '==', uid)),
    (snapshot) => {
      const list: CuotaDemografica[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: String(d.id || docSnap.id),
          macro_zona: String(d.macro_zona || ''),
          rango_etario: String(d.rango_etario || ''),
          genero: String(d.genero || ''),
          meta: Number(d.meta || 0),
          actual: Number(d.actual || 0)
        };
      });
      callbacks.onCuotas(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, quotasPath);
      } catch (e) {
        callbacks.onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  const responsesPath = `${studyPath}/responses`;
  const unsubResponses = onSnapshot(
    query(collection(db, 'studies', studyId, 'responses'), where('ownerId', '==', uid)),
    (snapshot) => {
      const list: RespuestaAnonimaRow[] = snapshot.docs
        .map((docSnap) => {
          const d = docSnap.data();
          const respuestasMap =
            d.respuestas && typeof d.respuestas === 'object' ? d.respuestas : {};
          const estadoCuota: 'ACEPTADA' | 'SOBRECUPO_ALERTA' =
            d.estado_cuota === 'SOBRECUPO_ALERTA' ? 'SOBRECUPO_ALERTA' : 'ACEPTADA';
          return {
            uuid_respuesta: String(d.uuid_respuesta || docSnap.id),
            timestamp_captura: String(d.timestamp_captura || ''),
            timestamp_sync: String(d.timestamp_sync || ''),
            macro_zona: String(d.macro_zona || ''),
            rango_etario: String(d.rango_etario || ''),
            genero: String(d.genero || ''),
            estado_cuota: estadoCuota,
            respuestas_json: JSON.stringify(respuestasMap)
          };
        })
        .sort((a, b) => b.timestamp_sync.localeCompare(a.timestamp_sync));
      callbacks.onRespuestas(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, responsesPath);
      } catch (e) {
        callbacks.onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  const auditsPath = `${studyPath}/audits`;
  const unsubAudits = onSnapshot(
    query(collection(db, 'studies', studyId, 'audits'), where('ownerId', '==', uid)),
    (snapshot) => {
      const list: AuditoriaDesvinculadaRow[] = snapshot.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id_evento_auditoria: String(d.id_evento_auditoria || docSnap.id),
            fecha_registro: String(d.fecha_registro || ''),
            operador_codigo: String(d.operador_codigo || ''),
            macro_zona_aprox: String(d.macro_zona_aprox || ''),
            consentimiento_opt_in: Boolean(d.consentimiento_opt_in),
            nota_contacto_opcional: String(d.nota_contacto_opcional || '')
          };
        })
        .sort((a, b) => b.fecha_registro.localeCompare(a.fecha_registro));
      callbacks.onAuditoria(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, auditsPath);
      } catch (e) {
        callbacks.onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  return () => {
    unsubStudy();
    unsubQuestions();
    unsubQuotas();
    unsubResponses();
    unsubAudits();
  };
}

export async function updateStudyConfigInFirestore(
  uid: string,
  studyId: string,
  config: ConfiguracionEncuesta,
  syncCawiFlagOnSubcollections = false
) {
  const path = `studies/${studyId}`;
  try {
    await updateDoc(doc(db, 'studies', studyId), sanitizeStudyPayload(uid, config, false));

    if (syncCawiFlagOnSubcollections) {
      const cawiEnabled =
        normalizeModalidad(config.modalidad_recoleccion) !== 'solo_encuestador';
      const batch = writeBatch(db);
      const qSnap = await getDocs(
        query(collection(db, 'studies', studyId, 'questions'), where('ownerId', '==', uid))
      );
      qSnap.docs.forEach((d) => {
        batch.update(d.ref, { cawiEnabled, updatedAt: serverTimestamp() });
      });
      const cSnap = await getDocs(
        query(collection(db, 'studies', studyId, 'quotas'), where('ownerId', '==', uid))
      );
      cSnap.docs.forEach((d) => {
        batch.update(d.ref, { cawiEnabled, updatedAt: serverTimestamp() });
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function addQuestionInFirestore(
  uid: string,
  studyId: string,
  pregunta: PreguntaInstrumento,
  modalidad: ModalidadRecoleccion
) {
  const cawiEnabled = normalizeModalidad(modalidad) !== 'solo_encuestador';
  const cleanP = sanitizeQuestionPayload(uid, studyId, pregunta, cawiEnabled);
  const path = `studies/${studyId}/questions/${cleanP.id}`;
  try {
    await setDoc(doc(db, 'studies', studyId, 'questions', cleanP.id), cleanP);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteQuestionInFirestore(studyId: string, questionId: string) {
  const cleanId = sanitizeValidId(questionId, VALIDATION_LIMITS.SHORT_ID_MAX);
  const path = `studies/${studyId}/questions/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'studies', studyId, 'questions', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function addQuotaInFirestore(
  uid: string,
  studyId: string,
  cuota: CuotaDemografica,
  modalidad: ModalidadRecoleccion
) {
  const cawiEnabled = normalizeModalidad(modalidad) !== 'solo_encuestador';
  const cleanC = sanitizeQuotaPayload(uid, studyId, cuota, cawiEnabled);
  const path = `studies/${studyId}/quotas/${cleanC.id}`;
  try {
    await setDoc(doc(db, 'studies', studyId, 'quotas', cleanC.id), cleanC);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteQuotaInFirestore(studyId: string, quotaId: string) {
  const cleanId = sanitizeValidId(quotaId, VALIDATION_LIMITS.SHORT_ID_MAX);
  const path = `studies/${studyId}/quotas/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'studies', studyId, 'quotas', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveBatchToFirestore(
  uid: string,
  studyId: string,
  nuevasRespuestas: RespuestaAnonimaRow[],
  nuevasAuditorias: AuditoriaDesvinculadaRow[],
  cuotasActualizadas: CuotaDemografica[]
) {
  if (nuevasRespuestas.length === 0) return;
  const path = `studies/${studyId}/responses`;
  try {
    const batch = writeBatch(db);

    nuevasRespuestas.forEach((r) => {
      const cleanR = sanitizeResponsePayload(uid, studyId, r);
      batch.set(doc(db, 'studies', studyId, 'responses', cleanR.uuid_respuesta), cleanR);
    });

    nuevasAuditorias.forEach((a) => {
      const cleanA = sanitizeAuditPayload(uid, studyId, a);
      batch.set(
        doc(db, 'studies', studyId, 'audits', cleanA.id_evento_auditoria),
        cleanA
      );
    });

    cuotasActualizadas.forEach((c) => {
      const cleanId = sanitizeValidId(c.id, VALIDATION_LIMITS.SHORT_ID_MAX);
      batch.update(doc(db, 'studies', studyId, 'quotas', cleanId), {
        actual: Math.min(VALIDATION_LIMITS.QUOTA_META_MAX, Math.max(0, Math.round(c.actual || 0))),
        updatedAt: serverTimestamp()
      });
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function resetStudyDataInFirestore(
  uid: string,
  studyId: string,
  initialConfig: ConfiguracionEncuesta
) {
  const path = `studies/${studyId}`;
  try {
    const batch = writeBatch(db);
    batch.update(
      doc(db, 'studies', studyId),
      sanitizeStudyPayload(uid, initialConfig, false)
    );

    const subcols = ['questions', 'quotas', 'responses', 'audits'] as const;
    for (const colName of subcols) {
      const snap = await getDocs(
        query(collection(db, 'studies', studyId, colName), where('ownerId', '==', uid))
      );
      snap.docs.forEach((d) => batch.delete(d.ref));
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface PublicCawiStudyBundle {
  studyId: string;
  ownerId: string;
  config: ConfiguracionEncuesta;
  preguntas: PreguntaInstrumento[];
  cuotas: CuotaDemografica[];
}

export async function loadPublicCawiStudy(
  rawStudyId: string
): Promise<PublicCawiStudyBundle | null> {
  const studyId = sanitizeValidId(rawStudyId, VALIDATION_LIMITS.ID_MAX);
  const studyPath = `studies/${studyId}`;
  try {
    const studySnap = await getDoc(doc(db, 'studies', studyId));
    if (!studySnap.exists()) {
      return null;
    }

    const d = studySnap.data();
    const modalidad = normalizeModalidad(d.modalidad_recoleccion);
    const config: ConfiguracionEncuesta = {
      estudio_id: String(d.estudio_id || 'EST-2026'),
      titulo: String(d.titulo || 'Encuesta'),
      universo_N: Number(d.universo_N || 1000),
      nivel_confianza_pct:
        d.nivel_confianza_pct === 90 || d.nivel_confianza_pct === 99
          ? d.nivel_confianza_pct
          : 95,
      margen_error_pct: Number(d.margen_error_pct || 5),
      tamano_muestra_n: Number(d.tamano_muestra_n || 278),
      politica_cuota_estricta: Boolean(d.politica_cuota_estricta),
      version_instrumento: String(d.version_instrumento || 'v1.0'),
      modalidad_recoleccion: modalidad
    };

    if (modalidad === 'solo_encuestador') {
      return {
        studyId,
        ownerId: String(d.ownerId || ''),
        config,
        preguntas: [],
        cuotas: []
      };
    }

    const qSnap = await getDocs(
      query(
        collection(db, 'studies', studyId, 'questions'),
        where('cawiEnabled', '==', true)
      )
    );
    const preguntas: PreguntaInstrumento[] = qSnap.docs
      .map((docSnap) => {
        const qd = docSnap.data();
        return {
          id: String(qd.id || docSnap.id),
          orden: Number(qd.orden || 1),
          texto: String(qd.texto || ''),
          tipo: qd.tipo as PreguntaInstrumento['tipo'],
          alternativas: Array.isArray(qd.alternativas)
            ? qd.alternativas.map((x) => String(x))
            : [],
          obligatoria: Boolean(qd.obligatoria),
          salto_logico: String(qd.salto_logico || '')
        };
      })
      .sort((a, b) => a.orden - b.orden);

    const cSnap = await getDocs(
      query(
        collection(db, 'studies', studyId, 'quotas'),
        where('cawiEnabled', '==', true)
      )
    );
    const cuotas: CuotaDemografica[] = cSnap.docs.map((docSnap) => {
      const cd = docSnap.data();
      return {
        id: String(cd.id || docSnap.id),
        macro_zona: String(cd.macro_zona || ''),
        rango_etario: String(cd.rango_etario || ''),
        genero: String(cd.genero || ''),
        meta: Number(cd.meta || 0),
        actual: Number(cd.actual || 0)
      };
    });

    return {
      studyId,
      ownerId: String(d.ownerId || ''),
      config,
      preguntas,
      cuotas
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, studyPath);
  }
}

export async function submitPublicCawiResponse(
  studyId: string,
  ownerId: string,
  item: EncuestaPendienteOffline,
  matchingQuota: CuotaDemografica | null,
  politicaCuotaEstricta: boolean
): Promise<void> {
  const cleanStudyId = sanitizeValidId(studyId, VALIDATION_LIMITS.ID_MAX);
  const path = `studies/${cleanStudyId}/responses`;

  let estadoCuota: 'ACEPTADA' | 'SOBRECUPO_ALERTA' = 'ACEPTADA';
  if (matchingQuota && matchingQuota.actual >= matchingQuota.meta) {
    if (politicaCuotaEstricta) {
      throw new Error('El cupo para tu segmento demográfico ya se encuentra completo.');
    }
    estadoCuota = 'SOBRECUPO_ALERTA';
  }

  const ahoraIso = new Date().toISOString();
  const cleanUuid = sanitizeValidId(item.uuid, VALIDATION_LIMITS.ID_MAX);
  const auditId = sanitizeValidId(
    'AUD-' + Math.random().toString(16).slice(2, 10) + Date.now().toString(36),
    VALIDATION_LIMITS.ID_MAX
  );

  const responseDoc = sanitizeResponsePayload(ownerId, cleanStudyId, {
    uuid_respuesta: cleanUuid,
    timestamp_captura: item.timestamp_captura,
    timestamp_sync: ahoraIso,
    macro_zona: item.macro_zona,
    rango_etario: item.rango_etario,
    genero: item.genero,
    estado_cuota: estadoCuota,
    respuestas_json: JSON.stringify(item.respuestas)
  });

  const auditDoc = sanitizeAuditPayload(ownerId, cleanStudyId, {
    id_evento_auditoria: auditId,
    fecha_registro: ahoraIso,
    operador_codigo: 'CAWI-Autoadministrado',
    macro_zona_aprox: item.macro_zona,
    consentimiento_opt_in: item.consentimiento_opt_in,
    nota_contacto_opcional: item.contacto_opcional
  });

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'studies', cleanStudyId, 'responses', cleanUuid), responseDoc);
    batch.set(doc(db, 'studies', cleanStudyId, 'audits', auditId), auditDoc);

    if (matchingQuota) {
      const cleanQuotaId = sanitizeValidId(matchingQuota.id, VALIDATION_LIMITS.SHORT_ID_MAX);
      batch.update(doc(db, 'studies', cleanStudyId, 'quotas', cleanQuotaId), {
        actual: Math.min(
          VALIDATION_LIMITS.QUOTA_META_MAX,
          Math.max(0, Math.round(matchingQuota.actual) + 1)
        ),
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
