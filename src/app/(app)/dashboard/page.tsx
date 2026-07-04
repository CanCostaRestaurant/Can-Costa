import Link from "next/link";
import { Info } from "lucide-react";
import { getDashboardMes, type ModoDashboard } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { DesgloseTabs } from "./desglose-tabs";

export const dynamic = "force-dynamic";

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function mesActualMadrid(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date()).slice(0, 7);
}

function sumarMeses(mes: string, delta: number): string {
  const [anyo, m] = mes.split("-").map(Number);
  const d = new Date(anyo, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function etiquetaCorta(mes: string): string {
  return `${MESES_CORTOS[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
}

// Techo "bonito" para el eje Y (múltiplo de 1/2/2,5/5 × 10^n).
function techoEje(max: number): number {
  if (max <= 0) return 100;
  const exp = 10 ** Math.floor(Math.log10(max));
  for (const paso of [1, 2, 2.5, 5, 10]) {
    if (max <= paso * exp) return paso * exp;
  }
  return 10 * exp;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; modo?: string; act?: string }>;
}) {
  const params = await searchParams;
  const mesActual = mesActualMadrid();
  const mes =
    params.mes && /^\d{4}-\d{2}$/.test(params.mes) && params.mes <= mesActual ? params.mes : mesActual;
  const modo: ModoDashboard = params.modo === "real" ? "real" : "general";
  const semanal = params.act === "semanal";

  const d = await getDashboardMes(mes, modo);

  const href = (cambios: { mes?: string; modo?: string; act?: string }) => {
    const q = new URLSearchParams();
    const m = cambios.mes ?? mes;
    const mo = cambios.modo ?? modo;
    const a = cambios.act ?? (semanal ? "semanal" : "mensual");
    if (m !== mesActual) q.set("mes", m);
    if (mo !== "general") q.set("modo", mo);
    if (a !== "mensual") q.set("act", a);
    const s = q.toString();
    return `/dashboard${s ? `?${s}` : ""}`;
  };

  // Barras: por día, o agrupadas por semana del mes (1-7, 8-14…).
  const barras = semanal
    ? Array.from({ length: Math.ceil(d.dias.length / 7) }, (_, i) => {
        const trozo = d.dias.slice(i * 7, i * 7 + 7);
        return {
          etiqueta: `Sem ${i + 1}`,
          ventas: trozo.reduce((a, x) => a + x.ventas, 0),
          gastos: trozo.reduce((a, x) => a + x.gastos, 0),
        };
      })
    : d.dias.map((x) => ({ etiqueta: String(x.dia), ventas: x.ventas, gastos: x.gastos }));

  const techo = techoEje(Math.max(...barras.map((b) => Math.max(b.ventas, b.gastos)), 1));
  const marcas = [0.25, 0.5, 0.75, 1].map((f) => f * techo);

  return (
    <section className="anim-in">
      {/* Cabecera: título + modo General / A tiempo real */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold tracking-tight">
          Dashboard
          {modo === "real" && (
            <span className="ml-2.5 align-middle text-[13px] font-bold tracking-widest text-ink-soft uppercase">
              a tiempo real
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          <InfoTip lado="derecha">
            <b className="mb-1 block">General</b>
            En las gráficas generales ves el importe de:
            <ul className="mt-1 list-disc pl-4">
              <li><b>Todas las facturas</b> digitalizadas</li>
              <li><b>Todos los tickets</b> de gasto</li>
              <li><b>Todas las ventas</b> (TPV y apuntes manuales)</li>
            </ul>
            <span className="mt-1.5 block opacity-80">
              *No se muestran los albaranes para asegurar que no se duplica el importe; para verlos, activa el
              modo dashboard «a tiempo real».
            </span>
          </InfoTip>
          <div className="flex rounded-xl border border-line bg-card p-1">
            <Link
              href={href({ modo: "general" })}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none",
                modo === "general" ? "bg-ink text-white" : "text-ink-soft hover:bg-hover hover:text-ink",
              )}
            >
              General
            </Link>
            <Link
              href={href({ modo: "real" })}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none",
                modo === "real" ? "bg-ink text-white" : "text-ink-soft hover:bg-hover hover:text-ink",
              )}
            >
              A tiempo real
            </Link>
          </div>
          <InfoTip lado="izquierda">
            <b className="mb-1 block">A tiempo real</b>
            En las gráficas a tiempo real ves el importe de:
            <ul className="mt-1 list-disc pl-4">
              <li><b>Las facturas</b> digitalizadas</li>
              <li>
                <b>Todos los albaranes</b> — el gasto que se va generando sin tener que esperar a recibir la
                factura
              </li>
              <li><b>Todos los tickets</b> de gasto</li>
              <li><b>Todas las ventas</b></li>
            </ul>
            {d.facturasPendientes > 0 && (
              <span className="mt-1.5 block opacity-80">
                *{d.facturasPendientes} documento{d.facturasPendientes > 1 ? "s" : ""} de este mes aún en la
                bandeja.
              </span>
            )}
          </InfoTip>
        </div>
      </div>

      {/* Barra de control: actividad + carrusel de meses */}
      <div className="card mb-3.5 flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] font-bold tracking-widest text-ink-soft uppercase">Actividad</span>
          <div className="flex rounded-lg bg-chip p-0.5">
            <Link
              href={href({ act: "mensual" })}
              className={cn(
                "rounded-md px-3 py-1 text-[12.5px] font-semibold transition-all duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none",
                !semanal ? "bg-card shadow-sm" : "text-ink-soft hover:text-ink",
              )}
            >
              Mensual
            </Link>
            <Link
              href={href({ act: "semanal" })}
              className={cn(
                "rounded-md px-3 py-1 text-[12.5px] font-semibold transition-all duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none",
                semanal ? "bg-card shadow-sm" : "text-ink-soft hover:text-ink",
              )}
            >
              Semanal
            </Link>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="text-[11.5px] font-bold tracking-widest text-ink-soft uppercase">Fecha</span>
          <div className="flex flex-1 items-center justify-between gap-1 rounded-xl border border-line px-2 py-1.5">
            {[-2, -1, 0, 1, 2].map((delta) => {
              const m = sumarMeses(mes, delta);
              const futuro = m > mesActual;
              if (delta === 0) {
                return (
                  <span key={delta} className="flex items-center gap-1.5">
                    <Link
                      href={href({ mes: sumarMeses(mes, -1) })}
                      className="rounded-md px-1.5 py-0.5 text-ink-soft transition-all duration-150 hover:bg-chip hover:text-ink active:scale-90"
                    >
                      ‹
                    </Link>
                    <b className="text-[13.5px] font-bold whitespace-nowrap">{etiquetaCorta(m)}</b>
                    {sumarMeses(mes, 1) <= mesActual ? (
                      <Link
                        href={href({ mes: sumarMeses(mes, 1) })}
                        className="rounded-md px-1.5 py-0.5 text-ink-soft transition-all duration-150 hover:bg-chip hover:text-ink active:scale-90"
                      >
                        ›
                      </Link>
                    ) : (
                      <span className="px-1.5 py-0.5 text-line">›</span>
                    )}
                  </span>
                );
              }
              return futuro ? (
                <span key={delta} className="px-2 text-[12.5px] whitespace-nowrap text-line max-md:hidden">
                  {etiquetaCorta(m)}
                </span>
              ) : (
                <Link
                  key={delta}
                  href={href({ mes: m })}
                  className="rounded-md px-2 py-0.5 text-[12.5px] whitespace-nowrap text-ink-soft transition-all duration-150 hover:bg-chip hover:text-ink active:scale-95 max-md:hidden"
                >
                  {etiquetaCorta(m)}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* KPIs Gastos / Ventas / Margen */}
      <div className="mb-3.5 grid grid-cols-3 gap-3.5 max-md:grid-cols-1">
        <Kpi
          etiqueta="Gastos"
          mes={`${etiquetaCorta(mes)} · ${d.conIva ? "con IVA" : "sin IVA"}`}
          valor={eur(d.gastos)}
        />
        <Kpi
          etiqueta="Ventas"
          mes={`${etiquetaCorta(mes)} · ${d.ventasConTotal ? "total" : "base"}`}
          valor={eur(d.ventas)}
        />
        <Kpi etiqueta="Margen" mes={etiquetaCorta(mes)} valor={eur(d.margen)} destacado />
      </div>

      <div className="grid grid-cols-[1.55fr_1fr] items-start gap-3.5 max-lg:grid-cols-1">
        {/* Visión general: barras diarias del mes */}
        <div className="card p-5.5 transition-shadow duration-300 hover:shadow-lift">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-bold tracking-tight">
              {modo === "real" ? "Vista a tiempo real" : "Visión general"}
            </h3>
            <span className="text-[12.5px] font-semibold text-ink-soft">{d.etiquetaMes}</span>
          </div>

          <div className="relative mt-8 h-[230px]">
            {/* Rejilla y eje Y */}
            <div className="absolute inset-y-0 right-0 left-12">
              <div className="absolute right-0 bottom-0 left-0 border-t border-line" />
              {marcas.map((m) => (
                <div
                  key={m}
                  className="absolute right-0 left-0 border-t border-dashed border-line"
                  style={{ bottom: `${(m / techo) * 100}%` }}
                />
              ))}
            </div>
            {[0, ...marcas].map((m) => (
              <span
                key={m}
                className="absolute left-0 w-10 translate-y-1/2 text-right text-[10px] text-ink-soft"
                style={{ bottom: `${(m / techo) * 100}%` }}
              >
                {eur(m, false)}
              </span>
            ))}
            {/* Barras */}
            <div className={cn("absolute inset-y-0 right-0 left-12 flex items-end", semanal ? "gap-6 px-6" : "gap-[3px] px-0.5")}>
              {barras.map((b) => (
                <div
                  key={b.etiqueta}
                  title={`${semanal ? b.etiqueta : `Día ${b.etiqueta}`} — ventas ${eur(b.ventas)} · gastos ${eur(b.gastos)}`}
                  className="flex h-full flex-1 items-end justify-center gap-px"
                >
                  <div
                    className={cn(
                      "w-full rounded-t-[3px] bg-[#9CBE8C] transition-[height] duration-500 ease-out anim-grow",
                      semanal ? "max-w-9" : "max-w-2.5",
                    )}
                    style={{ height: `${(b.ventas / techo) * 100}%` }}
                  />
                  <div
                    className={cn(
                      "w-full rounded-t-[3px] bg-ink transition-[height] duration-500 ease-out anim-grow",
                      semanal ? "max-w-9" : "max-w-2.5",
                    )}
                    style={{ height: `${(b.gastos / techo) * 100}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
          {/* Eje X */}
          <div className={cn("mt-1.5 ml-12 flex", semanal ? "gap-6 px-6" : "gap-[3px] px-0.5")}>
            {barras.map((b) => (
              <span key={b.etiqueta} className="flex-1 text-center text-[9.5px] text-ink-soft">
                {b.etiqueta}
              </span>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-4 text-xs font-semibold text-ink-soft">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-[#9CBE8C]" /> Ventas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-ink" /> Gastos
            </span>
          </div>
        </div>

        {/* Desglose del mes */}
        <DesgloseTabs
          etiquetaMes={d.etiquetaMes}
          etiquetaCorta={etiquetaCorta(mes)}
          gastos={d.gastos}
          ventas={d.ventas}
          margen={d.margen}
          margenPct={d.margenPct}
          foodCostPct={d.foodCostPct}
          categorias={d.desgloseCategorias}
          listaVentas={d.desgloseVentas}
          conIva={d.conIva}
        />
      </div>
    </section>
  );
}

function Kpi({
  etiqueta,
  mes,
  valor,
  destacado,
}: {
  etiqueta: string;
  mes: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={cn(
        "card p-5 transition-shadow duration-300 hover:shadow-lift",
        destacado && "bg-ink text-white",
      )}
    >
      <div className="flex items-baseline justify-between">
        <span
          className={cn(
            "text-[12.5px] font-semibold tracking-wider uppercase",
            destacado ? "text-white/70" : "text-ink-soft",
          )}
        >
          {etiqueta}
        </span>
        <span className={cn("text-[11.5px]", destacado ? "text-white/50" : "text-ink-soft/70")}>{mes}</span>
      </div>
      <div className="mt-2 font-display text-[30px] font-bold tracking-tight">{valor}</div>
    </div>
  );
}

function InfoTip({ children, lado }: { children: React.ReactNode; lado: "izquierda" | "derecha" }) {
  return (
    <span className="group relative inline-flex">
      <Info className="size-4 cursor-help text-ink-soft/60 transition-colors hover:text-ink-soft" />
      <span
        className={cn(
          "pointer-events-none invisible absolute top-6 z-30 w-72 translate-y-1 rounded-xl bg-ink p-3.5 text-left text-[12px] leading-relaxed text-white opacity-0 shadow-xl transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100",
          lado === "izquierda" ? "right-0" : "left-0",
        )}
      >
        {children}
      </span>
    </span>
  );
}
