import type { Metadata } from "next";
import { headers } from "next/headers";
import { Clock3, MapPin, Phone } from "lucide-react";
import { cargarMandos } from "@/lib/reservas/mandos-db";
import { ReservarWidget } from "./reservar-widget";

export const dynamic = "force-dynamic";

// Foto de portada (CDN de Unsplash, licencia libre). Para poner una foto
// propia del local: súbela a /public (p. ej. /portada.jpg) y cambia esta URL.
const FOTO_PORTADA =
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=2200&q=70";

export async function generateMetadata(): Promise<Metadata> {
  const mandos = await cargarMandos();
  return {
    title: `Reservar mesa · ${mandos.restaurante.nombre}`,
    description: `Reserva tu mesa en ${mandos.restaurante.nombre} en unos segundos.`,
  };
}

function textoDuracion(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export default async function ReservarPage() {
  const mandos = await cargarMandos();
  const r = mandos.restaurante;

  const mapsUrl =
    r.mapsUrl.trim() ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.nombre} ${r.direccion}`.trim())}`;

  // URL absoluta desde el host de la petición: funciona en vercel.app y en el
  // dominio propio en cuanto se conecte, sin tocar nada.
  const cab = await headers();
  const host = cab.get("host") ?? "";
  const base = host ? `${cab.get("x-forwarded-proto") ?? "https"}://${host}` : "";
  const urlReserva = `${base}/reservar`;

  // Datos estructurados (schema.org): le dice a Google que el restaurante
  // acepta reservas y que se hacen aquí.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: r.nombre,
    acceptsReservations: "True",
    ...(r.direccion ? { address: { "@type": "PostalAddress", streetAddress: r.direccion } } : {}),
    ...(r.telefono ? { telephone: r.telefono } : {}),
    ...(base
      ? {
          url: urlReserva,
          potentialAction: {
            "@type": "ReserveAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: urlReserva,
              inLanguage: "es",
              actionPlatform: [
                "http://schema.org/DesktopWebPlatform",
                "http://schema.org/MobileWebPlatform",
              ],
            },
            result: { "@type": "Reservation", name: `Reserva en ${r.nombre}` },
          },
        }
      : {}),
  };

  return (
    <main className="relative min-h-svh overflow-hidden bg-[#171310]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Fondo: foto a sangre con velo oscuro (si la foto no carga, queda el fondo liso) */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={FOTO_PORTADA} alt="" aria-hidden className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-black/65" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-6xl items-center px-4 py-8 md:py-12">
        <div className="anim-in grid w-full items-stretch gap-4 lg:grid-cols-[400px_minmax(0,1fr)]">
          {/* ── Tarjeta del restaurante ── */}
          <aside className="flex flex-col rounded-[26px] bg-paper/95 p-7 shadow-2xl backdrop-blur-sm max-lg:order-2 md:p-8">
            <div className="grid size-16 place-items-center rounded-[18px] bg-brand font-display text-[26px] font-extrabold text-white shadow-(--shadow-lift)">
              {r.nombre.slice(0, 1)}
            </div>
            <h1 className="mt-5 font-display text-[30px] font-extrabold tracking-tight">{r.nombre}</h1>

            <div className="mt-4 flex flex-col gap-2.5 rounded-2xl bg-card p-4 shadow-(--shadow-card)">
              {r.direccion && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2.5 text-[13.5px] font-medium text-ink underline-offset-2 hover:text-brand hover:underline"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-brand" />
                  {r.direccion}
                </a>
              )}
              {r.telefono && (
                <a
                  href={`tel:${r.telefono.replace(/\s/g, "")}`}
                  className="flex items-center gap-2.5 text-[13.5px] font-medium text-ink hover:text-brand"
                >
                  <Phone className="size-4 shrink-0 text-brand" />
                  {r.telefono}
                </a>
              )}
              <span className="flex items-center gap-2.5 text-[13.5px] text-ink-soft">
                <Clock3 className="size-4 shrink-0 text-brand" />
                Las reservas tienen una duración aproximada de {textoDuracion(mandos.doblaje.hasta4)}.
              </span>
            </div>

            <p className="mt-auto pt-6 text-[12px] text-ink-soft">
              Reserva sin comisiones, directamente con {r.nombre}.
            </p>
          </aside>

          {/* ── Motor de reserva ── */}
          <ReservarWidget nombreLocal={r.nombre} telefono={r.telefono} mapsUrl={mapsUrl} />
        </div>
      </div>
    </main>
  );
}
