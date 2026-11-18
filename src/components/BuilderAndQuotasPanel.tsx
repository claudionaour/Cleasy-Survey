import { useMemo, useState } from 'react';
import { AlertTriangle, Plus, Trash2, XCircle } from 'lucide-react';
import {
  calcularMargenErrorReal,
  calcularTamanoMuestralFinito
} from '../data/initialWorkbook';
import {
  ConfiguracionEncuesta,
  CuotaDemografica,
  PreguntaInstrumento
} from '../types/survey';

interface BuilderAndQuotasPanelProps {
  config: ConfiguracionEncuesta;
  onUpdateConfig: (next: ConfiguracionEncuesta) => void;
  preguntas: PreguntaInstrumento[];
  onAddPregunta: (pregunta: PreguntaInstrumento) => void;
  onRemovePregunta: (id: string) => void;
  cuotas: CuotaDemografica[];
  onAddCuota: (cuota: CuotaDemografica) => void;
  onRemoveCuota: (id: string) => void;
}

interface GuardrailAlerta {
  nivel: 'advertencia' | 'error';
  mensaje: string;
}

function detectarGuardrails(texto: string, tipo: string, alternativasRaw: string): GuardrailAlerta[] {
  const alertas: GuardrailAlerta[] = [];
  const limpio = texto.trim();

  if (limpio.length > 140) {
    alertas.push({
      nivel: 'advertencia',
      mensaje: `Pregunta extensa (${limpio.length} caracteres). Se recomienda ≤ 140 caracteres para lectura rápida en terreno.`
    });
  }

  if (tipo === 'unica' || tipo === 'multiple') {
    const opciones = alternativasRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const rangos: { label: string; min: number; max: number }[] = [];

    for (const op of opciones) {
      const m = op.match(/(\d+(?:\.\d+)?)\s*[-–a]\s*(\d+(?:\.\d+)?)/i);
      if (m) {
        rangos.push({ label: op, min: Number(m[1]), max: Number(m[2]) });
      }
    }

    for (let i = 0; i < rangos.length; i++) {
      for (let j = i + 1; j < rangos.length; j++) {
        const a = rangos[i];
        const b = rangos[j];
        if (Math.max(a.min, b.min) <= Math.min(a.max, b.max)) {
          alertas.push({
            nivel: 'error',
            mensaje: `Rangos superpuestos detectados entre "${a.label}" y "${b.label}". Corrija los límites para evitar sesgo.`
          });
        }
      }
    }
  }

  return alertas;
}

