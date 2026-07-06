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
        <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/55 to-black/75" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-[900px] flex-col items-center px-4 py-10 md:py-14">
        {/* ── Wordmark: el "logo" tipográfico de la casa ── */}
        <header className="anim-in mb-8 text-center text-white">
          <div className="mx-auto mb-5 flex items-center justify-center gap-4">
            <span className="h-px w-16 bg-white/40 md:w-24" />
            <span className="font-[Georgia,'Times_New_Roman',serif] text-[15px] text-white/70">✦</span>
            <span className="h-px w-16 bg-white/40 md:w-24" />
          </div>
          <h1 className="font-[Georgia,'Times_New_Roman',serif] text-[38px] leading-none font-normal tracking-[0.18em] uppercase md:text-[46px]">
            {r.nombre}
          </h1>
          <p className="mt-3 text-[11px] font-semibold tracking-[0.3em] text-white/70 uppercase">
            Restaurant · Barcelona
          </p>
          {(r.direccion || r.telefono) && (
            <p className="mt-5 text-[13px] text-white/75">
              {r.direccion && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-4 hover:text-white hover:underline"
                >
                  {r.direccion}
                </a>
              )}
              {r.direccion && r.telefono && <span className="mx-2.5 text-white/40">·</span>}
              {r.telefono && (
                <a href={`tel:${r.telefono.replace(/\s/g, "")}`} className="underline-offset-4 hover:text-white hover:underline">
                  {r.telefono}
                </a>
              )}
            </p>
          )}
        </header>

        {/* ── Motor de reserva (calendario + horas) ── */}
        <ReservarWidget nombreLocal={r.nombre} telefono={r.telefono} mapsUrl={mapsUrl} />

        <p className="anim-in mt-6 text-center text-[12px] text-white/60" style={{ animationDelay: "250ms" }}>
          Reserva sin comisiones, directamente con {r.nombre} · Duración aproximada de la mesa:{" "}
          {textoDuracion(mandos.doblaje.hasta4)}
        </p>

        {/* ── Encuéntranos: mapa embebido (sin API key) ── */}
        {r.direccion && (
          <section className="anim-in mt-14 w-full" style={{ animationDelay: "350ms" }}>
            <div className="mb-6 text-center text-white">
              <div className="mx-auto mb-4 flex items-center justify-center gap-4">
                <span className="h-px w-12 bg-white/40 md:w-20" />
                <span className="font-[Georgia,'Times_New_Roman',serif] text-[13px] text-white/70">✦</span>
                <span className="h-px w-12 bg-white/40 md:w-20" />
              </div>
              <h2 className="font-[Georgia,'Times_New_Roman',serif] text-[24px] font-normal tracking-[0.18em] uppercase md:text-[28px]">
                Encuéntranos
              </h2>
            </div>

            <div className="overflow-hidden rounded-[10px] border border-white/10 shadow-xl">
              <iframe
                src={`https://www.google.com/maps?q=${encodeURIComponent(`${r.nombre} ${r.direccion}`.trim())}&z=16&output=embed`}
                className="block h-[380px] w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title={`Mapa de ${r.nombre}`}
              />
            </div>

            <p className="mt-5 text-center text-[13px] text-white/75">
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-4 hover:text-white hover:underline"
              >
                {r.direccion}
              </a>
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
