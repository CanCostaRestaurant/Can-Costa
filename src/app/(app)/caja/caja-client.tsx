"use client";

// Página propia de Caja (antes iba dentro de Ventas): cierre del día con su
// recuento (contador de billetes/monedas), retiradas de efectivo e histórico
// de cierres. Se navega por día con el selector.
import { useRouter } from "next/navigation";
import { PageHead, Chip } from "@/components/ui";
import { DatePicker } from "@/components/date-picker";
import { type CierreDia, type CierreHistorico } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { CajaDelDia } from "./caja-del-dia";

export function CajaClient({
  caja,
  cajas,
  hoy,
}: {
  caja: CierreDia;
  cajas: CierreHistorico[];
  hoy: string;
}) {
  const router = useRouter();

  function cambiarDia(dia: string) {
    router.push(dia === hoy ? "/caja" : `/caja?dia=${dia}`);
  }

  return (
    <section className="anim-in">
      <PageHead
        titulo="Caja"
        subtitulo="Cuadra el efectivo del cajón y el datáfono al cerrar el día"
        derecha={<DatePicker value={caja.fecha} max={hoy} align="right" onChange={(v) => v && cambiarDia(v)} />}
      />

      <div className="mb-3.5">
        <CajaDelDia datos={caja} />
      </div>

      {/* Histórico de cierres */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
            Histórico de cajas
          </span>
          <span className="text-[11.5px] tracking-wider text-ink-soft uppercase">últimos 35 cierres</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <ThHist>Día</ThHist>
                <ThHist>Efectivo</ThHist>
                <ThHist>Datáfono</ThHist>
                <ThHist>Retiradas</ThHist>
                <ThHist>Fondo</ThHist>
                <ThHist>Cerró</ThHist>
                <ThHist>Notas</ThHist>
              </tr>
            </thead>
            <tbody>
              {cajas.map((h, i) => (
                <tr
                  key={h.fecha}
                  onClick={() => cambiarDia(h.fecha)}
                  className={cn(
                    "anim-in cursor-pointer border-b border-line transition-colors last:border-none hover:bg-hover",
                    h.fecha === caja.fecha && "bg-hover",
                  )}
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <td className="px-4 py-2.5 text-sm font-semibold whitespace-nowrap">{h.fechaLegible}</td>
                  <td className="px-4 py-2.5">
                    <CeldaCuadre contado={h.efectivoContado} dif={h.difEfectivo} />
                  </td>
                  <td className="px-4 py-2.5">
                    <CeldaCuadre contado={h.datafono} dif={h.difTarjeta} />
                  </td>
                  <td className="px-4 py-2.5 text-sm text-ink-soft whitespace-nowrap">
                    {h.retiradas > 0 ? `−${eur(h.retiradas, false)}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-display text-sm font-bold whitespace-nowrap">
                    {eur(h.fondoSiguiente)}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-ink-soft">{h.cerradoPor ?? "—"}</td>
                  <td className="max-w-48 truncate px-4 py-2.5 text-[13px] text-ink-soft" title={h.notas ?? ""}>
                    {h.notas ?? "—"}
                  </td>
                </tr>
              ))}
              {cajas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-ink-soft">
                    Aún no has cerrado ninguna caja.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ThHist({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-line px-4 py-2 text-left text-[11px] font-semibold tracking-wider text-ink-soft uppercase">
      {children}
    </th>
  );
}

function CeldaCuadre({ contado, dif }: { contado: number; dif: number }) {
  const cuadra = Math.abs(dif) < 0.005;
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <b className="font-display text-sm font-bold">{eur(contado)}</b>
      {cuadra ? (
        <Chip tone="good">✓</Chip>
      ) : (
        <Chip tone={Math.abs(dif) > 5 ? "bad" : "warn"}>
          {dif > 0 ? "+" : "−"}
          {eur(Math.abs(dif), false)}
        </Chip>
      )}
    </span>
  );
}