export function BuilderAndQuotasPanel({
  config,
  onUpdateConfig,
  preguntas,
  onAddPregunta,
  onRemovePregunta,
  cuotas,
  onAddCuota,
  onRemoveCuota
}: BuilderAndQuotasPanelProps) {
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState<PreguntaInstrumento['tipo']>('unica');
  const [alternativasRaw, setAlternativasRaw] = useState('');
  const [obligatoria, setObligatoria] = useState(true);

  const [cuotaZona, setCuotaZona] = useState('');
  const [cuotaEdad, setCuotaEdad] = useState('18-29');
  const [cuotaGenero, setCuotaGenero] = useState('Femenino');
  const [cuotaMeta, setCuotaMeta] = useState(10);

  const alertas = useMemo(
    () => detectarGuardrails(texto, tipo, alternativasRaw),
    [texto, tipo, alternativasRaw]
  );
  const tieneErrorBloqueante = alertas.some((a) => a.nivel === 'error');

  const nOptimo = calcularTamanoMuestralFinito(
    config.universo_N,
    config.nivel_confianza_pct,
    config.margen_error_pct
  );
  const totalMeta = cuotas.reduce((acc, c) => acc + c.meta, 0);
  const totalActual = cuotas.reduce((acc, c) => acc + c.actual, 0);
  const margenReal = calcularMargenErrorReal(
    config.universo_N,
    totalActual,
    config.nivel_confianza_pct
  );

  const handleAgregarPregunta = (e: React.FormEvent) => {
    e.preventDefault();
    if (tieneErrorBloqueante || !texto.trim()) return;

    const alts =
      tipo === 'escala_likert'
        ? ['1', '2', '3', '4', '5']
        : tipo === 'likert_7'
          ? ['1', '2', '3', '4', '5', '6', '7']
          : tipo === 'estrellas'
            ? ['1', '2', '3', '4', '5']
            : tipo === 'nps'
              ? Array.from({ length: 11 }, (_, i) => String(i))
              : tipo === 'texto' || tipo === 'slider'
                ? []
                : alternativasRaw
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);

    onAddPregunta({
      id: `P${Date.now().toString(36).slice(-4).toUpperCase()}`,
      orden: preguntas.length + 1,
      texto: texto.trim(),
      tipo,
      alternativas: alts,
      obligatoria,
      salto_logico: ''
    });

    setTexto('');
    setAlternativasRaw('');
  };

  const handleAgregarCuota = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cuotaZona.trim() || cuotaMeta <= 0) return;
    onAddCuota({
      id: `C-${Date.now().toString(36).slice(-5).toUpperCase()}`,
      macro_zona: cuotaZona.trim(),
      rango_etario: cuotaEdad,
      genero: cuotaGenero,
      meta: Math.max(1, Math.round(cuotaMeta)),
      actual: 0
    });
    setCuotaZona('');
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-orange-400">
          Configuración del Estudio y Cuestionario
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white text-balance">
          Constructor de Encuestas
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
          Define el título del estudio, tamaño poblacional, preguntas con validación metodológica y
          cuotas demográficas opcionales.
        </p>
      </div>

      {/* Configuración general del estudio y calculadora muestral */}
      <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-5 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-200 mb-1.5">
                Nombre o Título de la Encuesta
              </label>
              <input
                type="text"
                value={config.titulo}
                onChange={(e) => onUpdateConfig({ ...config, titulo: e.target.value })}
                placeholder="Ej. Encuesta de Satisfacción de Servicios 2026"
                className="w-full min-h-[42px] px-3.5 py-2 text-sm bg-[#081529] text-white border border-[#1E3A5F] rounded-lg focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-200 mb-1.5">
                Universo (N)
              </label>
              <input
                type="number"
                min={50}
                value={config.universo_N}
                onChange={(e) => {
                  const N = Math.max(50, Number(e.target.value) || 50);
                  onUpdateConfig({
                    ...config,
                    universo_N: N,
                    tamano_muestra_n: calcularTamanoMuestralFinito(
                      N,
                      config.nivel_confianza_pct,
                      config.margen_error_pct
                    )
                  });
                }}
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-[#081529] text-white border border-[#1E3A5F] rounded-lg font-mono tabular-nums focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-200 mb-1.5">
                Confianza
              </label>
              <select
                value={config.nivel_confianza_pct}
                onChange={(e) => {
                  const conf = Number(e.target.value) as 90 | 95 | 99;
                  onUpdateConfig({
                    ...config,
                    nivel_confianza_pct: conf,
                    tamano_muestra_n: calcularTamanoMuestralFinito(
                      config.universo_N,
                      conf,
                      config.margen_error_pct
                    )
                  });
                }}
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-[#081529] text-white border border-[#1E3A5F] rounded-lg font-mono tabular-nums focus:outline-none focus:border-orange-500"
              >
                <option value={90}>90% (Z=1.645)</option>
                <option value={95}>95% (Z=1.960)</option>
                <option value={99}>99% (Z=2.576)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-200 mb-1.5">
                Margen Error (%)
              </label>
              <input
                type="number"
                step={0.5}
                min={1}
                max={15}
                value={config.margen_error_pct}
                onChange={(e) => {
                  const err = Math.min(15, Math.max(1, Number(e.target.value) || 5));
                  onUpdateConfig({
                    ...config,
                    margen_error_pct: err,
                    tamano_muestra_n: calcularTamanoMuestralFinito(
                      config.universo_N,
                      config.nivel_confianza_pct,
                      err
                    )
                  });
                }}
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-[#081529] text-white border border-[#1E3A5F] rounded-lg font-mono tabular-nums focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="sm:col-span-3 pt-1">
              <label className="inline-flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.politica_cuota_estricta}
                  onChange={(e) =>
                    onUpdateConfig({
                      ...config,
                      politica_cuota_estricta: e.target.checked
                    })
                  }
                  className="h-4 w-4 accent-orange-500 rounded"
                />
                <span>
                  Bloquear respuestas cuando un segmento definido alcance su cuota meta
                </span>
              </label>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-3 gap-4 border-t lg:border-t-0 lg:border-l border-[#1E3A5F] pt-4 lg:pt-0 lg:pl-6">
            <div>
              <div className="text-xs text-slate-300">Muestra Óptima</div>
              <div className="mt-1 text-2xl font-semibold text-orange-400 font-mono tabular-nums">
                {nOptimo}
              </div>
              <div className="text-[11px] text-slate-400">entrevistas</div>
            </div>

            <div>
              <div className="text-xs text-slate-300">Cuotas</div>
              <div className="mt-1 text-2xl font-semibold text-white font-mono tabular-nums">
                {totalActual}/{totalMeta}
              </div>
              <div className="text-[11px] text-slate-400 tabular-nums">
                {totalMeta > 0 ? `${Math.round((totalActual / totalMeta) * 100)}% avance` : 'Sin cuotas'}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-300">Error Real</div>
              <div className="mt-1 text-2xl font-semibold text-white font-mono tabular-nums">
                {margenReal !== null ? `±${margenReal}%` : '—'}
              </div>
              <div className="text-[11px] text-slate-400">actual</div>
            </div>
          </div>
        </div>
      </div>

      {/* Constructor de preguntas + Lista de preguntas y cuotas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleAgregarPregunta}
          className="lg:col-span-6 bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-5 space-y-4"
        >
          <div className="border-b border-[#1E3A5F] pb-3">
            <h2 className="text-sm font-semibold text-white">Agregar Pregunta</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Detecta automáticamente rangos numéricos superpuestos y enunciados extensos.
            </p>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <label className="font-medium text-slate-200">Texto de la pregunta</label>
              <span
                className={`font-mono tabular-nums ${
                  texto.trim().length > 140 ? 'text-orange-400 font-medium' : 'text-slate-400'
                }`}
              >
                {texto.trim().length}/140
              </span>
            </div>
            <textarea
              rows={2}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe la pregunta que verá el encuestado..."
              className="w-full px-3.5 py-2.5 text-sm bg-[#081529] text-white border border-[#1E3A5F] rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-200 mb-1.5">
                Tipo de respuesta
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as PreguntaInstrumento['tipo'])}
                className="w-full min-h-[42px] px-3 py-2 text-xs bg-[#081529] text-white border border-[#1E3A5F] rounded-lg focus:outline-none focus:border-orange-500"
              >
                <option value="unica">Opción única</option>
                <option value="multiple">Opción múltiple</option>
                <option value="escala_likert">Escala Likert 1-5</option>
                <option value="likert_7">Escala Likert 1-7</option>
                <option value="estrellas">Estrellas 1-5</option>
                <option value="slider">Deslizador 0-100</option>
                <option value="nps">NPS 0-10</option>
                <option value="texto">Texto abierto</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-200 mb-1.5">
                Opciones (separadas por coma)
              </label>
              <input
                type="text"
                disabled={tipo !== 'unica' && tipo !== 'multiple'}
                value={alternativasRaw}
                onChange={(e) => setAlternativasRaw(e.target.value)}
                placeholder="Ej. Excelente, Bueno, Regular"
                className="w-full min-h-[42px] px-3 py-2 text-xs bg-[#081529] text-white border border-[#1E3A5F] rounded-lg disabled:opacity-40 placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={obligatoria}
              onChange={(e) => setObligatoria(e.target.checked)}
              className="h-4 w-4 accent-orange-500 rounded"
            />
            <span>Respuesta obligatoria</span>
          </label>

          {alertas.length > 0 && (
            <div className="space-y-2">
              {alertas.map((a, idx) => (
                <div
                  key={idx}
                  className="px-3.5 py-2.5 rounded-lg border border-orange-500 bg-orange-500/15 text-xs text-orange-200 flex items-start gap-2"
                >
                  {a.nivel === 'error' ? (
                    <XCircle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                  )}
                  <span>{a.mensaje}</span>
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={tieneErrorBloqueante || !texto.trim()}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Agregar al Cuestionario
          </button>
        </form>

        {/* Preguntas activas + Cuotas demográficas */}
        <div className="lg:col-span-6 space-y-5">
          <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-[#1E3A5F] pb-3">
              <h2 className="text-sm font-semibold text-white">
                Preguntas del Cuestionario ({preguntas.length})
              </h2>
            </div>

            {preguntas.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                Aún no has agregado preguntas. Usa el formulario de la izquierda para comenzar tu
                cuestionario.
              </p>
            ) : (
              <div className="divide-y divide-[#1E3A5F]">
                {preguntas.map((p, i) => (
                  <div key={p.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-white">
                        <span className="font-mono text-orange-400 mr-1.5">{i + 1}.</span>
                        {p.texto}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {p.tipo} · {p.obligatoria ? 'obligatoria' : 'opcional'}
                        {p.alternativas.length > 0 ? ` · ${p.alternativas.length} opciones` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemovePregunta(p.id)}
                      title="Eliminar pregunta"
                      className="p-1.5 text-slate-400 hover:text-orange-400 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-5 space-y-4">
            <div className="border-b border-[#1E3A5F] pb-3">
              <h2 className="text-sm font-semibold text-white">
                Cuotas Demográficas ({cuotas.length})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Opcional: define metas por zona, edad y género para ponderar o controlar la muestra.
              </p>
            </div>

            <form onSubmit={handleAgregarCuota} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input
                type="text"
                value={cuotaZona}
                onChange={(e) => setCuotaZona(e.target.value)}
                placeholder="Zona / Sector"
                className="px-2.5 py-2 text-xs bg-[#081529] text-white border border-[#1E3A5F] rounded-md placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
              />
              <select
                value={cuotaEdad}
                onChange={(e) => setCuotaEdad(e.target.value)}
                className="px-2.5 py-2 text-xs bg-[#081529] text-white border border-[#1E3A5F] rounded-md focus:outline-none focus:border-orange-500"
              >
                <option value="18-29">18-29</option>
                <option value="30-44">30-44</option>
                <option value="45-59">45-59</option>
                <option value="60+">60+</option>
              </select>
              <select
                value={cuotaGenero}
                onChange={(e) => setCuotaGenero(e.target.value)}
                className="px-2.5 py-2 text-xs bg-[#081529] text-white border border-[#1E3A5F] rounded-md focus:outline-none focus:border-orange-500"
              >
                <option value="Femenino">Femenino</option>
                <option value="Masculino">Masculino</option>
                <option value="Otro / Prefiero no decir">Otro</option>
              </select>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  min={1}
                  value={cuotaMeta}
                  onChange={(e) => setCuotaMeta(Number(e.target.value) || 1)}
                  className="w-full px-2.5 py-2 text-xs bg-[#081529] text-white border border-[#1E3A5F] rounded-md font-mono tabular-nums focus:outline-none focus:border-orange-500"
                />
                <button
                  type="submit"
                  disabled={!cuotaZona.trim()}
                  className="px-3 py-2 text-xs font-semibold text-[#081529] bg-orange-500 rounded-md hover:bg-orange-400 disabled:opacity-40 cursor-pointer shrink-0"
                >
                  +
                </button>
              </div>
            </form>

            {cuotas.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">
                Sin cuotas configuradas. Puedes encuestar libremente sin restricciones de segmento.
              </p>
            ) : (
              <div className="space-y-3">
                {cuotas.map((c) => {
                  const pct =
                    c.meta > 0 ? Math.min(100, Math.round((c.actual / c.meta) * 100)) : 0;
                  return (
                    <div key={c.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="text-slate-200 truncate">
                          {c.macro_zona} · {c.rango_etario} · {c.genero}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono tabular-nums text-orange-400">
                            {c.actual}/{c.meta} ({pct}%)
                          </span>
                          <button
                            type="button"
                            onClick={() => onRemoveCuota(c.id)}
                            className="text-slate-400 hover:text-orange-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-[#081529] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
