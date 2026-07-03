"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { preguntarFina, type MensajeFina } from "@/app/(app)/fina/actions";

const SUGERENCIAS = [
  "¿Cómo va el mes?",
  "¿Qué ha subido de precio?",
  "¿Qué plato me deja más margen?",
  "¿Tengo facturas por validar?",
];

export function FinaWidget() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<MensajeFina[]>([]);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pensando, startPregunta] = useTransition();
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, pensando]);

  function enviar(pregunta: string) {
    const limpia = pregunta.trim();
    if (!limpia || pensando) return;
    setError(null);
    setTexto("");
    const historial: MensajeFina[] = [...mensajes, { rol: "user", texto: limpia }];
    setMensajes(historial);
    startPregunta(async () => {
      const res = await preguntarFina(historial);
      if (res.ok && res.texto) {
        setMensajes([...historial, { rol: "assistant", texto: res.texto }]);
      } else {
        setError(res.error ?? "Algo ha fallado");
      }
    });
  }

  return (
    <>
      {abierto && (
        <div className="fixed right-5 bottom-24 z-50 flex h-[540px] w-[380px] flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-2xl max-md:inset-x-3 max-md:w-auto">
          {/* Cabecera */}
          <div className="flex items-center gap-3 border-b border-line bg-ink px-4 py-3.5 text-white">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-brand font-display text-[15px] font-extrabold">
              F
            </div>
            <div className="flex-1">
              <b className="block text-[14.5px] leading-tight font-bold">Fina</b>
              <small className="text-[11.5px] text-white/60">tu administrativa financiera · IA</small>
            </div>
            <button
              onClick={() => setAbierto(false)}
              className="cursor-pointer rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-4.5" />
            </button>
          </div>

          {/* Conversación */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {mensajes.length === 0 && (
              <div>
                <p className="text-[13.5px] leading-relaxed text-ink-soft">
                  Hola, soy <b className="text-ink">Fina</b> 👋 Ya me encargo de leer y digitalizar las facturas
                  que subes a Documentos. Pregúntame lo que quieras de tus números: respondo con los datos
                  reales del restaurante.
                </p>
                <div className="mt-4 flex flex-col items-start gap-2">
                  {SUGERENCIAS.map((s) => (
                    <button
                      key={s}
                      onClick={() => enviar(s)}
                      className="cursor-pointer rounded-full border border-line px-3.5 py-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mensajes.map((m, i) => (
              <div key={i} className={cn("mb-3 flex", m.rol === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap",
                    m.rol === "user" ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-chip",
                  )}
                >
                  {m.texto}
                </div>
              </div>
            ))}
            {pensando && (
              <div className="mb-3 flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-chip px-3.5 py-3">
                  <span className="size-1.5 animate-bounce rounded-full bg-ink-soft [animation-delay:0ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-ink-soft [animation-delay:150ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-ink-soft [animation-delay:300ms]" />
                </div>
              </div>
            )}
            {error && (
              <div className="mb-3 rounded-xl bg-bad-soft px-3.5 py-2.5 text-[12.5px] font-semibold text-bad">
                {error}
              </div>
            )}
            <div ref={finRef} />
          </div>

          {/* Entrada */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviar(texto);
            }}
            className="flex items-center gap-2 border-t border-line px-3 py-3"
          >
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pregunta a Fina…"
              className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3.5 py-2.5 text-[13.5px] outline-none placeholder:text-ink-soft/50 focus:border-brand"
            />
            <button
              type="submit"
              disabled={pensando || !texto.trim()}
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl bg-brand text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setAbierto((v) => !v)}
        title="Fina — tu administrativa IA"
        className="fixed right-5 bottom-5 z-50 grid size-14 cursor-pointer place-items-center rounded-full bg-brand text-white shadow-xl transition-transform hover:scale-105"
      >
        {abierto ? <X className="size-6" /> : <Sparkles className="size-6" />}
      </button>
    </>
  );
}
