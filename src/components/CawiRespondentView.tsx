import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, ShieldCheck, Star } from 'lucide-react';
import {
  ConfiguracionEncuesta,
  CuotaDemografica,
  EncuestaPendienteOffline,
  PreguntaInstrumento
} from '../types/survey';
import { loadPublicCawiStudy, submitPublicCawiResponse } from '../utils/firestoreService';

interface CawiRespondentViewProps {
  studyId?: string | null;
  previewData?: {
    config: ConfiguracionEncuesta;
    preguntas: PreguntaInstrumento[];
    cuotas: CuotaDemografica[];
  };
  onExitPreview?: () => void;
  onPreviewSubmit?: (item: EncuestaPendienteOffline) => void;
}

export function CawiRespondentView({
  studyId,
  previewData,
  onExitPreview,
  onPreviewSubmit
}: CawiRespondentViewProps) {
  const [loading, setLoading] = useState<boolean>(!previewData);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string>('');
  const [config, setConfig] = useState<ConfiguracionEncuesta | null>(previewData?.config || null);
  const [preguntas, setPreguntas] = useState<PreguntaInstrumento[]>(previewData?.preguntas || []);
  const [cuotas, setCuotas] = useState<CuotaDemografica[]>(previewData?.cuotas || []);

  const [paso, setPaso] = useState<'bienvenida' | 'preguntas' | 'gracias'>('bienvenida');
  const [macroZona, setMacroZona] = useState('');
  const [rangoEtario, setRangoEtario] = useState('18-29');
  const [genero, setGenero] = useState('Femenino');
  const [consentimiento, setConsentimiento] = useState(false);
  const [respuestas, setRespuestas] = useState<Record<string, string | number | string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<boolean>(false);

  useEffect(() => {
    if (previewData) {
      setConfig(previewData.config);
      setPreguntas(previewData.preguntas);
      setCuotas(previewData.cuotas);
      setLoading(false);
      return;
    }

    if (!studyId) {
      setLoadError('El enlace de la encuesta no es válido.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    loadPublicCawiStudy(studyId)
      .then((bundle) => {
        if (cancelled) return;
        if (!bundle) {
          setLoadError('Esta encuesta no existe o ya no está disponible.');
          setLoading(false);
          return;
        }
        setOwnerId(bundle.ownerId);
        setConfig(bundle.config);
        setPreguntas(bundle.preguntas);
        setCuotas(bundle.cuotas);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('No se pudo cargar la encuesta en este momento. Intenta nuevamente.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studyId, previewData]);

  const zonasDisponibles = Array.from(new Set(cuotas.map((c) => c.macro_zona))).filter(Boolean);
  const cuotaSeleccionada = cuotas.find(
    (c) =>
      c.macro_zona.toLowerCase() === macroZona.trim().toLowerCase() &&
      c.rango_etario === rangoEtario &&
      c.genero === genero
  );
  const cuotaBloqueada =
    Boolean(config?.politica_cuota_estricta) &&
    ((Boolean(cuotaSeleccionada) && cuotaSeleccionada!.actual >= cuotaSeleccionada!.meta) ||
      (!cuotaSeleccionada && cuotas.length > 0));

  const generarUuid = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'cawi-' + Date.now() + '-' + Math.random().toString(16).slice(2, 10);
  };

  const handleComenzar = () => {
    if (!consentimiento) {
      setFormError('Debes aceptar participar voluntariamente para comenzar la encuesta.');
      return;
    }
    if (cuotaBloqueada) {
      setFormError(
        'El cupo para tu segmento demográfico ya alcanzó su meta. Muchas gracias por tu interés.'
      );
      return;
    }
    setFormError(null);
    const iniciales: Record<string, string | number | string[]> = {};
    preguntas.forEach((p) => {
      if (p.tipo === 'slider') iniciales[p.id] = 50;
      if (p.tipo === 'multiple') iniciales[p.id] = [];
    });
    setRespuestas(iniciales);
    setPaso('preguntas');
  };

  const toggleMultipleOption = (preguntaId: string, opcion: string) => {
    setRespuestas((prev) => {
      const actual = Array.isArray(prev[preguntaId]) ? (prev[preguntaId] as string[]) : [];
      const existe = actual.includes(opcion);
      return {
        ...prev,
        [preguntaId]: existe ? actual.filter((o) => o !== opcion) : [...actual, opcion]
      };
    });
  };

  const respondidasCount = preguntas.filter((p) => {
    const val = respuestas[p.id];
    return val !== undefined && val !== '' && (!Array.isArray(val) || val.length > 0);
  }).length;

  const handleEnviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    for (let i = 0; i < preguntas.length; i++) {
      const p = preguntas[i];
      const val = respuestas[p.id];
      const vacia = val === undefined || val === '' || (Array.isArray(val) && val.length === 0);
      if (p.obligatoria && vacia) {
        setFormError(`Por favor responde la pregunta obligatoria ${i + 1}: "${p.texto}"`);
        return;
      }
    }

    setFormError(null);
    setEnviando(true);

    const respuestasNormalizadas: Record<string, string | number> = {};
    Object.entries(respuestas).forEach(([k, v]) => {
      respuestasNormalizadas[k] = Array.isArray(v) ? v.join(', ') : v;
    });

    const item: EncuestaPendienteOffline = {
      uuid: generarUuid(),
      operador_codigo: 'CAWI-Autoadministrado',
      timestamp_captura: new Date().toISOString(),
      consentimiento_opt_in: true,
      macro_zona: macroZona.trim() || 'General',
      rango_etario: rangoEtario,
      genero,
      contacto_opcional: '',
      respuestas: respuestasNormalizadas
    };

    try {
      if (previewData && onPreviewSubmit) {
        onPreviewSubmit(item);
      } else if (studyId && ownerId) {
        await submitPublicCawiResponse(
          studyId,
          ownerId,
          item,
          cuotaSeleccionada || null,
          config.politica_cuota_estricta
        );
      }
      setPaso('gracias');
    } catch (err: unknown) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'No pudimos registrar tu respuesta. Por favor intenta nuevamente.'
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#081529] text-white flex flex-col">
      <header className="bg-[#0F2342] border-b border-[#1E3A5F] px-5 py-3.5">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-base font-bold tracking-tight text-white">Cleasy Survey</span>
            <span className="text-xs font-medium text-orange-400">· Encuesta Web (CAWI)</span>
          </div>

          {onExitPreview && (
            <button
              type="button"
              onClick={onExitPreview}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#081529] border border-[#1E3A5F] rounded-lg hover:border-orange-500 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Salir de vista previa
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-5 py-8">
        {loading ? (
          <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-xl p-10 text-center space-y-3">
            <Loader2 className="w-7 h-7 text-orange-400 animate-spin mx-auto" />
            <p className="text-sm text-slate-200">Cargando encuesta...</p>
          </div>
        ) : loadError ? (
          <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-xl p-8 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-orange-400 mx-auto" />
            <h1 className="text-lg font-semibold text-white">Encuesta no disponible</h1>
            <p className="text-sm text-slate-300">{loadError}</p>
          </div>
        ) : config?.modalidad_recoleccion === 'solo_encuestador' ? (
          <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-xl p-8 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-orange-400 mx-auto" />
            <h1 className="text-lg font-semibold text-white">{config.titulo}</h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Esta encuesta está configurada exclusivamente para aplicación presencial con un
              encuestador y no recibe respuestas autoadministradas por enlace web.
            </p>
          </div>
        ) : preguntas.length === 0 ? (
          <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-xl p-8 text-center space-y-3">
            <h1 className="text-lg font-semibold text-white">{config?.titulo || 'Encuesta'}</h1>
            <p className="text-sm text-slate-300">
              Esta encuesta aún no tiene preguntas publicadas.
            </p>
          </div>
        ) : paso === 'bienvenida' ? (
          <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-xl p-6 sm:p-8 space-y-6">
            <div className="space-y-2 border-b border-[#1E3A5F] pb-5">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-400">
                <ShieldCheck className="w-4 h-4" />
                <span>Encuesta autoadministrada · 100% Anónima</span>
              </div>
              <h1 className="text-2xl font-semibold text-white text-balance">{config?.titulo}</h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                Puedes responder esta encuesta directamente desde tu computador o celular a tu propio
                ritmo ({preguntas.length} preguntas).
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Información demográfica básica (para estadísticas)
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-200 mb-1.5">
                    Zona / Comuna / Sector
                  </label>
                  <input
                    type="text"
                    list="cawi-zonas-list"
                    value={macroZona}
                    onChange={(e) => setMacroZona(e.target.value)}
                    placeholder="Ej. Centro, Norte..."
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-[#081529] text-white border border-[#1E3A5F] rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                  />
                  {zonasDisponibles.length > 0 && (
                    <datalist id="cawi-zonas-list">
                      {zonasDisponibles.map((z) => (
                        <option key={z} value={z} />
                      ))}
                    </datalist>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-200 mb-1.5">
                    Rango Etario
                  </label>
                  <select
                    value={rangoEtario}
                    onChange={(e) => setRangoEtario(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-[#081529] text-white border border-[#1E3A5F] rounded-lg focus:outline-none focus:border-orange-500"
                  >
                    <option value="18-29">18-29 años</option>
                    <option value="30-44">30-44 años</option>
                    <option value="45-59">45-59 años</option>
                    <option value="60+">60+ años</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-200 mb-1.5">Género</label>
                  <select
                    value={genero}
                    onChange={(e) => setGenero(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-[#081529] text-white border border-[#1E3A5F] rounded-lg focus:outline-none focus:border-orange-500"
                  >
                    <option value="Femenino">Femenino</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Otro / Prefiero no decir">Otro / Prefiero no decir</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-[#081529] border border-[#1E3A5F]">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={consentimiento}
                  onChange={(e) => {
                    setConsentimiento(e.target.checked);
                    if (e.target.checked) setFormError(null);
                  }}
                  className="mt-0.5 h-4 w-4 accent-orange-500 rounded"
                />
                <span className="text-xs text-slate-200 leading-relaxed">
                  Acepto responder esta encuesta de forma voluntaria. Entiendo que mis respuestas
                  serán tratadas de manera estrictamente anónima con fines estadísticos.
                </span>
              </label>
            </div>

            {formError && (
              <div className="px-4 py-3 rounded-lg bg-orange-500/15 border border-orange-500 text-xs text-orange-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleComenzar}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 transition-colors cursor-pointer"
            >
              Comenzar Encuesta
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : paso === 'preguntas' ? (
          <form onSubmit={handleEnviar} className="space-y-5">
            <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-xl px-5 py-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white truncate">{config?.titulo}</span>
                <span className="font-mono text-orange-400 tabular-nums shrink-0">
                  {respondidasCount}/{preguntas.length} respondidas
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#081529] rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all"
                  style={{
                    width: `${preguntas.length > 0 ? Math.round((respondidasCount / preguntas.length) * 100) : 0}%`
                  }}
                />
              </div>
            </div>

            {preguntas.map((p, idx) => {
              const valorActual = respuestas[p.id];
              return (
                <div
                  key={p.id}
                  className="bg-[#0F2342] border border-[#1E3A5F] rounded-xl p-5 space-y-4"
                >
                  <div className="space-y-1">
                    <div className="text-xs font-mono text-orange-400">
                      Pregunta {idx + 1} de {preguntas.length}
                      {p.obligatoria ? ' · Obligatoria' : ' · Opcional'}
                    </div>
                    <h2 className="text-base font-medium text-white">{p.texto}</h2>
                  </div>

                  {p.tipo === 'unica' && (
                    <div className="space-y-2">
                      {p.alternativas.map((alt) => {
                        const activo = valorActual === alt;
                        return (
                          <button
                            key={alt}
                            type="button"
                            onClick={() => setRespuestas((prev) => ({ ...prev, [p.id]: alt }))}
                            className={`w-full min-h-[44px] text-left px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                              activo
                                ? 'bg-orange-500 text-[#081529] border-orange-500'
                                : 'bg-[#081529] text-white border-[#1E3A5F] hover:border-orange-500/60'
                            }`}
                          >
                            {alt}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {p.tipo === 'multiple' && (
                    <div className="space-y-2">
                      {p.alternativas.map((alt) => {
                        const seleccionadas = Array.isArray(valorActual) ? valorActual : [];
                        const activo = seleccionadas.includes(alt);
                        return (
                          <button
                            key={alt}
                            type="button"
                            onClick={() => toggleMultipleOption(p.id, alt)}
                            className={`w-full min-h-[44px] text-left px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                              activo
                                ? 'bg-orange-500 text-[#081529] border-orange-500'
                                : 'bg-[#081529] text-white border-[#1E3A5F] hover:border-orange-500/60'
                            }`}
                          >
                            {alt}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {(p.tipo === 'escala_likert' || p.tipo === 'likert_7') && (
                    <div
                      className={`grid gap-2 ${
                        p.tipo === 'likert_7' ? 'grid-cols-7' : 'grid-cols-5'
                      }`}
                    >
                      {(p.alternativas.length > 0
                        ? p.alternativas
                        : p.tipo === 'likert_7'
                          ? ['1', '2', '3', '4', '5', '6', '7']
                          : ['1', '2', '3', '4', '5']
                      ).map((val) => {
                        const activo = String(valorActual) === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() =>
                              setRespuestas((prev) => ({ ...prev, [p.id]: Number(val) }))
                            }
                            className={`min-h-[48px] rounded-lg border text-sm font-mono font-semibold transition-colors cursor-pointer ${
                              activo
                                ? 'bg-orange-500 text-[#081529] border-orange-500'
                                : 'bg-[#081529] text-white border-[#1E3A5F] hover:border-orange-500/60'
                            }`}
                          >
                            {val}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {p.tipo === 'estrellas' && (
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((num) => {
                        const seleccionado = Number(valorActual || 0) >= num;
                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setRespuestas((prev) => ({ ...prev, [p.id]: num }))}
                            aria-label={`${num} estrellas`}
                            className="p-2 rounded-lg bg-[#081529] border border-[#1E3A5F] hover:border-orange-500 transition-colors cursor-pointer"
                          >
                            <Star
                              className={`w-6 h-6 ${
                                seleccionado
                                  ? 'fill-orange-400 text-orange-400'
                                  : 'text-slate-500'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {p.tipo === 'slider' && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-mono text-slate-300">
                        <span>0</span>
                        <span className="text-orange-400 font-semibold text-sm tabular-nums">
                          {Number(valorActual ?? 50)}
                        </span>
                        <span>100</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Number(valorActual ?? 50)}
                        onChange={(e) =>
                          setRespuestas((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))
                        }
                        className="w-full accent-orange-500 cursor-pointer"
                      />
                    </div>
                  )}

                  {p.tipo === 'nps' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5">
                        {Array.from({ length: 11 }, (_, n) => {
                          const activo = Number(valorActual) === n && valorActual !== undefined;
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setRespuestas((prev) => ({ ...prev, [p.id]: n }))}
                              className={`min-h-[42px] rounded-md border text-xs font-mono font-semibold transition-colors cursor-pointer ${
                                activo
                                  ? 'bg-orange-500 text-[#081529] border-orange-500'
                                  : 'bg-[#081529] text-white border-[#1E3A5F] hover:border-orange-500/60'
                              }`}
                            >
                              {n}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>0 · Nada probable</span>
                        <span>10 · Muy probable</span>
                      </div>
                    </div>
                  )}

                  {p.tipo === 'texto' && (
                    <textarea
                      rows={3}
                      value={String(valorActual || '')}
                      onChange={(e) =>
                        setRespuestas((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      placeholder="Escribe tu respuesta aquí..."
                      className="w-full px-3.5 py-2.5 text-sm bg-[#081529] text-white border border-[#1E3A5F] rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                    />
                  )}
                </div>
              );
            })}

            {formError && (
              <div className="px-4 py-3 rounded-lg bg-orange-500/15 border border-orange-500 text-xs text-orange-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="w-full min-h-[48px] px-5 py-3 text-sm font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {enviando ? 'Enviando respuestas...' : 'Enviar Encuesta'}
            </button>
          </form>
        ) : (
          <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-xl p-8 text-center space-y-5">
            <div className="w-14 h-14 rounded-full bg-orange-500/20 text-orange-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold text-white">
                ¡Muchas gracias por tu participación!
              </h1>
              <p className="text-sm text-slate-300 max-w-md mx-auto">
                Tu respuesta anónima ha sido registrada correctamente. Ya puedes cerrar esta
                ventana.
              </p>
            </div>
            {onExitPreview && (
              <button
                type="button"
                onClick={onExitPreview}
                className="px-5 py-2.5 text-xs font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 cursor-pointer"
              >
                Volver a Cleasy Survey
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
