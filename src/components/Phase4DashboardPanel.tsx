import { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { FileSpreadsheet, Printer } from 'lucide-react';
import {
  AuditoriaDesvinculadaRow,
  ConfiguracionEncuesta,
  CuotaDemografica,
  PreguntaInstrumento,
  RespuestaAnonimaRow
} from '../types/survey';
import { getCachedAccessTokenSync, googleSignIn } from '../utils/googleAuth';
import { generarReporteEstadistico } from '../utils/statisticsEngine';
import { GoogleSheetsExportModal, STORAGE_KEY_LAST_MODE } from './GoogleSheetsExportModal';

interface Phase4DashboardPanelProps {
  config: ConfiguracionEncuesta;
  cuotas: CuotaDemografica[];
  preguntas: PreguntaInstrumento[];
  respuestas: RespuestaAnonimaRow[];
  auditoria: AuditoriaDesvinculadaRow[];
  onIrAEncuestar: () => void;
}

export function Phase4DashboardPanel({
  config,
  cuotas,
  preguntas,
  respuestas,
  auditoria,
  onIrAEncuestar
}: Phase4DashboardPanelProps) {
  const [ponderado, setPonderado] = useState<boolean>(true);
  const [modalSheetsAbierto, setModalSheetsAbierto] = useState<boolean>(false);
  const [autoConnectPromise, setAutoConnectPromise] = useState<
    Promise<{ user: User; accessToken: string } | null> | null
  >(null);

  const reporte = useMemo(
    () => generarReporteEstadistico(config, cuotas, preguntas, respuestas),
    [config, cuotas, preguntas, respuestas]
  );

  const handlePrintPdf = () => {
    window.print();
  };

  const handleAbrirExportarSheets = () => {
    let lastMode: string | null = null;
    try {
      lastMode = localStorage.getItem(STORAGE_KEY_LAST_MODE);
    } catch {
      lastMode = null;
    }

    if (!getCachedAccessTokenSync() && lastMode !== 'webhook') {
      // Se invoca directamente dentro del evento click para que el navegador permita el popup de Google
      const promise = googleSignIn();
      setAutoConnectPromise(promise);
    } else {
      setAutoConnectPromise(null);
    }
    setModalSheetsAbierto(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between print:hidden">
        <div>
          <p className="text-xs font-medium text-orange-400">
            Análisis Estadístico y Exportación
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white text-balance">
            Resultados y Resumen Ejecutivo
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
            Visualiza las respuestas anonimizadas, pondera por cuotas si existen y exporta los
            resultados directamente a Google Sheets o PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handlePrintPdf}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-white bg-[#0F2342] border border-[#1E3A5F] rounded-lg hover:border-orange-500 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir / PDF
          </button>
          <button
            type="button"
            onClick={handleAbrirExportarSheets}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 transition-colors whitespace-nowrap cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Exportar a Google Sheets
          </button>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-4 print:bg-white print:border-slate-300">
          <div className="text-xs text-slate-300 print:text-slate-600">Entrevistas Anónimas</div>
          <div className="mt-1 text-2xl font-semibold text-orange-400 font-mono tabular-nums print:text-slate-900">
            {reporte.nTotal}
          </div>
          <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
            Meta óptima n = {reporte.nOptimo}
          </div>
        </div>

        <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-4 print:bg-white print:border-slate-300">
          <div className="text-xs text-slate-300 print:text-slate-600">Margen de Error Real</div>
          <div className="mt-1 text-2xl font-semibold text-white font-mono tabular-nums print:text-slate-900">
            {reporte.margenErrorRealBruto !== null ? `±${reporte.margenErrorRealBruto}%` : '—'}
          </div>
          <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
            {config.nivel_confianza_pct}% confianza (N={config.universo_N.toLocaleString('es-CL')})
          </div>
        </div>

        <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-4 print:bg-white print:border-slate-300">
          <div className="text-xs text-slate-300 print:text-slate-600">Efecto Diseño (Deff)</div>
          <div className="mt-1 text-2xl font-semibold text-white font-mono tabular-nums print:text-slate-900">
            {reporte.deffKish.toFixed(3)}
          </div>
          <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
            n efectivo = {reporte.nEfectivo}
          </div>
        </div>

        <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-4 print:bg-white print:border-slate-300">
          <div className="text-xs text-slate-300 print:text-slate-600">Ponderación</div>
          <div className="mt-1 text-2xl font-semibold text-orange-400 font-mono tabular-nums print:text-slate-900">
            {ponderado && cuotas.length > 0 ? 'Activa' : 'Bruto'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {cuotas.length > 0 ? 'Ajustada por cuotas' : 'Sin cuotas definidas'}
          </div>
        </div>
      </div>

      {respuestas.length === 0 ? (
        <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-10 text-center space-y-4">
          <h2 className="text-lg font-semibold text-white">
            Aún no hay respuestas registradas
          </h2>
          <p className="text-sm text-slate-300 max-w-md mx-auto">
            Captura entrevistas en la pestaña Encuestar para visualizar gráficos, margen de error y
            exportar tus resultados a Google Sheets.
          </p>
          <button
            type="button"
            onClick={onIrAEncuestar}
            className="px-5 py-2.5 text-sm font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 transition-colors cursor-pointer"
          >
            Ir a Encuestar
          </button>
        </div>
      ) : (
        <>
          {cuotas.length > 0 && (
            <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
              <span className="text-xs text-slate-300">
                Método de cálculo en gráficos y porcentajes:
              </span>
              <div className="flex items-center gap-1 p-1 bg-[#081529] rounded-lg border border-[#1E3A5F]">
                <button
                  type="button"
                  onClick={() => setPonderado(true)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    ponderado
                      ? 'bg-orange-500 text-[#081529] font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Ponderado (Post-Estratificación)
                </button>
                <button
                  type="button"
                  onClick={() => setPonderado(false)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    !ponderado
                      ? 'bg-orange-500 text-[#081529] font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Sin Ponderar (Bruto)
                </button>
              </div>
            </div>
          )}

          {/* Resumen Ejecutivo */}
          <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-5 space-y-3 print:bg-white print:border-slate-300">
            <h2 className="text-sm font-semibold text-white print:text-slate-900">
              Resumen Ejecutivo · {config.titulo}
            </h2>
            <ul className="space-y-2 text-xs leading-relaxed text-slate-200 list-disc pl-5 print:text-slate-700">
              {reporte.hallazgosClave.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>

          {/* Gráficos de distribución por pregunta */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {reporte.resumenPreguntas.map((rp) => {
              const mediaMostrar = ponderado ? rp.mediaPonderada : rp.mediaBruta;
              const npsMostrar = ponderado ? rp.npsPonderado : rp.npsBruto;

              return (
                <div
                  key={rp.pregunta.id}
                  className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-5 space-y-4 print:bg-white print:border-slate-300"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-[#1E3A5F] pb-3 print:border-slate-200">
                    <div>
                      <div className="text-xs font-mono text-orange-400 print:text-slate-600">
                        {rp.pregunta.id} · {rp.pregunta.tipo} · {rp.totalValidas} respuestas
                      </div>
                      <h3 className="text-sm font-semibold text-white mt-0.5 print:text-slate-900">
                        {rp.pregunta.texto}
                      </h3>
                    </div>
                    {npsMostrar !== null ? (
                      <div className="text-right shrink-0">
                        <div className="text-[11px] text-slate-400">NPS</div>
                        <div className="text-lg font-semibold font-mono tabular-nums text-orange-400 print:text-slate-900">
                          {npsMostrar > 0 ? `+${npsMostrar}` : npsMostrar}
                        </div>
                      </div>
                    ) : mediaMostrar !== null ? (
                      <div className="text-right shrink-0">
                        <div className="text-[11px] text-slate-400">Media</div>
                        <div className="text-lg font-semibold font-mono tabular-nums text-orange-400 print:text-slate-900">
                          {mediaMostrar}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {rp.frecuencias.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4">
                      Sin respuestas registradas aún para esta pregunta.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {rp.frecuencias.map((f) => {
                        const pct = ponderado ? f.pctPonderado : f.pctBruto;
                        const cnt = ponderado ? f.conteoPonderado : f.conteoBruto;
                        return (
                          <div key={f.opcion} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-white font-medium print:text-slate-900">
                                {f.opcion}
                              </span>
                              <span className="font-mono tabular-nums text-orange-400 print:text-slate-700">
                                {pct}% ({cnt})
                              </span>
                            </div>
                            <div className="w-full h-2 bg-[#081529] rounded-full overflow-hidden print:bg-slate-200">
                              <div
                                className="h-full bg-orange-500 rounded-full transition-all"
                                style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {reporte.pesosEstratos.length > 0 && (
            <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-5 space-y-3 print:bg-white print:border-slate-300">
              <div className="flex items-center justify-between border-b border-[#1E3A5F] pb-3 print:border-slate-200">
                <div>
                  <h2 className="text-sm font-semibold text-white print:text-slate-900">
                    Ponderación Post-Estratificación por Segmento
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Ajuste automático respecto a las cuotas definidas
                  </p>
                </div>
                <span className="text-xs font-mono text-orange-400 print:text-slate-700">
                  w = (%Meta) / (%Muestra)
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#1E3A5F] text-slate-300 print:text-slate-600">
                      <th className="py-2 pr-3">Estrato Demográfico</th>
                      <th className="py-2 pr-3 text-right">Meta</th>
                      <th className="py-2 pr-3 text-right">Actual</th>
                      <th className="py-2 pr-3 text-right">% Meta</th>
                      <th className="py-2 pr-3 text-right">% Muestra</th>
                      <th className="py-2 pr-3 text-right">Peso (w_h)</th>
                      <th className="py-2 text-right">Diagnóstico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E3A5F] print:divide-slate-200">
                    {reporte.pesosEstratos.map((e) => (
                      <tr key={e.id}>
                        <td className="py-2.5 pr-3 text-white print:text-slate-900">
                          {e.segmento}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-200 print:text-slate-700">
                          {e.meta}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-200 print:text-slate-700">
                          {e.actual}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-300">
                          {(e.propObjetivo * 100).toFixed(1)}%
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-300">
                          {(e.propMuestra * 100).toFixed(1)}%
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-semibold text-orange-400 print:text-slate-900">
                          {e.pesoWh.toFixed(3)}
                        </td>
                        <td
                          className={`py-2.5 text-right font-medium ${
                            e.estado === 'Sub-representado'
                              ? 'text-orange-400'
                              : e.estado === 'Sobre-representado'
                                ? 'text-slate-300'
                                : 'text-emerald-400'
                          }`}
                        >
                          {e.estado}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <GoogleSheetsExportModal
        isOpen={modalSheetsAbierto}
        onClose={() => {
          setModalSheetsAbierto(false);
          setAutoConnectPromise(null);
        }}
        autoConnectPromise={autoConnectPromise}
        dataset={{
          config,
          preguntas,
          cuotas,
          respuestas,
          auditoria
        }}
      />
    </div>
  );
}
