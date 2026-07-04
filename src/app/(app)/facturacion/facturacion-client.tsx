"use client";

// Facturación: registro de facturas emitidas al cliente por mes (para declarar,
// como en Dogterra). No suma a la facturación del dashboard (eso ya lo cuentan
// los tickets): aquí solo se listan las facturas formales emitidas.
import { useRouter } from "next/navigation";
import { Download, FileText } from "lucide-react";
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

  // El período elegido (mes o trimestre) puede no estar entre los que tienen
  // facturas (período vacío): lo añadimos al selector para que no "salte".
  const esTrimestre = datos.periodo.includes("T");
  const anio = datos.periodo.slice(0, 4);
  // El trimestre del período visible siempre está en el selector, con facturas o sin.
  const triActual = esTrimestre
    ? datos.periodo
    : `${anio}-T${Math.ceil(Number(datos.periodo.slice(5, 7)) / 3)}`;
  const trimestres = datos.trimestres.some((t) => t.valor === triActual)
    ? datos.trimestres
    : [
        {
          valor: triActual,
          etiqueta: `${["1er", "2º", "3er", "4º"][Number(triActual.slice(6)) - 1]} trimestre ${anio}`,
        },
        ...datos.trimestres,
      ];
  const meses =
    esTrimestre || datos.meses.some((m) => m.valor === datos.periodo)
      ? datos.meses
      : [{ valor: datos.periodo, etiqueta: datos.etiquetaPeriodo }, ...datos.meses];

  return (
    <section className="anim-in">
      <SeccionesDocumentos activa="emitidas" mostrarRecibidas={puedeRecibidas} mostrarBanco={puedeRecibidas} />
      <PageHead
        titulo="Facturación"
        subtitulo="Facturas emitidas a clientes que las pidieron — para la declaración"
        derecha={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={datos.periodo}
              onChange={(e) => router.push(`/facturacion?periodo=${e.target.value}`)}
              className="cursor-pointer rounded-full border border-line bg-card px-4 py-2 text-[13.5px] font-semibold capitalize outline-none focus:border-brand"
            >
              <optgroup label="Por trimestre">
                {trimestres.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Por mes">
                {meses.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </option>
                ))}
              </optgroup>
            </select>
            {/* Descarga del período para la gestoría: ZIP con los PDF de las
                emitidas + CSV de emitidas, recibidas y ventas diarias (tickets). */}
            <a
              href={`/facturacion/exportar?periodo=${datos.periodo}`}
              title="Descargar el período para la gestoría (PDFs + CSVs)"
              className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13.5px] font-semibold whitespace-nowrap text-white transition-colors hover:bg-black"
            >
              <Download className="size-4" /> Descargar ZIP
            </a>
          </div>
        }
      />

      {/* Resumen del período para declarar: los tickets facturados NO cuentan
          en "tickets" (su venta viaja en la factura) → no se duplica nada. */}
      <div className="mb-4 grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        <Kpi
          etiqueta={`Ventas en tickets · ${datos.ventasTickets.tickets}`}
          valor={eur(datos.ventasTickets.total)}
          detalle={`base ${eur(datos.ventasTickets.base)} · IVA ${datos.ventasTickets.ivaPct}% ${eur(datos.ventasTickets.iva)}`}
        />
        <Kpi
          etiqueta={`Con factura emitida · ${datos.filas.filter((f) => f.estado === "emitida").length}`}
          valor={eur(datos.total)}
          detalle={`base ${eur(datos.totalBase)} · IVA ${eur(datos.totalIva)}`}
        />
        <Kpi
          etiqueta="Total ventas del período"
          valor={eur(datos.ventasTickets.total + datos.total)}
          detalle={`IVA repercutido ${eur(datos.ventasTickets.iva + datos.totalIva)} · sin duplicar tickets facturados`}
          destacado
        />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
            Facturas · {datos.etiquetaPeriodo}
          </span>
          <span className="text-[11.5px] tracking-wider text-ink-soft uppercase">
            {datos.filas.length} {datos.filas.length === 1 ? "factura" : "facturas"}
          </span>
        </div>

        {datos.filas.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13.5px] text-ink-soft">
            No hay facturas emitidas en este período. Se generan desde el recibo de un ticket cobrado.
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

function Kpi({
  etiqueta,
  valor,
  detalle,
  destacado,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  destacado?: boolean;
}) {
  return (
    <div className={cn("card p-4", destacado && "bg-brand-soft")}>
      <div className="text-[11px] font-semibold tracking-wider text-ink-soft uppercase">{etiqueta}</div>
      <div className={cn("mt-0.5 font-display text-[22px] font-bold tracking-tight", destacado && "text-brand")}>
        {valor}
      </div>
      {detalle && <div className="mt-0.5 text-[11.5px] text-ink-soft">{detalle}</div>}
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
