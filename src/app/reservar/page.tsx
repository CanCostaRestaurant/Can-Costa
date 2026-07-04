import type { Metadata } from "next";
import { cargarMandos } from "@/lib/reservas/mandos-db";
import { ReservarWidget } from "./reservar-widget";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const mandos = await cargarMandos();
  return {
    title: `Reservar mesa · ${mandos.restaurante.nombre}`,
    description: `Reserva tu mesa en ${mandos.restaurante.nombre} en unos segundos.`,
  };
}

export default async function ReservarPage() {
  const mandos = await cargarMandos();
  const r = mandos.restaurante;

  const mapsUrl =
    r.mapsUrl.trim() ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.nombre} ${r.direccion}`.trim())}`;

  return (
    <main className="min-h-screen bg-paper px-4 py-8 md:py-14">
      <div className="mx-auto w-full max-w-lg">
        {/* Cabecera de marca */}
        <div className="anim-in mb-6 flex flex-col items-center text-center">
          <div className="grid size-14 place-items-center rounded-[16px] bg-brand font-display text-2xl font-extrabold text-white shadow-(--shadow-lift)">
            {r.nombre.slice(0, 1)}
          </div>
          <h1 className="mt-3 font-display text-[26px] font-extrabold tracking-tight">{r.nombre}</h1>
          {r.direccion && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 text-[13px] font-medium text-ink-soft underline-offset-2 hover:text-brand hover:underline"
            >
              {r.direccion}
            </a>
          )}
        </div>

        <ReservarWidget nombreLocal={r.nombre} telefono={r.telefono} mapsUrl={mapsUrl} />

        <p className="anim-in mt-5 text-center text-[11.5px] text-ink-soft" style={{ animationDelay: "300ms" }}>
          Reserva sin comisiones, directamente con {r.nombre}.
        </p>
      </div>
    </main>
  );
}
