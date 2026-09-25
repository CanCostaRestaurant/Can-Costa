"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Piezas compartidas del comandero (móvil). OJO: todo lo `fixed` de aquí
// cuelga del cuerpo — ningún ancestro debe llevar transform/animación
// (anim-in) o la hoja y los avisos se quedan flotando a media pantalla.

// Hoja inferior: sube desde abajo, tapa el resto y respeta el borde inferior
// del móvil. Se cierra tocando fuera o la X.
export function Hoja({
  titulo,
  abierta,
  onCerrar,
  children,
  pie,
}: {
  titulo: React.ReactNode;
  abierta: boolean;
  onCerrar: () => void;
  children: React.ReactNode;
  pie?: React.ReactNode;
}) {
  if (!abierta) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/45" onClick={onCerrar} />
      <div
        role="dialog"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88svh] flex-col rounded-t-3xl bg-paper shadow-2xl"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-2 pb-2.5">
          <b className="font-display min-w-0 flex-1 truncate text-[16px] font-bold">{titulo}</b>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-chip active:opacity-70"
          >
            <X className="size-4.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {pie !== undefined ? (
          <div className="shrink-0 border-t border-line px-4 pt-3 pb-[max(14px,env(safe-area-inset-bottom))]">{pie}</div>
        ) : (
          <div className="h-[max(8px,env(safe-area-inset-bottom))] shrink-0" />
        )}
      </div>
    </>
  );
}

// Aviso flotante y breve encima de la barra inferior ("+1 Pulpo", "Pase 2
// enviado"…). Quien lo pinta decide cuándo quitarlo.
export type Aviso = {
  id: number;
  texto: string;
  tono?: "ok" | "neutro" | "malo";
  accion?: { etiqueta: string; onClick: () => void };
};

export function AvisoFlotante({ aviso }: { aviso: Aviso | null }) {
  if (!aviso) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[35] flex justify-center px-4">
      <div
        key={aviso.id}
        className={cn(
          "pointer-events-auto flex max-w-full items-center gap-3 rounded-full px-4 py-2.5 text-[13.5px] font-semibold shadow-(--shadow-lift)",
          aviso.tono === "ok" ? "bg-good text-white" : aviso.tono === "malo" ? "bg-bad text-white" : "bg-ink text-white",
        )}
      >
        <span className="min-w-0 truncate">{aviso.texto}</span>
        {aviso.accion && (
          <button
            onClick={aviso.accion.onClick}
            className="shrink-0 cursor-pointer rounded-full bg-white/20 px-2.5 py-1 text-[12.5px] font-bold active:bg-white/30"
          >
            {aviso.accion.etiqueta}
          </button>
        )}
      </div>
    </div>
  );
}
