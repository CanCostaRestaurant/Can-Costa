"use client";

// Facturación: registro de facturas emitidas al cliente por mes (para declarar,
// como en Dogterra). No suma a la facturación del dashboard (eso ya lo cuentan
// los tickets): aquí solo se listan las facturas formales emitidas.
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { PageHead, Chip } from "@/components/ui";
import { SeccionesDocumentos } from "@/components/secciones-documentos";
import { type FacturasEmitidas } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";

export function FacturacionClient({
  datos,
  puedeRecibidas,
}: {
  datos: FacturasEmitidas;
  puedeRecibidas: boolean;
}) {
  const router = useRouter();

  // El mes elegido puede no estar entre los que tienen facturas (mes vacío):
  // lo añadimos al selector para que no "salte" a otro.
  const meses = datos.meses.some((m) => m.valor === datos.mes)
    ? datos.meses
    : [{ valor: datos.mes, etiqueta: datos.etiquetaMes }, ...datos.meses];

  return (
    <section className="anim-in">
      <SeccionesDocumentos activa="emitidas" mostrarRecibidas={puedeRecibidas} />
      <PageHead
        titulo="Facturación"
        subtitulo="Facturas emitidas a clientes que las pidieron — para la declaración"
        derecha={
          <select
            value={datos.mes}
            onChange={(e) => router.push(`/facturacion?mes=${e.target.value}`)}
            className="cursor-pointer rounded-full border border-line bg-card px-4 py-2 text-[13.5px] font-semibold capitalize outline-none focus:border-brand"
          >
            {meses.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        }
      />

      {/* Totales del mes */}
      <div className="mb-4 grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        <Kpi etiqueta="Base imponible" valor={eur(datos.totalBase)} />
        <Kpi etiqueta="IVA repercutido" valor={eur(datos.totalIva)} />
        <Kpi etiqueta="Total facturado" valor={eur(datos.total)} destacado />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
            Facturas de {datos.etiquetaMes}
          </span>
          <span className="text-[11.5px] tracking-wider text-ink-soft uppercase">
            {datos.filas.length} {datos.filas.length === 1 ? "factura" : "facturas"}
          </span>
        </div>

        {datos.filas.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13.5px] text-ink-soft">
            No hay facturas emitidas este mes. Se generan desde el recibo de un ticket cobrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Nº</Th>
                  <Th>Fecha</Th>
                  <Th>Cliente</Th>
                  <Th>NIF</Th>
                  <Th right>Base</Th>
                  <Th right>IVA</Th>
                  <Th right>Total</Th>
                </tr>
              </thead>
              <tbody>
                {datos.filas.map((f, i) => (
                  <tr
                    key={f.id}
                    onClick={() => router.push(`/facturacion/${f.id}`)}
                    className={cn(
                      "anim-in cursor-pointer border-b border-line transition-colors last:border-none hover:bg-hover",
                      f.estado === "anulada" && "opacity-50",
                    )}
                    style={{ animationDelay: `${i * 25}ms` }}
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="flex items-center gap-1.5 font-display text-[13.5px] font-bold">
                        <FileText className="size-3.5 text-ink-soft" />
                        {f.numero}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-ink-soft whitespace-nowrap">{f.fechaLegible}</td>
                    <td className="max-w-52 truncate px-4 py-2.5 text-[13.5px] font-semibold" title={f.cliente}>
                      {f.cliente}
                      {f.estado === "anulada" && (
                        <Chip tone="bad">
                          <span className="ml-1">anulada</span>
                        </Chip>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-ink-soft whitespace-nowrap">{f.clienteCif ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right text-[13px] text-ink-soft whitespace-nowrap">{eur(f.base)}</td>
                    <td className="px-4 py-2.5 text-right text-[13px] text-ink-soft whitespace-nowrap">{eur(f.iva)}</td>
                    <td className="px-4 py-2.5 text-right font-display text-[13.5px] font-bold whitespace-nowrap">
                      {eur(f.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Kpi({ etiqueta, valor, destacado }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <div className={cn("card p-4", destacado && "bg-brand-soft")}>
      <div className="text-[11px] font-semibold tracking-wider text-ink-soft uppercase">{etiqueta}</div>
      <div className={cn("mt-0.5 font-display text-[22px] font-bold tracking-tight", destacado && "text-brand")}>
        {valor}
      </div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        "border-b border-line px-4 py-2 text-[11px] font-semibold tracking-wider text-ink-soft uppercase",
        right ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}
