import { useCallback, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  LogOut,
  Settings2,
  X
} from 'lucide-react';
import {
  clearAccessToken,
  getAccessToken,
  getCachedAccessTokenSync,
  googleSignIn,
  initAuth,
  logout
} from '../utils/googleAuth';
import {
  clearLinkedSpreadsheet,
  crearNuevoSpreadsheetYExportar,
  enviarPorWebhookCodeGs,
  exportarASpreadsheetExistente,
  ExportDataset,
  ExportResult,
  getLinkedSpreadsheet,
  GoogleApiError,
  leerMetadatosSpreadsheet,
  saveLinkedSpreadsheet,
  SpreadsheetMetadataInfo,
  WebhookCodeGsResult
} from '../utils/googleSheetsExport';

interface GoogleSheetsExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: ExportDataset;
  autoConnectPromise?: Promise<{ user: User; accessToken: string } | null> | null;
}

type ModoDestino = 'nuevo' | 'existente' | 'webhook';

const STORAGE_KEY_WEBHOOK = 'cleasy_gas_webapp_url_v1';
export const STORAGE_KEY_LAST_MODE = 'cleasy_export_last_mode_v1';

export function GoogleSheetsExportModal({
  isOpen,
  onClose,
  dataset,
  autoConnectPromise
}: GoogleSheetsExportModalProps) {
  const [user, setUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(!getCachedAccessTokenSync());
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [autoConectando, setAutoConectando] = useState<boolean>(false);
  const [preparandoDestino, setPreparandoDestino] = useState<boolean>(false);

  const [modo, setModo] = useState<ModoDestino>('nuevo');
  const [tituloNuevo, setTituloNuevo] = useState<string>(
    `Cleasy Survey — ${dataset.config.titulo || 'Encuesta'}`
  );
  const [urlExistente, setUrlExistente] = useState<string>('');
  const [metaExistente, setMetaExistente] = useState<SpreadsheetMetadataInfo | null>(null);
  const [cargandoMeta, setCargandoMeta] = useState<boolean>(false);

  const [webAppUrl, setWebAppUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_WEBHOOK) || '';
    } catch {
      return '';
    }
  });

  const [confirmacionAbierta, setConfirmacionAbierta] = useState<boolean>(false);
  const [exportando, setExportando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ExportResult | null>(null);
  const [resultadoWebhook, setResultadoWebhook] = useState<WebhookCodeGsResult | null>(null);

  useEffect(() => {
    const unsub = initAuth(
      (loggedUser) => {
        setUser(loggedUser);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setNeedsAuth(true);
      }
    );
    return () => unsub();
  }, []);

  const prepararDestinoAutomatico = useCallback(
    async (token: string) => {
      const estudioId = dataset.config.estudio_id || 'default';
      const linked = getLinkedSpreadsheet(estudioId);

      if (linked) {
        setPreparandoDestino(true);
        try {
          const meta = await leerMetadatosSpreadsheet(token, linked.spreadsheetId);
          setModo('existente');
          setUrlExistente(linked.spreadsheetId);
          setMetaExistente(meta);
          setConfirmacionAbierta(true);
          return;
        } catch (err: unknown) {
          if (err instanceof GoogleApiError && err.status === 401) {
            clearAccessToken();
            setNeedsAuth(true);
            setConfirmacionAbierta(false);
            setError('Tu sesión de Google expiró. Conecta nuevamente para exportar.');
            return;
          }
          // Si el Sheet vinculado fue borrado o no es accesible, pasar a crear uno nuevo
          clearLinkedSpreadsheet(estudioId);
        } finally {
          setPreparandoDestino(false);
        }
      }

      setModo('nuevo');
      setMetaExistente(null);
      setTituloNuevo(`Cleasy Survey — ${dataset.config.titulo || 'Encuesta'}`);
      setConfirmacionAbierta(true);
    },
    [dataset.config.estudio_id, dataset.config.titulo]
  );

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setTituloNuevo(`Cleasy Survey — ${dataset.config.titulo || 'Encuesta'}`);
    setError(null);
    setResultado(null);
    setResultadoWebhook(null);
    setConfirmacionAbierta(false);
    setMetaExistente(null);

    let lastMode: string | null = null;
    let savedWebhookUrl = '';
    try {
      lastMode = localStorage.getItem(STORAGE_KEY_LAST_MODE);
      savedWebhookUrl = localStorage.getItem(STORAGE_KEY_WEBHOOK) || '';
    } catch {
      lastMode = null;
      savedWebhookUrl = '';
    }

    if (lastMode === 'webhook' && !autoConnectPromise && savedWebhookUrl.trim()) {
      setModo('webhook');
      setConfirmacionAbierta(true);
      return;
    }

    const tokenActual = getCachedAccessTokenSync();
    if (tokenActual) {
      setNeedsAuth(false);
      void prepararDestinoAutomatico(tokenActual);
      return;
    }

    if (autoConnectPromise) {
      setAutoConectando(true);
      autoConnectPromise
        .then(async (authRes) => {
          if (cancelled) return;
          if (authRes?.accessToken) {
            setUser(authRes.user);
            setNeedsAuth(false);
            setAutoConectando(false);
            await prepararDestinoAutomatico(authRes.accessToken);
          } else {
            setAutoConectando(false);
            setNeedsAuth(true);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setAutoConectando(false);
          setNeedsAuth(true);
          setError(
            'No se completó la conexión automática con Google. Haz clic en "Sign in with Google" para continuar.'
          );
        });
    } else {
      setNeedsAuth(true);
    }

    return () => {
      cancelled = true;
    };
  }, [isOpen, autoConnectPromise, dataset.config.titulo, prepararDestinoAutomatico]);

  if (!isOpen) return null;

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const authRes = await googleSignIn();
      if (authRes) {
        setUser(authRes.user);
        setNeedsAuth(false);
        await prepararDestinoAutomatico(authRes.accessToken);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google.';
      setError(msg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setNeedsAuth(true);
    setMetaExistente(null);
    setConfirmacionAbierta(false);
  };

  const handleVerificarHojaExistente = async () => {
    setError(null);
    setMetaExistente(null);
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setCargandoMeta(true);
    try {
      const meta = await leerMetadatosSpreadsheet(token, urlExistente);
      setMetaExistente(meta);
    } catch (err: unknown) {
      if (err instanceof GoogleApiError && err.status === 401) {
        clearAccessToken();
        setNeedsAuth(true);
        setError('Tu sesión de Google expiró. Conecta nuevamente con Google.');
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo verificar el documento.');
      }
    } finally {
      setCargandoMeta(false);
    }
  };

  const handleSolicitarConfirmacion = async () => {
    setError(null);
    if (modo !== 'webhook') {
      let token = await getAccessToken();
      if (!token) {
        setIsLoggingIn(true);
        try {
          const authRes = await googleSignIn();
          if (authRes) {
            setUser(authRes.user);
            setNeedsAuth(false);
            token = authRes.accessToken;
          }
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'No se pudo conectar con Google.');
          setIsLoggingIn(false);
          return;
        } finally {
          setIsLoggingIn(false);
        }
      }

      if (modo === 'nuevo' && !tituloNuevo.trim()) {
        setError('Ingresa un nombre para la nueva hoja de Google Sheets.');
        return;
      }
      if (modo === 'existente' && !metaExistente) {
        if (!urlExistente.trim()) {
          setError('Ingresa el enlace o ID del Google Sheet existente.');
          return;
        }
        if (token) {
          setCargandoMeta(true);
          try {
            const meta = await leerMetadatosSpreadsheet(token, urlExistente);
            setMetaExistente(meta);
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'No se pudo verificar el documento.');
            setCargandoMeta(false);
            return;
          } finally {
            setCargandoMeta(false);
          }
        }
      }
    } else {
      if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/i.test(webAppUrl.trim())) {
        setError(
          'Ingresa una URL válida de Web App de Code.gs (debe iniciar con https://script.google.com/macros/s/ y terminar en /exec).'
        );
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY_WEBHOOK, webAppUrl.trim());
      } catch {
        // Ignorar
      }
    }
    setConfirmacionAbierta(true);
  };

  const handleConfirmarExportacion = async () => {
    setExportando(true);
    setError(null);
    try {
      if (modo === 'webhook') {
        const resWebhook = await enviarPorWebhookCodeGs(webAppUrl, dataset);
        try {
          localStorage.setItem(STORAGE_KEY_LAST_MODE, 'webhook');
        } catch {
          // Ignorar
        }
        setResultadoWebhook(resWebhook);
        setConfirmacionAbierta(false);
        return;
      }

      let token = await getAccessToken();
      if (!token) {
        const authRes = await googleSignIn();
        if (!authRes?.accessToken) {
          setNeedsAuth(true);
          setConfirmacionAbierta(false);
          return;
        }
        setUser(authRes.user);
        setNeedsAuth(false);
        token = authRes.accessToken;
      }

      let res: ExportResult;
      if (modo === 'nuevo') {
        res = await crearNuevoSpreadsheetYExportar(token, dataset, tituloNuevo);
      } else {
        if (!metaExistente) throw new Error('Faltan metadatos de la hoja destino.');
        res = await exportarASpreadsheetExistente(token, metaExistente, dataset);
      }

      saveLinkedSpreadsheet(dataset.config.estudio_id || 'default', res);
      try {
        localStorage.setItem(STORAGE_KEY_LAST_MODE, 'oauth');
      } catch {
        // Ignorar
      }
      setResultado(res);
      setConfirmacionAbierta(false);
    } catch (err: unknown) {
      if (err instanceof GoogleApiError && err.status === 401) {
        clearAccessToken();
        setNeedsAuth(true);
        setConfirmacionAbierta(false);
        setError('Tu sesión de Google expiró. Conecta nuevamente con Google para exportar.');
      } else {
        setError(err instanceof Error ? err.message : 'Error al exportar a Google Sheets.');
        setConfirmacionAbierta(false);
      }
    } finally {
      setExportando(false);
    }
  };

  const renderGoogleSignInButton = () => (
    <button
      type="button"
      disabled={isLoggingIn}
      onClick={handleLogin}
      className="inline-flex items-center gap-3 px-4 py-2.5 bg-white text-[#1f1f1f] text-sm font-medium rounded-md border border-[#747775] hover:bg-slate-100 disabled:opacity-60 transition-colors cursor-pointer"
    >
      <svg
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 48 48"
        className="w-5 h-5 block shrink-0"
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
        <path fill="none" d="M0 0h48v48H0z" />
      </svg>
      <span>{isLoggingIn ? 'Conectando...' : 'Sign in with Google'}</span>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-sheets-title"
    >
      <div className="w-full max-w-lg bg-[#0F2342] border border-[#1E3A5F] rounded-xl overflow-hidden text-white">
        {/* Encabezado modal */}
        <div className="px-5 py-4 border-b border-[#1E3A5F] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-orange-400" />
            <h2 id="modal-sheets-title" className="text-base font-semibold text-white">
              Exportar a Google Sheets
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 text-slate-300 hover:text-white rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {autoConectando || preparandoDestino ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-7 h-7 text-orange-400 animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">
                  {autoConectando
                    ? 'Conectando automáticamente con Google...'
                    : 'Preparando hoja de Google Sheets...'}
                </p>
                <p className="text-xs text-slate-300">
                  {autoConectando
                    ? 'Autoriza el acceso en la ventana emergente de Google para continuar con la exportación.'
                    : 'Verificando el documento destino para tu encuesta.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAutoConectando(false);
                  setPreparandoDestino(false);
                }}
                className="mt-2 px-3 py-1.5 text-xs text-slate-300 hover:text-white underline cursor-pointer"
              >
                Elegir otro método manualmente
              </button>
            </div>
          ) : resultado ? (
            <div className="space-y-4 text-center py-2">
              <div className="w-12 h-12 rounded-full bg-orange-500/20 text-orange-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-white">Exportación completada</h3>
                <p className="text-xs text-slate-300">
                  Se escribieron <strong className="text-white">{resultado.totalRowsWritten}</strong>{' '}
                  filas en <strong>{resultado.title}</strong>.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <a
                  href={resultado.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 transition-colors"
                >
                  Abrir en Google Sheets
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-xs font-medium text-white bg-[#081529] border border-[#1E3A5F] rounded-lg hover:border-slate-400 cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : resultadoWebhook ? (
            <div className="space-y-4 text-center py-2">
              <div className="w-12 h-12 rounded-full bg-orange-500/20 text-orange-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-white">
                  Enviado mediante Code.gs (LockService)
                </h3>
                <p className="text-xs text-slate-300 tabular-nums">
                  Guardadas: <strong className="text-white">{resultadoWebhook.resumen?.guardadas ?? 0}</strong>{' '}
                  · Duplicadas omitidas: {resultadoWebhook.resumen?.duplicadas ?? 0} · Rechazadas:{' '}
                  {resultadoWebhook.resumen?.rechazadas ?? 0}
                  {resultadoWebhook.tiempo_lock_ms !== undefined
                    ? ` · Lock ${resultadoWebhook.tiempo_lock_ms} ms`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-xs font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          ) : confirmacionAbierta ? (
            <div className="space-y-4">
              {modo !== 'webhook' && user?.email && (
                <div className="flex items-center justify-between px-3.5 py-2 rounded-lg bg-[#081529] border border-[#1E3A5F] text-xs">
                  <span className="text-slate-200 truncate">
                    Conectado como: <strong className="text-white">{user.email}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmacionAbierta(false)}
                    className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300 cursor-pointer shrink-0 font-medium"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Cambiar destino
                  </button>
                </div>
              )}

              <div className="p-4 rounded-lg bg-[#081529] border border-orange-500/70 space-y-2.5 text-xs">
                <div className="font-semibold text-orange-400">
                  Confirmar operación en Google Sheets
                </div>
                <p className="text-slate-200 leading-relaxed">
                  {modo === 'nuevo' ? (
                    <>
                      Se creará una nueva hoja de cálculo llamada{' '}
                      <strong className="text-white">“{tituloNuevo}”</strong> en tu cuenta de
                      Google.
                    </>
                  ) : modo === 'existente' ? (
                    <>
                      Se actualizará la hoja{' '}
                      <strong className="text-white">“{metaExistente?.title}”</strong>, limpiando y
                      sobrescribiendo los rangos de las 5 pestañas de Cleasy Survey.
                    </>
                  ) : (
                    <>
                      Se enviará la solicitud <code className="font-mono">doPost</code> al endpoint{' '}
                      <strong className="text-white">Code.gs</strong> protegido con{' '}
                      <code className="font-mono">LockService</code>.
                    </>
                  )}
                </p>
                <div className="pt-1 text-slate-300 font-mono space-y-1">
                  <div>· Configuracion_Encuesta: parámetros del estudio</div>
                  <div>· Preguntas: {dataset.preguntas.length} preguntas</div>
                  <div>· Cuotas_Demograficas: {dataset.cuotas.length} segmentos</div>
                  <div>· Respuestas_Anonimas: {dataset.respuestas.length} respuestas</div>
                  <div>· Auditoria_Desvinculada: {dataset.auditoria.length} registros</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {modo === 'webhook' ? (
                  <button
                    type="button"
                    disabled={exportando}
                    onClick={() => setConfirmacionAbierta(false)}
                    className="inline-flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 cursor-pointer"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Cambiar método
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={exportando}
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-medium text-white bg-[#081529] border border-[#1E3A5F] rounded-lg hover:border-slate-400 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={exportando}
                    onClick={handleConfirmarExportacion}
                    className="px-4 py-2 text-xs font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 disabled:opacity-50 cursor-pointer"
                  >
                    {exportando ? 'Exportando...' : 'Confirmar y Exportar'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selector de método */}
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#081529] border border-[#1E3A5F] rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setModo('nuevo');
                    setError(null);
                  }}
                  className={`py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    modo === 'nuevo'
                      ? 'bg-orange-500 text-[#081529] font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Nuevo Sheet
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModo('existente');
                    setError(null);
                  }}
                  className={`py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    modo === 'existente'
                      ? 'bg-orange-500 text-[#081529] font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Sheet existente
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModo('webhook');
                    setError(null);
                  }}
                  className={`py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    modo === 'webhook'
                      ? 'bg-orange-500 text-[#081529] font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Code.gs (doPost)
                </button>
              </div>

              {modo === 'webhook' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-200 mb-1.5">
                      URL de Web App desplegada desde Code.gs
                    </label>
                    <input
                      type="url"
                      value={webAppUrl}
                      onChange={(e) => setWebAppUrl(e.target.value)}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="w-full min-h-[42px] px-3.5 py-2 text-xs bg-[#081529] text-white border border-[#1E3A5F] rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                    />
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      Envía los datos directamente a la función <code className="font-mono">doPost(e)</code> de{' '}
                      <code className="font-mono">Code.gs</code> con bloqueo concurrente{' '}
                      <code className="font-mono">LockService</code>.
                    </p>
                  </div>
                </div>
              ) : needsAuth ? (
                <div className="space-y-4 text-center py-3">
                  <p className="text-sm text-slate-200 leading-relaxed">
                    Inicia sesión con tu cuenta de Google para crear o actualizar una hoja de
                    cálculo directamente desde <strong>Cleasy Survey</strong>.
                  </p>

                  <div className="flex justify-center pt-1">{renderGoogleSignInButton()}</div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-[#081529] border border-[#1E3A5F] text-xs">
                    <span className="text-slate-200 truncate">
                      Cuenta: <strong className="text-white">{user?.email || 'Conectada'}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="inline-flex items-center gap-1 text-slate-300 hover:text-orange-400 cursor-pointer shrink-0"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Salir
                    </button>
                  </div>

                  {modo === 'nuevo' ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-200 mb-1.5">
                        Nombre de la nueva hoja de Google Sheets
                      </label>
                      <input
                        type="text"
                        value={tituloNuevo}
                        onChange={(e) => setTituloNuevo(e.target.value)}
                        className="w-full min-h-[42px] px-3.5 py-2 text-sm bg-[#081529] text-white border border-[#1E3A5F] rounded-lg focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-200 mb-1.5">
                          URL o ID del Google Sheet destino
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={urlExistente}
                            onChange={(e) => {
                              setUrlExistente(e.target.value);
                              setMetaExistente(null);
                            }}
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                            className="flex-1 min-h-[42px] px-3 py-2 text-xs bg-[#081529] text-white border border-[#1E3A5F] rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                          />
                          <button
                            type="button"
                            disabled={cargandoMeta || !urlExistente.trim()}
                            onClick={handleVerificarHojaExistente}
                            className="px-3.5 py-2 text-xs font-medium text-white bg-[#081529] border border-[#1E3A5F] rounded-lg hover:border-orange-500 disabled:opacity-40 cursor-pointer shrink-0"
                          >
                            {cargandoMeta ? 'Leyendo...' : 'Verificar'}
                          </button>
                        </div>
                      </div>

                      {metaExistente && (
                        <div className="px-3.5 py-2.5 rounded-lg bg-[#081529] border border-[#1E3A5F] text-xs space-y-1">
                          <div className="text-white font-medium">
                            Documento: {metaExistente.title}
                          </div>
                          <div className="text-slate-400">
                            Pestañas actuales: {metaExistente.existingTabs.join(', ') || 'Ninguna'}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {(modo === 'webhook' || !needsAuth) && (
                <>
                  <div className="px-3.5 py-2.5 rounded-lg bg-[#081529] border border-[#1E3A5F] text-xs text-slate-300 flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
                    <span>Preguntas: {dataset.preguntas.length}</span>
                    <span>Cuotas: {dataset.cuotas.length}</span>
                    <span>Respuestas: {dataset.respuestas.length}</span>
                    <span>Auditoría: {dataset.auditoria.length}</span>
                  </div>

                  <div className="flex justify-end gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-xs font-medium text-slate-200 bg-[#081529] border border-[#1E3A5F] rounded-lg hover:border-slate-400 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={isLoggingIn || cargandoMeta}
                      onClick={handleSolicitarConfirmacion}
                      className="px-4 py-2 text-xs font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 disabled:opacity-50 cursor-pointer"
                    >
                      Continuar a Exportación
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="px-3.5 py-2.5 rounded-lg bg-orange-500/15 border border-orange-500 text-xs text-orange-200">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
