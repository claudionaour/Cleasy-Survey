import { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { LogOut, Plus } from 'lucide-react';
import { BuilderAndQuotasPanel } from './components/BuilderAndQuotasPanel';
import { FieldSurveyRunner } from './components/FieldSurveyRunner';
import { Phase4DashboardPanel } from './components/Phase4DashboardPanel';
import {
  INITIAL_AUDITORIA,
  INITIAL_CONFIG,
  INITIAL_CUOTAS,
  INITIAL_OFFLINE_QUEUE,
  INITIAL_PREGUNTAS,
  INITIAL_RESPUESTAS
} from './data/initialWorkbook';
import {
  AuditoriaDesvinculadaRow,
  ConfiguracionEncuesta,
  CuotaDemografica,
  EncuestaPendienteOffline,
  EventoLockLog,
  PreguntaInstrumento,
  RespuestaAnonimaRow
} from './types/survey';
import {
  addQuestionInFirestore,
  addQuotaInFirestore,
  deleteQuestionInFirestore,
  deleteQuotaInFirestore,
  ensureUserStudy,
  resetStudyDataInFirestore,
  saveBatchToFirestore,
  subscribeStudyRealtime,
  updateStudyConfigInFirestore
} from './utils/firestoreService';
import {
  googleSignIn,
  logout,
  subscribeFirebaseAuth
} from './utils/googleAuth';

type VistaActiva = 'encuestar' | 'constructor' | 'resultados';

const STORAGE_KEYS = {
  CONFIG: 'cleasy_prod_config_v1',
  COLA: 'cleasy_prod_offline_queue_v1',
  CUOTAS: 'cleasy_prod_cuotas_v1',
  RESPUESTAS: 'cleasy_prod_respuestas_v1',
  AUDITORIA: 'cleasy_prod_auditoria_v1',
  PREGUNTAS: 'cleasy_prod_preguntas_v1'
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [vista, setVista] = useState<VistaActiva>('encuestar');
  const [pasoEncuesta, setPasoEncuesta] = useState<'optin' | 'preguntas' | 'exito'>('optin');
  const [enLinea, setEnLinea] = useState<boolean>(true);
  const [config, setConfig] = useState<ConfiguracionEncuesta>(() =>
    readStorage(STORAGE_KEYS.CONFIG, INITIAL_CONFIG)
  );
  const [preguntas, setPreguntas] = useState<PreguntaInstrumento[]>(() =>
    readStorage(STORAGE_KEYS.PREGUNTAS, INITIAL_PREGUNTAS)
  );
  const [cuotas, setCuotas] = useState<CuotaDemografica[]>(() =>
    readStorage(STORAGE_KEYS.CUOTAS, INITIAL_CUOTAS)
  );
  const [respuestas, setRespuestas] = useState<RespuestaAnonimaRow[]>(() =>
    readStorage(STORAGE_KEYS.RESPUESTAS, INITIAL_RESPUESTAS)
  );
  const [auditoria, setAuditoria] = useState<AuditoriaDesvinculadaRow[]>(() =>
    readStorage(STORAGE_KEYS.AUDITORIA, INITIAL_AUDITORIA)
  );
  const [colaOffline, setColaOffline] = useState<EncuestaPendienteOffline[]>(() =>
    readStorage(STORAGE_KEYS.COLA, INITIAL_OFFLINE_QUEUE)
  );
  const [logsLock, setLogsLock] = useState<EventoLockLog[]>([]);

  // Firebase Auth + Firestore real-time state
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [activeStudyId, setActiveStudyId] = useState<string | null>(null);
  const [connectingFirebase, setConnectingFirebase] = useState<boolean>(false);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);

  const configDebounceRef = useRef<number | null>(null);
  const configDirtyRef = useRef<boolean>(false);
  const latestLocalSnapshotRef = useRef({
    config,
    preguntas,
    cuotas,
    respuestas,
    auditoria
  });
  latestLocalSnapshotRef.current = {
    config,
    preguntas,
    cuotas,
    respuestas,
    auditoria
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
      localStorage.setItem(STORAGE_KEYS.COLA, JSON.stringify(colaOffline));
      localStorage.setItem(STORAGE_KEYS.CUOTAS, JSON.stringify(cuotas));
      localStorage.setItem(STORAGE_KEYS.RESPUESTAS, JSON.stringify(respuestas));
      localStorage.setItem(STORAGE_KEYS.AUDITORIA, JSON.stringify(auditoria));
      localStorage.setItem(STORAGE_KEYS.PREGUNTAS, JSON.stringify(preguntas));
    } catch {
      // Ignorar si almacenamiento está restringido
    }
  }, [config, colaOffline, cuotas, respuestas, auditoria, preguntas]);

  // Escuchar sesión de Firebase Authentication
  useEffect(() => {
    const unsub = subscribeFirebaseAuth((user, ready) => {
      setFirebaseUser(user);
      setAuthReady(ready);
      if (!user) {
        setActiveStudyId(null);
      }
    });
    return () => unsub();
  }, []);

  // Conectar e inicializar el estudio en Cloud Firestore cuando el usuario está autenticado
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    let cancelled = false;
    let unsubFirestore: (() => void) | null = null;

    const connectStudy = async () => {
      try {
        setFirebaseError(null);
        const studyId = await ensureUserStudy(
          firebaseUser.uid,
          latestLocalSnapshotRef.current
        );
        if (cancelled) return;
        setActiveStudyId(studyId);

        unsubFirestore = subscribeStudyRealtime(firebaseUser.uid, studyId, {
          onConfig: (remoteConfig) => {
            if (!configDirtyRef.current) {
              setConfig(remoteConfig);
            }
          },
          onPreguntas: setPreguntas,
          onCuotas: setCuotas,
          onRespuestas: setRespuestas,
          onAuditoria: setAuditoria,
          onError: (err) => {
            setFirebaseError(err.message);
          }
        });
      } catch (err: unknown) {
        if (!cancelled) {
          setFirebaseError(
            err instanceof Error ? err.message : 'No se pudo conectar con Firestore.'
          );
        }
      }
    };

    void connectStudy();

    return () => {
      cancelled = true;
      if (unsubFirestore) unsubFirestore();
    };
  }, [authReady, firebaseUser]);

  const handleConectarFirebase = async () => {
    setConnectingFirebase(true);
    setFirebaseError(null);
    try {
      await googleSignIn();
    } catch (err: unknown) {
      setFirebaseError(
        err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google.'
      );
    } finally {
      setConnectingFirebase(false);
    }
  };

  const handleCerrarSesionFirebase = async () => {
    await logout();
    setActiveStudyId(null);
    setFirebaseError(null);
  };

  const procesarLote = (
    lote: EncuestaPendienteOffline[],
    cuotasActuales: CuotaDemografica[],
    respuestasActuales: RespuestaAnonimaRow[],
    auditoriaActual: AuditoriaDesvinculadaRow[],
    etiquetaOperador: string
  ) => {
    const uuidsExistentes = new Set(respuestasActuales.map((r) => r.uuid_respuesta));
    const cuotasClon = cuotasActuales.map((c) => ({ ...c }));
    const cuotasModificadasIds = new Set<string>();
    const nuevasRespuestas: RespuestaAnonimaRow[] = [];
    const nuevasAuditorias: AuditoriaDesvinculadaRow[] = [];
    const ahoraIso = new Date().toISOString();

    let guardadas = 0;
    let duplicadas = 0;
    let rechazadas = 0;

    for (const item of lote) {
      if (!item.consentimiento_opt_in) {
        rechazadas++;
        continue;
      }
      if (uuidsExistentes.has(item.uuid)) {
        duplicadas++;
        continue;
      }

      const cuota = cuotasClon.find(
        (c) =>
          c.macro_zona.toLowerCase() === item.macro_zona.toLowerCase() &&
          c.rango_etario === item.rango_etario &&
          c.genero === item.genero
      );

      let estadoCuota: 'ACEPTADA' | 'SOBRECUPO_ALERTA' = 'ACEPTADA';

      if (cuota) {
        if (cuota.actual >= cuota.meta) {
          if (config.politica_cuota_estricta) {
            rechazadas++;
            continue;
          }
          estadoCuota = 'SOBRECUPO_ALERTA';
        }
        cuota.actual += 1;
        cuotasModificadasIds.add(cuota.id);
      } else if (config.politica_cuota_estricta && cuotasClon.length > 0) {
        rechazadas++;
        continue;
      }

      nuevasRespuestas.push({
        uuid_respuesta: item.uuid,
        timestamp_captura: item.timestamp_captura,
        timestamp_sync: ahoraIso,
        macro_zona: item.macro_zona,
        rango_etario: item.rango_etario,
        genero: item.genero,
        estado_cuota: estadoCuota,
        respuestas_json: JSON.stringify(item.respuestas)
      });

      nuevasAuditorias.push({
        id_evento_auditoria: 'AUD-' + Math.random().toString(16).slice(2, 10),
        fecha_registro: ahoraIso,
        operador_codigo: item.operador_codigo,
        macro_zona_aprox: item.macro_zona,
        consentimiento_opt_in: true,
        nota_contacto_opcional: item.contacto_opcional
      });

      uuidsExistentes.add(item.uuid);
      guardadas++;
    }

    const log: EventoLockLog = {
      id: 'LOG-' + Date.now() + '-' + Math.random().toString(16).slice(2, 6),
      hora: new Date().toLocaleTimeString('es-CL', { hour12: false }),
      operador: etiquetaOperador,
      duracionMs: 0,
      loteTamano: lote.length,
      guardadas,
      duplicadas,
      rechazadas,
      mensaje:
        guardadas > 0
          ? `${guardadas} respuesta(s) registrada(s) de forma anónima.`
          : `Sin nuevas filas (${duplicadas} duplicadas, ${rechazadas} rechazadas por cuota).`
    };

    const cuotasActualizadas = cuotasClon.filter((c) => cuotasModificadasIds.has(c.id));

    return {
      cuotasClon,
      cuotasActualizadas,
      nuevasRespuestas,
      nuevasAuditorias,
      respuestasFinal: [...nuevasRespuestas, ...respuestasActuales],
      auditoriaFinal: [...nuevasAuditorias, ...auditoriaActual],
      log
    };
  };

  const persistirLoteEnNube = (
    nuevasRespuestas: RespuestaAnonimaRow[],
    nuevasAuditorias: AuditoriaDesvinculadaRow[],
    cuotasActualizadas: CuotaDemografica[]
  ) => {
    if (!firebaseUser || !activeStudyId || nuevasRespuestas.length === 0) return;
    void saveBatchToFirestore(
      firebaseUser.uid,
      activeStudyId,
      nuevasRespuestas,
      nuevasAuditorias,
      cuotasActualizadas
    ).catch((err: unknown) => {
      setFirebaseError(err instanceof Error ? err.message : 'Error sincronizando en Firestore.');
    });
  };

  const handleUpdateConfig = (next: ConfiguracionEncuesta) => {
    setConfig(next);
    if (!firebaseUser || !activeStudyId) return;

    configDirtyRef.current = true;
    if (configDebounceRef.current !== null) {
      window.clearTimeout(configDebounceRef.current);
    }
    configDebounceRef.current = window.setTimeout(() => {
      const uid = firebaseUser.uid;
      const studyId = activeStudyId;
      void updateStudyConfigInFirestore(uid, studyId, next)
        .catch((err: unknown) => {
          setFirebaseError(
            err instanceof Error ? err.message : 'Error guardando configuración en Firestore.'
          );
        })
        .finally(() => {
          configDirtyRef.current = false;
        });
    }, 500);
  };

  const handleGuardarRespuesta = (item: EncuestaPendienteOffline) => {
    if (enLinea) {
      const resultado = procesarLote(
        [item],
        cuotas,
        respuestas,
        auditoria,
        item.operador_codigo || 'Captura en línea'
      );
      setCuotas(resultado.cuotasClon);
      setRespuestas(resultado.respuestasFinal);
      setAuditoria(resultado.auditoriaFinal);
      setLogsLock((prev) => [resultado.log, ...prev]);
      persistirLoteEnNube(
        resultado.nuevasRespuestas,
        resultado.nuevasAuditorias,
        resultado.cuotasActualizadas
      );
    } else {
      setColaOffline((prev) => [item, ...prev]);
    }
  };

  const handleEjecutarGuardarLote = () => {
    if (!enLinea || colaOffline.length === 0) return;
    const resultado = procesarLote(
      colaOffline,
      cuotas,
      respuestas,
      auditoria,
      'Sincronización Offline'
    );
    setCuotas(resultado.cuotasClon);
    setRespuestas(resultado.respuestasFinal);
    setAuditoria(resultado.auditoriaFinal);
    setColaOffline([]);
    setLogsLock((prev) => [resultado.log, ...prev]);
    persistirLoteEnNube(
      resultado.nuevasRespuestas,
      resultado.nuevasAuditorias,
      resultado.cuotasActualizadas
    );
  };

  const handleToggleEnLinea = () => {
    const proximoEstado = !enLinea;
    setEnLinea(proximoEstado);
    if (proximoEstado && colaOffline.length > 0) {
      const resultado = procesarLote(
        colaOffline,
        cuotas,
        respuestas,
        auditoria,
        'Sincronización automática'
      );
      setCuotas(resultado.cuotasClon);
      setRespuestas(resultado.respuestasFinal);
      setAuditoria(resultado.auditoriaFinal);
      setColaOffline([]);
      setLogsLock((prev) => [resultado.log, ...prev]);
      persistirLoteEnNube(
        resultado.nuevasRespuestas,
        resultado.nuevasAuditorias,
        resultado.cuotasActualizadas
      );
    }
  };

  const handleReiniciarDatos = () => {
    setConfig(INITIAL_CONFIG);
    setPreguntas(INITIAL_PREGUNTAS);
    setCuotas(INITIAL_CUOTAS);
    setRespuestas(INITIAL_RESPUESTAS);
    setAuditoria(INITIAL_AUDITORIA);
    setColaOffline(INITIAL_OFFLINE_QUEUE);
    setLogsLock([]);
    setPasoEncuesta('optin');
    if (firebaseUser && activeStudyId) {
      void resetStudyDataInFirestore(firebaseUser.uid, activeStudyId, INITIAL_CONFIG).catch(
        (err: unknown) => {
          setFirebaseError(
            err instanceof Error ? err.message : 'Error reiniciando estudio en Firestore.'
          );
        }
      );
    }
  };

  const handleAddPregunta = (nueva: PreguntaInstrumento) => {
    setPreguntas((prev) => [...prev, nueva]);
    if (firebaseUser && activeStudyId) {
      void addQuestionInFirestore(firebaseUser.uid, activeStudyId, nueva).catch(
        (err: unknown) => {
          setFirebaseError(
            err instanceof Error ? err.message : 'Error guardando pregunta en Firestore.'
          );
        }
      );
    }
  };

  const handleRemovePregunta = (id: string) => {
    setPreguntas((prev) => prev.filter((p) => p.id !== id));
    if (firebaseUser && activeStudyId) {
      void deleteQuestionInFirestore(activeStudyId, id).catch((err: unknown) => {
        setFirebaseError(
          err instanceof Error ? err.message : 'Error eliminando pregunta en Firestore.'
        );
      });
    }
  };

  const handleAddCuota = (nueva: CuotaDemografica) => {
    setCuotas((prev) => [...prev, nueva]);
    if (firebaseUser && activeStudyId) {
      void addQuotaInFirestore(firebaseUser.uid, activeStudyId, nueva).catch((err: unknown) => {
        setFirebaseError(
          err instanceof Error ? err.message : 'Error guardando cuota en Firestore.'
        );
      });
    }
  };

  const handleRemoveCuota = (id: string) => {
    setCuotas((prev) => prev.filter((c) => c.id !== id));
    if (firebaseUser && activeStudyId) {
      void deleteQuotaInFirestore(activeStudyId, id).catch((err: unknown) => {
        setFirebaseError(
          err instanceof Error ? err.message : 'Error eliminando cuota en Firestore.'
        );
      });
    }
  };

  const handleNuevaEncuestaCta = () => {
    setVista('encuestar');
    setPasoEncuesta('optin');
  };

  return (
    <div className="min-h-screen bg-[#081529] text-white flex flex-col print:bg-white print:text-slate-900">
      {/* Top Bar Contract: 3 zonas exactas */}
      <header className="sticky top-0 z-30 bg-[#0F2342] border-b border-[#1E3A5F] px-6 py-3.5 print:hidden">
        <div className="max-w-[1280px] mx-auto flex items-center justify-between gap-6">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setVista('encuestar');
            }}
            className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            Cleasy Survey
          </a>

          <nav className="flex items-center gap-6 text-sm font-medium text-slate-300 overflow-x-auto">
            <button
              type="button"
              onClick={() => setVista('encuestar')}
              className={`whitespace-nowrap shrink-0 pb-1 transition-colors cursor-pointer ${
                vista === 'encuestar'
                  ? 'text-orange-400 border-b-2 border-orange-500'
                  : 'hover:text-white'
              }`}
            >
              Encuestar
            </button>
            <button
              type="button"
              onClick={() => setVista('constructor')}
              className={`whitespace-nowrap shrink-0 pb-1 transition-colors cursor-pointer ${
                vista === 'constructor'
                  ? 'text-orange-400 border-b-2 border-orange-500'
                  : 'hover:text-white'
              }`}
            >
              Constructor
            </button>
            <button
              type="button"
              onClick={() => setVista('resultados')}
              className={`whitespace-nowrap shrink-0 pb-1 transition-colors cursor-pointer ${
                vista === 'resultados'
                  ? 'text-orange-400 border-b-2 border-orange-500'
                  : 'hover:text-white'
              }`}
            >
              Resultados
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            {authReady &&
              (firebaseUser ? (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#081529] border border-[#1E3A5F] text-xs">
                  <span className="text-slate-200 max-w-[140px] truncate">
                    {firebaseUser.email || firebaseUser.displayName || 'Cuenta'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCerrarSesionFirebase}
                    aria-label="Cerrar sesión"
                    className="text-slate-400 hover:text-orange-400 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={connectingFirebase}
                  onClick={handleConectarFirebase}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-white text-[#1f1f1f] text-xs font-medium rounded-lg border border-[#747775] hover:bg-slate-100 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    className="w-3.5 h-3.5 block shrink-0"
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>{connectingFirebase ? 'Conectando...' : 'Sign in with Google'}</span>
                </button>
              ))}

            <button
              type="button"
              onClick={handleNuevaEncuestaCta}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva Encuesta
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-8">
        {firebaseError && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-orange-500/15 border border-orange-500 text-xs text-orange-200 flex items-center justify-between gap-4 print:hidden">
            <span className="break-words">{firebaseError}</span>
            <button
              type="button"
              onClick={() => setFirebaseError(null)}
              className="text-orange-400 hover:text-white shrink-0 font-semibold cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {vista === 'encuestar' && (
          <FieldSurveyRunner
            config={config}
            preguntas={preguntas}
            cuotas={cuotas}
            colaOffline={colaOffline}
            logsLock={logsLock}
            enLinea={enLinea}
            pasoActual={pasoEncuesta}
            onSetPasoActual={setPasoEncuesta}
            onIrAConstructor={() => setVista('constructor')}
            onToggleEnLinea={handleToggleEnLinea}
            onGuardarRespuesta={handleGuardarRespuesta}
            onEjecutarGuardarLote={handleEjecutarGuardarLote}
            onReiniciarDatos={handleReiniciarDatos}
          />
        )}

        {vista === 'constructor' && (
          <BuilderAndQuotasPanel
            config={config}
            onUpdateConfig={handleUpdateConfig}
            preguntas={preguntas}
            onAddPregunta={handleAddPregunta}
            onRemovePregunta={handleRemovePregunta}
            cuotas={cuotas}
            onAddCuota={handleAddCuota}
            onRemoveCuota={handleRemoveCuota}
          />
        )}

        {vista === 'resultados' && (
          <Phase4DashboardPanel
            config={config}
            cuotas={cuotas}
            preguntas={preguntas}
            respuestas={respuestas}
            auditoria={auditoria}
            onIrAEncuestar={() => setVista('encuestar')}
          />
        )}
      </main>
    </div>
  );
}
