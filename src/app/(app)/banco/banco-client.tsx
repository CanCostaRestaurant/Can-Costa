"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Landmark, Link2, Link2Off, Loader2 } from "lucide-react";
import { PageHead } from "@/components/ui";
import { SeccionesDocumentos } from "@/components/secciones-documentos";
import { cn, eur } from "@/lib/utils";
import { analizarExtracto, confirmarPagos, type Sugerencia } from "./actions";

function leerBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => {
      const res = String(lector.result);
      resolve({ base64: res.split(",")[1] ?? "", mediaType: file.type || "application/pdf" });
    };
    lector.onerror = () => reject(new Error("No se pudo leer el archivo"));
    lector.readAsDataURL(file);
  });
}

function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return d && m ? `${d}/${m}/${y.slice(2)}` : iso;
}

export function BancoClient({
  mostrarRecibidas,
  mostrarEmitidas,
}: {
  mostrarRecibidas: boolean;
  mostrarEmitidas: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sugerencias, setSugerencias] = useState<Sugerencia[] | null>(null);
  const [ingresos, setIngresos] = useState(0);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [confirmando, startConfirm] = useTransition();
  const [hecho, setHecho] = useState<number | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  async function procesar(file: File) {
    setError(null);
    setSugerencias(null);
    setHecho(null);
    setAnalizando(true);
    try {
      const { base64, mediaType } = await leerBase64(file);
      const res = await analizarExtracto(base64, mediaType);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSugerencias(res.sugerencias);
      setIngresos(res.ingresos);
      // Pre-marcadas las que la IA emparejó con una factura.
      setSel(new Set(res.sugerencias.flatMap((s, i) => (s.factura ? [i] : []))));
    } catch {
      setError("No se pudo procesar el archivo — inténtalo de nuevo");
    } finally {
      setAnalizando(false);
    }
  }

  function alternar(i: number) {
    setSel((prev) => {
      const s = new Set(prev);
      if (s.has(i)) s.delete(i);
      else s.add(i);
      return s;
    });
  }

  function confirmar() {
    if (!sugerencias) return;
    const ids = [...sel]
      .map((i) => sugerencias[i]?.factura?.id)
      .filter((x): x is string => Boolean(x));
    if (ids.length === 0) return;
    startConfirm(async () => {
      const res = await confirmarPagos(ids);
      if (!res.ok) {
        setError(res.error ?? "No se pudo confirmar");
        return;
      }
      setHecho(res.marcadas ?? 0);
      setSugerencias(null);
      setSel(new Set());
      router.refresh();
    });
  }

  const emparejados = sugerencias?.filter((s) => s.factura).length ?? 0;
  const nSel = [...sel].filter((i) => sugerencias?.[i]?.factura).length;

  return (
    <section className="anim-in">
      <SeccionesDocumentos activa="banco" mostrarRecibidas={mostrarRecibidas} mostrarEmitidas={mostrarEmitidas} mostrarBanco />
      <PageHead
        titulo="Banco · pagos a proveedores"
        subtitulo="Sube el extracto y la IA lo cruza con tus facturas para confirmar qué está pagado"
      />

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">{error}</div>
      )}
      {hecho !== null && (
        <div className="mb-3.5 flex items-center gap-2 rounded-[14px] bg-good-soft px-4 py-3 text-[13.5px] font-semibold text-good">
          <Check className="size-4 shrink-0" />
          {hecho === 0 ? "No se marcó ninguna factura." : `${hecho} factura${hecho > 1 ? "s" : ""} marcada${hecho > 1 ? "s" : ""} como pagada${hecho > 1 ? "s" : ""}.`}
        </div>
      )}

      {/* Zona de subida */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          const f = e.dataTransfer.files?.[0];
          if (f) procesar(f);
        }}
        disabled={analizando}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed px-6 py-9 text-center transition-colors",
          arrastrando ? "border-brand bg-brand-soft" : "border-line bg-card hover:border-brand",
          analizando && "opacity-70",
        )}
      >
        {analizando ? (
          <>
            <Loader2 className="size-7 animate-spin text-brand" />
            <span className="text-[14px] font-semibold">Leyendo el extracto con IA…</span>
            <span className="text-[12.5px] text-ink-soft">Puede tardar unos segundos</span>
          </>
        ) : (
          <>
            <Landmark className="size-7 text-brand" />
            <span className="text-[15px] font-bold">Arrastra aquí el extracto del banco</span>
            <span className="text-[12.5px] text-ink-soft">
              o haz clic para elegir un PDF o una foto · la IA lee los movimientos y los cruza con tus facturas
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) procesar(f);
            e.target.value = "";
          }}
        />
      </button>

      {/* Resultados */}
      {sugerencias && (
        <div className="mt-4">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[13px] text-ink-soft">
              <b className="text-ink">{sugerencias.length}</b> pago{sugerencias.length === 1 ? "" : "s"} en el extracto ·{" "}
              <b className="text-good">{emparejados}</b> con factura
              {ingresos > 0 && <> · {ingresos} ingreso{ingresos > 1 ? "s" : ""} ignorado{ingresos > 1 ? "s" : ""}</>}
            </div>
            <button
              onClick={confirmar}
              disabled={confirmando || nSel === 0}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-good px-4 py-2 text-[13.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {confirmando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Confirmar {nSel} pago{nSel === 1 ? "" : "s"}
            </button>
          </div>

          <div className="card overflow-hidden">
            {sugerencias.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-ink-soft">
                No se han detectado pagos a proveedores en este extracto.
              </p>
            )}
            {sugerencias.map((s, i) => {
              const marcada = sel.has(i);
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-3 border-b border-line px-3.5 py-3 last:border-none transition-colors",
                    s.factura && marcada && "bg-good-soft/40",
                  )}
                >
                  {/* Movimiento del banco */}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold">{s.movimiento.concepto}</div>
                    <div className="text-[12px] text-ink-soft">{fechaCorta(s.movimiento.fecha)}</div>
                  </div>
                  <div className="shrink-0 font-display text-[15px] font-bold text-bad">
                    −{eur(Math.abs(s.movimiento.importe))}
                  </div>

                  {/* Enlace → factura */}
                  <div className="w-64 shrink-0 max-md:hidden">
                    {s.factura ? (
                      <div className="flex items-center gap-1.5 text-[12.5px]">
                        <Link2 className="size-3.5 shrink-0 text-good" />
                        <span className="min-w-0 flex-1 truncate">
                          <b className="font-semibold">{s.factura.proveedor}</b>
                          {s.factura.numero ? ` · ${s.factura.numero}` : ""}
                          <span className="text-ink-soft"> · {eur(s.factura.total)}</span>
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                        <Link2Off className="size-3.5 shrink-0" /> sin factura que cuadre
                      </div>
                    )}
                  </div>

                  {/* Confirmar */}
                  <div className="w-9 shrink-0 text-right">
                    {s.factura ? (
                      <button
                        onClick={() => alternar(i)}
                        aria-label={marcada ? "Quitar" : "Confirmar pago"}
                        className={cn(
                          "grid size-7 cursor-pointer place-items-center rounded-lg border transition-colors",
                          marcada ? "border-good bg-good text-white" : "border-line text-ink-soft hover:border-good",
                        )}
                      >
                        {marcada && <Check className="size-4" />}
                      </button>
                    ) : (
                      <FileText className="ml-auto size-4 text-ink-soft/30" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11.5px] leading-snug text-ink-soft">
            La IA sugiere el emparejado por importe y proveedor; revisa y confirma. Las facturas confirmadas pasan a{" "}
            <b className="text-ink">pagadas</b> en Recibidas.
          </p>
        </div>
      )}
    </section>
  );
}
