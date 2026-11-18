import { useState } from 'react';
import { Check, Copy, ExternalLink, Eye, Link2, Mail } from 'lucide-react';
import { ModalidadRecoleccion } from '../types/survey';

interface CawiShareCardProps {
  titulo: string;
  modalidad: ModalidadRecoleccion;
  activeStudyId: string | null;
  preguntasCount: number;
  onConectarFirebase?: () => void;
  onPreviewCawi?: () => void;
}

export function CawiShareCard({
  titulo,
  modalidad,
  activeStudyId,
  preguntasCount,
  onConectarFirebase,
  onPreviewCawi
}: CawiShareCardProps) {
  const [copiado, setCopiado] = useState(false);

  if (modalidad === 'solo_encuestador') {
    return null;
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const cawiUrl = activeStudyId ? `${origin}/?cawi=${encodeURIComponent(activeStudyId)}` : '';

  const asunto = encodeURIComponent(`Invitación a responder: ${titulo || 'Encuesta'}`);
  const cuerpo = encodeURIComponent(
    `Hola,\n\nTe invitamos a responder nuestra encuesta "${titulo || 'Encuesta'}" de forma rápida y 100% anónima desde tu computador o celular.\n\nIngresa al siguiente enlace para comenzar:\n${cawiUrl}\n\nMuchas gracias por tu participación.`
  );
  const mailtoUrl = `mailto:?subject=${asunto}&body=${cuerpo}`;

  const handleCopiar = async () => {
    if (!cawiUrl) return;
    try {
      await navigator.clipboard.writeText(cawiUrl);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2200);
    } catch {
      // Fallback silencioso si portapapeles está restringido
    }
  };

  return (
    <div className="bg-[#0F2342] border border-[#1E3A5F] rounded-lg p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1E3A5F] pb-3.5">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-orange-400">
            <Link2 className="w-3.5 h-3.5" />
            <span>
              CAWI · Encuesta Web Autoadministrada (
              {modalidad === 'cawi_exclusiva' ? 'Exclusiva' : 'Mixta con encuestador'})
            </span>
          </div>
          <h3 className="text-sm font-semibold text-white">
            Enviar por Correo o Enlace para Respuesta Autónoma (PC / Celular)
          </h3>
        </div>

        {onPreviewCawi && preguntasCount > 0 && (
          <button
            type="button"
            onClick={onPreviewCawi}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#081529] border border-[#1E3A5F] rounded-lg hover:border-orange-500 transition-colors cursor-pointer shrink-0"
          >
            <Eye className="w-3.5 h-3.5 text-orange-400" />
            Probar vista CAWI
          </button>
        )}
      </div>

      {!activeStudyId ? (
        <div className="p-4 rounded-lg bg-[#081529] border border-orange-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-200 leading-relaxed">
            Conecta tu cuenta con <strong>Firebase / Google</strong> para publicar la encuesta en la
            nube y generar el enlace web público que los encuestados abrirán desde su computador o
            celular.
          </p>
          {onConectarFirebase && (
            <button
              type="button"
              onClick={onConectarFirebase}
              className="px-4 py-2 text-xs font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 transition-colors shrink-0 cursor-pointer"
            >
              Activar enlace CAWI
            </button>
          )}
        </div>
      ) : preguntasCount === 0 ? (
        <p className="text-xs text-slate-300">
          Agrega al menos una pregunta al cuestionario antes de compartir el enlace CAWI con los
          participantes.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              readOnly
              value={cawiUrl}
              aria-label="Enlace público CAWI"
              onClick={(e) => e.currentTarget.select()}
              className="flex-1 min-h-[42px] px-3.5 py-2 text-xs font-mono bg-[#081529] text-slate-200 border border-[#1E3A5F] rounded-lg focus:outline-none focus:border-orange-500"
            />
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopiar}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#081529] bg-orange-500 rounded-lg hover:bg-orange-400 transition-colors cursor-pointer"
              >
                {copiado ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copiar enlace
                  </>
                )}
              </button>

              <a
                href={mailtoUrl}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#081529] border border-[#1E3A5F] rounded-lg hover:border-orange-500 transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-orange-400" />
                Enviar por correo
              </a>

              <a
                href={cawiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#081529] border border-[#1E3A5F] rounded-lg hover:border-orange-500 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
                Abrir
              </a>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            Cualquier persona con este enlace podrá responder la encuesta sola desde su computador o
            celular sin iniciar sesión. Sus respuestas quedan anónimas en tiempo real.
          </p>
        </div>
      )}
    </div>
  );
}
