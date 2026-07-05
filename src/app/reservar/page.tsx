import type { Metadata } from "next";
import { headers } from "next/headers";
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
    <main className="relative min-h-svh overflow-hidden bg-[#14110E]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Fondo: foto a sangre con velo oscuro (si la foto no carga, queda el fondo liso) */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={FOTO_PORTADA} alt="" aria-hidden className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-6xl items-center px-4 py-8 md:py-14">
        <div className="anim-in grid w-full items-stretch gap-3.5 lg:grid-cols-[390px_minmax(0,1fr)]">
          {/* ── Tarjeta del restaurante: sobria, editorial ── */}
          <aside className="flex flex-col rounded-[10px] bg-white/[.97] p-8 shadow-xl backdrop-blur-sm max-lg:order-2 md:p-10">
            {/* Monograma con borde fino, sin color de marca */}
            <div className="grid size-14 place-items-center border border-ink/25">
              <span className="font-[Georgia,'Times_New_Roman',serif] text-[26px] leading-none text-ink">
                {r.nombre.slice(0, 1)}
              </span>
            </div>

            <h1 className="mt-6 font-[Georgia,'Times_New_Roman',serif] text-[32px] leading-tight font-normal tracking-tight text-ink">
              {r.nombre}
            </h1>
            <div className="mt-3 h-px w-10 bg-ink/30" />

            <dl className="mt-6 flex flex-col text-[13.5px] leading-relaxed">
              {r.direccion && (
                <div className="border-b border-ink/10 py-3 first:pt-0">
                  <dt className="text-[10.5px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
                    Dirección
                  </dt>
                  <dd className="mt-0.5">
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink underline-offset-4 hover:underline"
                    >
                      {r.direccion}
                    </a>
                  </dd>
                </div>
              )}
              {r.telefono && (
                <div className="border-b border-ink/10 py-3">
                  <dt className="text-[10.5px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
                    Teléfono
                  </dt>
                  <dd className="mt-0.5">
                    <a href={`tel:${r.telefono.replace(/\s/g, "")}`} className="text-ink underline-offset-4 hover:underline">
                      {r.telefono}
                    </a>
                  </dd>
                </div>
              )}
              <div className="py-3">
                <dt className="text-[10.5px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
                  Duración de la reserva
                </dt>
                <dd className="mt-0.5 text-ink">{textoDuracion(mandos.doblaje.hasta4)} aprox.</dd>
              </div>
            </dl>

            <p className="mt-auto pt-8 text-[12px] text-ink-soft">
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
