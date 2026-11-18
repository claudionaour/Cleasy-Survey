import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Plus,
  RefreshCw,
  RotateCcw,
  Star,
  Wifi,
  WifiOff
} from 'lucide-react';
import {
  ConfiguracionEncuesta,
  CuotaDemografica,
  EncuestaPendienteOffline,
  EventoLockLog,
  PreguntaInstrumento
} from '../types/survey';
import { CawiShareCard } from './CawiShareCard';

interface FieldSurveyRunnerProps {
  config: ConfiguracionEncuesta;
  preguntas: PreguntaInstrumento[];
  cuotas: CuotaDemografica[];
  colaOffline: EncuestaPendienteOffline[];
  logsLock: EventoLockLog[];
  enLinea: boolean;
  pasoActual: 'optin' | 'preguntas' | 'exito';
  onSetPasoActual: (paso: 'optin' | 'preguntas' | 'exito') => void;
  onIrAConstructor: () => void;
  onToggleEnLinea: () => void;
  onGuardarRespuesta: (item: EncuestaPendienteOffline) => void;
  onEjecutarGuardarLote: () => void;
  onReiniciarDatos: () => void;
  activeStudyId?: string | null;
  onConectarFirebase?: () => void;
  onPreviewCawi?: () => void;
}

export function FieldSurveyRunner({
  config,
  preguntas,
  cuotas,
  colaOffline,
  logsLock,
  enLinea,
  pasoActual,
  onSetPasoActual,
  onIrAConstructor,
  onToggleEnLinea,
  onGuardarRespuesta,
  onEjecutarGuardarLote,
  onReiniciarDatos,
  activeStudyId = null,
  onConectarFirebase,
  onPreviewCawi
}: FieldSurveyRunnerProps) {
  const [operador, setOperador] = useState('');
  const [macroZona, setMacroZona] = useState('');
  const [rangoEtario, setRangoEtario] = useState('18-29');
  const [genero, setGenero] = useState('Femenino');
  const [consentimiento, setConsentimiento] = useState(false);
  const [contactoOpcional, setContactoOpcional] = useState('');
  const [respuestas, setRespuestas] = useState<Record<string, string | number | string[]>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const zonasDisponibles = Array.from(new Set(cuotas.map((c) => c.macro_zona))).filter(Boolean);
  const cuotaSeleccionada = cuotas.find(
    (c) =>
      c.macro_zona.toLowerCase() === macroZona.trim().toLowerCase() &&
      c.rango_etario === rangoEtario &&
      c.genero === genero
  );

  const generarUuid = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'uuid-' + Date.now() + '-' + Math.random().toString(16).slice(2, 10);
  };

  const handleComenzar = () => {
    if (!consentimiento) {
      setErrorMsg('Confirme el consentimiento informado (Opt-in) del participante para continuar.');
      return;
    }
    setErrorMsg(null);
    const iniciales: Record<string, string | number | string[]> = {};
    preguntas.forEach((p) => {
      if (p.tipo === 'slider') iniciales[p.id] = 50;
      if (p.tipo === 'multiple') iniciales[p.id] = [];
    });
    setRespuestas(iniciales);
    onSetPasoActual('preguntas');
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

  const handleGuardarEncuesta = (e: React.FormEvent) => {
    e.preventDefault();
    for (let i = 0; i < preguntas.length; i++) {
      const p = preguntas[i];
      const val = respuestas[p.id];
      const vacia =
        val === undefined || val === '' || (Array.isArray(val) && val.length === 0);
      if (p.obligatoria && vacia) {
        setErrorMsg(`Por favor responda la pregunta obligatoria ${i + 1}: "${p.texto}"`);
        return;
      }
    }

    setErrorMsg(null);
    const respuestasNormalizadas: Record<string, string | number> = {};
    Object.entries(respuestas).forEach(([k, v]) => {
      respuestasNormalizadas[k] = Array.isArray(v) ? v.join(', ') : v;
    });

    const nueva: EncuestaPendienteOffline = {
      uuid: generarUuid(),
      operador_codigo: operador.trim() || 'Encuestador',
      timestamp_captura: new Date().toISOString(),
      consentimiento_opt_in: true,
      macro_zona: macroZona.trim() || 'General',
      rango_etario: rangoEtario,
      genero,
      contacto_opcional: contactoOpcional.trim(),
      respuestas: respuestasNormalizadas
    };

    onGuardarRespuesta(nueva);
    setConsentimiento(false);
    setContactoOpcional('');
    setRespuestas({});
    onSetPasoActual('exito');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium text-orange-400">
            Captura de Encuestas · Anonimato Estricto
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white text-balance">
            {config.titulo || 'Nueva Encuesta'}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
            {enLinea
              ? 'Modo conectado: las respuestas se registran directamente y quedan listas para análisis y exportación a Google Sheets.'
              : 'Modo sin señal: las respuestas se resguardan localmente en el dispositivo hasta recuperar conexión.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleEnLinea}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
              enLinea
                ? 'bg-[#0F2342] border-[#1E3A5F] text-white hover:border-orange-500/60'
                : 'bg-orange-500/15 border-orange-500 text-orange-300'
            }`}
          >
            {enLinea ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                Conectado (Online)
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-orange-400" />
                Sin señal (Offline)
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onReiniciarDatos}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 bg-[#0F2342] border border-[#1E3A5F] rounded-lg hover:text-white hover:border-slate-500 transition-colors whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Limpiar todo
          </button>
        </div>
      </div>

      <CawiShareCard
        titulo={config.titulo}
        modalidad={config.modalidad_recoleccion || 'mixta'}
        activeStudyId={activeStudyId}
        preguntasCount={preguntas.length}
        onConectarFirebase={onConectarFirebase}
        onPreviewCawi={onPreviewCawi}
      />

      {preguntas.length === 0 ? (
        <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-10 text-center space-y-4">
          <h2 className="text-lg font-semibold text-white">
            Tu encuesta aún no tiene preguntas
          </h2>
          <p className="text-sm text-slate-300 max-w-md mx-auto">
            Crea las preguntas de tu estudio en el Constructor para comenzar a registrar respuestas
            en terreno o en línea.
          </p>
          <button
            type="button"
            onClick={onIrAConstructor}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Ir al Constructor
          </button>
        </div>
      ) : config.modalidad_recoleccion === 'cawi_exclusiva' ? (
        <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-8 text-center space-y-4">
          <h2 className="text-lg font-semibold text-white">
            Modalidad CAWI Exclusiva Activa
          </h2>
          <p className="text-sm text-slate-300 max-w-lg mx-auto leading-relaxed">
            Este estudio está configurado únicamente para que cada persona responda de forma
            autoadministrada desde su computador o celular mediante el enlace web o correo
            electrónico de arriba (sin encuestador).
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-1">
            {onPreviewCawi && (
              <button
                type="button"
                onClick={onPreviewCawi}
                className="px-5 py-2.5 text-xs font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 transition-colors cursor-pointer"
              >
                Abrir vista previa CAWI
              </button>
            )}
            <button
              type="button"
              onClick={onIrAConstructor}
              className="px-4 py-2.5 text-xs font-medium text-white bg-[#081529] border border-[#1E3A5F] rounded-lg hover:border-orange-500 transition-colors cursor-pointer"
            >
              Cambiar modalidad en Constructor
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Columna principal: Flujo de encuesta */}
          <div className="lg:col-span-7 space-y-5">
            {pasoActual === 'optin' && (
              <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-[#1E3A5F] pb-4">
                  <div>
                    <p className="text-xs font-medium text-orange-400">Paso 1 de 2</p>
                    <h2 className="text-lg font-semibold text-white mt-0.5">
                      Datos de Segmento y Consentimiento
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-slate-300 tabular-nums">
                    {preguntas.length} preguntas
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-200 mb-1.5">
                      Encuestador / Código (opcional)
                    </label>
                    <input
                      type="text"
                      value={operador}
                      onChange={(e) => setOperador(e.target.value)}
                      placeholder="Ej. Encuestador 1"
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-[#081529] text-white border border-[#1E3A5F] rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-200 mb-1.5">
                      Zona / Sector
                    </label>
                    <input
                      type="text"
                      list="zonas-cuotas-list"
                      value={macroZona}
                      onChange={(e) => setMacroZona(e.target.value)}
                      placeholder="Ej. Centro, Norte, Comuna..."
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-[#081529] text-white border border-[#1E3A5F] rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                    />
                    {zonasDisponibles.length > 0 && (
                      <datalist id="zonas-cuotas-list">
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
                    <label className="block text-xs font-medium text-slate-200 mb-1.5">
                      Género
                    </label>
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

                {cuotas.length > 0 && (
                  <div className="px-4 py-3 rounded-lg bg-[#081529] border border-[#1E3A5F] flex items-center justify-between text-xs">
                    {cuotaSeleccionada ? (
                      <>
                        <span className="text-slate-300">
                          Cuota del segmento:{' '}
                          <strong className="text-white font-mono tabular-nums">
                            {cuotaSeleccionada.actual}/{cuotaSeleccionada.meta}
                          </strong>
                        </span>
                        <span
                          className={`font-medium tabular-nums ${
                            cuotaSeleccionada.actual >= cuotaSeleccionada.meta
                              ? 'text-orange-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {cuotaSeleccionada.actual >= cuotaSeleccionada.meta
                            ? config.politica_cuota_estricta
                              ? 'Cuota completa (Bloqueada)'
                              : 'Cuota completa (Sobrecupo permitido)'
                            : `${cuotaSeleccionada.meta - cuotaSeleccionada.actual} cupos disponibles`}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-300">
                        Este segmento no tiene cuota específica asignada.
                      </span>
                    )}
                  </div>
                )}

                <div className="p-4 rounded-lg bg-[#081529] border border-[#1E3A5F] space-y-3">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Las respuestas se registran de forma estrictamente anónima y separadas de
                    cualquier dato de contacto.
                  </p>
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={consentimiento}
                      onChange={(e) => {
                        setConsentimiento(e.target.checked);
                        if (e.target.checked) setErrorMsg(null);
                      }}
                      className="mt-0.5 h-4 w-4 accent-orange-500 rounded"
                    />
                    <span className="text-xs font-medium text-white leading-relaxed">
                      El participante acepta responder de forma voluntaria y anónima (Opt-in).
                    </span>
                  </label>
                </div>

                {errorMsg && (
                  <div className="px-4 py-2.5 rounded-lg bg-orange-500/15 border border-orange-500 text-xs text-orange-200 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleComenzar}
                  className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 transition-colors cursor-pointer"
                >
                  Comenzar Entrevista
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {pasoActual === 'preguntas' && (
              <form onSubmit={handleGuardarEncuesta} className="space-y-4">
                <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg px-5 py-3.5 flex items-center justify-between">
                  <div className="text-xs text-slate-300">
                    Paso 2 de 2 ·{' '}
                    <span className="text-white font-medium">
                      {macroZona.trim() || 'General'} · {rangoEtario} · {genero}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSetPasoActual('optin')}
                    className="text-xs font-medium text-orange-400 hover:text-orange-300 cursor-pointer"
                  >
                    Cambiar segmento
                  </button>
                </div>

                {preguntas.map((p, idx) => {
                  const valorActual = respuestas[p.id];
                  return (
                    <div
                      key={p.id}
                      className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-5 space-y-4"
                    >
                      <div className="space-y-1">
                        <div className="text-xs font-mono text-orange-400">
                          Pregunta {idx + 1} de {preguntas.length}
                          {p.obligatoria ? ' · Obligatoria' : ' · Opcional'}
                        </div>
                        <h3 className="text-base font-medium text-white">{p.texto}</h3>
                      </div>

                      {p.tipo === 'unica' && (
                        <div className="space-y-2">
                          {p.alternativas.map((alt) => {
                            const activo = valorActual === alt;
                            return (
                              <button
                                key={alt}
                                type="button"
                                onClick={() =>
                                  setRespuestas((prev) => ({ ...prev, [p.id]: alt }))
                                }
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
                            const seleccionadas = Array.isArray(valorActual)
                              ? (valorActual as string[])
                              : [];
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
                          {Array.from(
                            { length: p.tipo === 'likert_7' ? 7 : 5 },
                            (_, i) => i + 1
                          ).map((val) => {
                            const activo = valorActual === val;
                            return (
                              <button
                                key={val}
                                type="button"
                                onClick={() =>
                                  setRespuestas((prev) => ({ ...prev, [p.id]: val }))
                                }
                                className={`min-h-[46px] rounded-lg border text-sm font-semibold tabular-nums transition-colors cursor-pointer ${
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
                        <div className="grid grid-cols-5 gap-2">
                          {[1, 2, 3, 4, 5].map((val) => {
                            const activo = Number(valorActual || 0) >= val;
                            return (
                              <button
                                key={val}
                                type="button"
                                onClick={() =>
                                  setRespuestas((prev) => ({ ...prev, [p.id]: val }))
                                }
                                className={`min-h-[46px] rounded-lg border inline-flex items-center justify-center gap-1 text-sm font-semibold tabular-nums transition-colors cursor-pointer ${
                                  activo
                                    ? 'bg-orange-500 text-[#081529] border-orange-500'
                                    : 'bg-[#081529] text-slate-300 border-[#1E3A5F] hover:border-orange-500/60'
                                }`}
                              >
                                <Star className="w-4 h-4 fill-current" />
                                {val}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {p.tipo === 'nps' && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5">
                            {Array.from({ length: 11 }, (_, i) => i).map((val) => {
                              const activo = valorActual === val;
                              return (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() =>
                                    setRespuestas((prev) => ({ ...prev, [p.id]: val }))
                                  }
                                  className={`min-h-[44px] rounded-lg border text-xs font-semibold tabular-nums transition-colors cursor-pointer ${
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
                          <div className="flex justify-between text-[11px] text-slate-400">
                            <span>0 · Nada probable</span>
                            <span>10 · Totalmente probable</span>
                          </div>
                        </div>
                      )}

                      {p.tipo === 'slider' && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-300">Valor actual</span>
                            <span className="font-mono font-semibold text-orange-400 tabular-nums">
                              {Number(valorActual ?? 50)} / 100
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={Number(valorActual ?? 50)}
                            onChange={(e) =>
                              setRespuestas((prev) => ({
                                ...prev,
                                [p.id]: Number(e.target.value)
                              }))
                            }
                            className="w-full accent-orange-500 cursor-pointer"
                          />
                        </div>
                      )}

                      {p.tipo === 'texto' && (
                        <textarea
                          rows={3}
                          value={String(valorActual || '')}
                          onChange={(e) =>
                            setRespuestas((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          placeholder="Escriba la respuesta aquí..."
                          className="w-full px-3.5 py-2.5 text-sm bg-[#081529] text-white border border-[#1E3A5F] rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                        />
                      )}
                    </div>
                  );
                })}

                <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-5 space-y-2">
                  <label className="block text-xs font-medium text-white">
                    Contacto opcional para auditoría (se guarda desvinculado)
                  </label>
                  <input
                    type="text"
                    value={contactoOpcional}
                    onChange={(e) => setContactoOpcional(e.target.value)}
                    placeholder="Opcional: correo o teléfono (no se vincula a las respuestas)"
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-[#081529] text-white border border-[#1E3A5F] rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                  />
                </div>

                {errorMsg && (
                  <div className="px-4 py-3 rounded-lg bg-orange-500/15 border border-orange-500 text-xs text-orange-200 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => onSetPasoActual('optin')}
                    className="min-h-[48px] px-5 py-3 text-sm font-medium text-white bg-[#0F2342] border border-[#1E3A5F] rounded-lg hover:border-slate-400 transition-colors cursor-pointer"
                  >
                    Volver
                  </button>
                  <button
                    type="submit"
                    className="flex-1 min-h-[48px] px-5 py-3 text-sm font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 transition-colors cursor-pointer"
                  >
                    {enLinea ? 'Finalizar y Guardar Encuesta' : 'Guardar en Cola Offline'}
                  </button>
                </div>
              </form>
            )}

            {pasoActual === 'exito' && (
              <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-8 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-orange-500/20 text-orange-400 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-semibold text-white">
                  {enLinea
                    ? 'Encuesta registrada correctamente'
                    : 'Entrevista guardada en modo offline'}
                </h2>
                <p className="text-sm text-slate-300 max-w-md mx-auto">
                  {enLinea
                    ? 'La respuesta se guardó de forma anónima y ya está disponible en Resultados y lista para exportar a Google Sheets.'
                    : 'La respuesta quedó guardada en el dispositivo con UUID único y se sincronizará al volver a conectarse.'}
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => onSetPasoActual('optin')}
                    className="min-h-[44px] px-5 py-2.5 text-sm font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 transition-colors cursor-pointer"
                  >
                    Capturar Nueva Entrevista
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Columna derecha: Cola Offline y Registro */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#1E3A5F] pb-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Cola Offline ({colaOffline.length} pendientes)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Almacenamiento local ante pérdida de señal
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!enLinea || colaOffline.length === 0}
                  onClick={onEjecutarGuardarLote}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sincronizar
                </button>
              </div>

              {colaOffline.length === 0 ? (
                <p className="py-4 text-xs text-slate-400 text-center">
                  No hay entrevistas pendientes en la cola offline.
                </p>
              ) : (
                <div className="divide-y divide-[#1E3A5F] max-h-60 overflow-y-auto">
                  {colaOffline.map((item) => (
                    <div
                      key={item.uuid}
                      className="py-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-orange-400 truncate">
                          {item.uuid.slice(0, 14)}...
                        </div>
                        <div className="text-slate-300 mt-0.5">
                          {item.macro_zona} · {item.rango_etario} · {item.genero}
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 shrink-0">
                        {item.operador_codigo}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {logsLock.length > 0 && (
              <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-5 space-y-3">
                <h3 className="text-sm font-semibold text-white">Actividad Reciente</h3>
                <div className="divide-y divide-[#1E3A5F]">
                  {logsLock.slice(0, 4).map((log) => (
                    <div key={log.id} className="py-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between font-medium text-white">
                        <span>{log.operador}</span>
                        <span className="font-mono text-[11px] text-orange-400 tabular-nums">
                          {log.hora}
                        </span>
                      </div>
                      <p className="text-slate-300">{log.mensaje}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
