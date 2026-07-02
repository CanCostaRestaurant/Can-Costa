"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileText, Mail } from "lucide-react";
import { Chip, MonthChip, PageHead } from "@/components/ui";
import { type EstadoFactura, type Factura } from "@/lib/mock";
import { cn, eur } from "@/lib/utils";
import { validarFactura } from "./actions";

type Filtro = "todas" | "revisar" | "validada";

export function FacturasClient({ facturas }: { facturas: Factura[] }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const [validando, startValidar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const porRevisar = facturas.filter((f) => f.estado === "revisar").length;
  const visibles = facturas.filter((f) => filtro === "todas" || f.estado === filtro);
  const abierta = facturas.find((f) => f.id === abiertaId) ?? null;

  function onValidar(id: string) {
    setError(null);
    startValidar(async () => {
      const res = await validarFactura(id);
      if (!res.ok) {
        setError(res.error ?? "No se pudo validar");
        return;
      }
      setAbiertaId(null);
      router.refresh();
    });
  }

  return (
    <section className="anim-in">
      <PageHead
        titulo="Facturas y albaranes"
        subtitulo="Revisa la bandeja y valida: los precios se actualizan solos"
        derecha={<MonthChip>Últimas 4 semanas</MonthChip>}
      />

      <div className="mb-4.5 flex cursor-pointer items-center justify-center gap-8 rounded-card border-2 border-dashed border-[#D8CFBE] bg-linear-to-b from-[#FFFDF9] to-[#FBF7EF] p-7 transition-colors hover:border-brand max-md:flex-col max-md:gap-4">
        <div className="text-center">
          <div className="font-display text-lg font-bold tracking-tight">Arrastra aquí tus facturas</div>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            la lectura automática con IA llega en la próxima fase
          </p>
        </div>
        <div className="flex gap-3">
          <ViaSubida icon={<Camera className="size-5 text-brand" />}>Foto móvil</ViaSubida>
          <ViaSubida icon={<FileText className="size-5 text-brand" />}>PDF</ViaSubida>
          <ViaSubida icon={<Mail className="size-5 text-brand" />}>facturas@…</ViaSubida>
        </div>
      </div>

      <div className="mb-3.5 flex flex-wrap gap-2">
        <FiltroChip activo={filtro === "todas"} onClick={() => setFiltro("todas")}>
          Todas
        </FiltroChip>
        <FiltroChip activo={filtro === "revisar"} onClick={() => setFiltro("revisar")}>
          Por revisar · {porRevisar}
        </FiltroChip>
        <FiltroChip activo={filtro === "validada"} onClick={() => setFiltro("validada")}>
          Validadas
        </FiltroChip>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Proveedor</Th>
              <Th>Fecha</Th>
              <Th>Líneas</Th>
              <Th>Total</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr
                key={f.id}
                onClick={f.lineasDetalle?.length ? () => setAbiertaId(f.id) : undefined}
                className={cn(
                  "border-b border-line transition-colors last:border-none",
                  f.lineasDetalle?.length && "cursor-pointer hover:bg-hover",
                  abiertaId === f.id && "bg-hover",
                )}
              >
                <Td>
                  <span className="font-semibold">{f.proveedor}</span>
                  <span className="mt-px block text-xs text-ink-soft">{f.detalle}</span>
                </Td>
                <Td>{f.fecha}</Td>
                <Td>{f.lineas || "—"}</Td>
                <Td className="font-display text-[14.5px] font-semibold whitespace-nowrap">
                  {f.total !== null ? eur(f.total) : "—"}
                </Td>
                <Td>
                  <EstadoChip estado={f.estado} />
                </Td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <Td colSpan={5} className="py-8 text-center text-ink-soft">
                  No hay facturas con este filtro
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {abierta && abierta.lineasDetalle && (
        <div className="card anim-in mt-3.5 overflow-hidden">
          <div className="flex items-center gap-3.5 border-b border-line px-5.5 py-4.5 max-md:flex-wrap">
            <div className="grid size-[42px] shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <FileText className="size-5" />
            </div>
            <div>
              <h3 className="font-display text-[17px] font-bold tracking-tight">
                {abierta.proveedor} · {abierta.detalle}
              </h3>
              <small className="text-[12.5px] text-ink-soft">
                {abierta.fecha} · al validar, los precios pasan al histórico
              </small>
            </div>
            <div className="ml-auto text-right">
              <small className="text-[12.5px] text-ink-soft">Total</small>
              <b className="block font-display text-[22px] font-bold">{eur(abierta.total!)}</b>
            </div>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th>Cantidad</Th>
                <Th>Precio ud.</Th>
                <Th>Total</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {abierta.lineasDetalle.map((l) => (
                <tr
                  key={l.producto}
                  className={cn("border-b border-line", l.variacion && l.variacion > 0 && "bg-warn-soft")}
                >
                  <Td className="font-semibold">{l.producto}</Td>
                  <Td>{l.cantidad}</Td>
                  <Td className="font-display font-semibold">{l.precioUd}</Td>
                  <Td className="font-display font-semibold">{eur(l.total)}</Td>
                  <Td>
                    {l.variacion !== undefined &&
                      (l.variacion > 0 ? (
                        <Chip tone="bad">▲ +{l.variacion}% vs última compra</Chip>
                      ) : (
                        <Chip tone="good">▼ {l.variacion}%</Chip>
                      ))}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-end gap-2.5 px-5.5 py-4">
            {error && <span className="mr-auto text-[13px] font-semibold text-bad">{error}</span>}
            <button
              onClick={() => setAbiertaId(null)}
              className="cursor-pointer rounded-xl border border-line px-5 py-2.5 text-sm font-semibold transition-colors hover:border-[#CFC6B4]"
            >
              Cerrar
            </button>
            {abierta.estado === "revisar" && (
              <button
                onClick={() => onValidar(abierta.id)}
                disabled={validando}
                className="cursor-pointer rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
              >
                {validando ? "Validando…" : "✓ Validar factura"}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ViaSubida({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-1.5 rounded-[14px]! px-4.5 py-3.5 text-[12.5px] font-semibold text-ink-soft">
      {icon}
      {children}
    </div>
  );
}

function FiltroChip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-all",
        activo ? "border-ink bg-ink text-white" : "border-line bg-card text-ink-soft hover:border-[#CFC6B4]",
      )}
    >
      {children}
    </button>
  );
}

function EstadoChip({ estado }: { estado: EstadoFactura }) {
  if (estado === "procesando")
    return (
      <Chip tone="gray" dot pulse>
        Procesando…
      </Chip>
    );
  if (estado === "revisar")
    return (
      <Chip tone="warn" dot>
        Revisar
      </Chip>
    );
  if (estado === "error")
    return (
      <Chip tone="bad" dot>
        Error de lectura
      </Chip>
    );
  return (
    <Chip tone="good" dot>
      Validada
    </Chip>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-line px-3.5 py-2.5 text-left text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cn("px-3.5 py-3 align-middle text-sm", className)}>
      {children}
    </td>
  );
}
