// Web pública del restaurante — dirección de arte "carta editorial
// mediterránea": papel y tinta con filetes finos contra UNA barra gruesa por
// sección (Disfrutar), hero oscuro con serif light en mayúsculas y un solo
// acento bronce (La Brochette), copy corto y cálido con la reserva siempre a
// un scroll (El Tribut). La carta se pinta EN VIVO desde la tabla platos del
// CRM (sin preparaciones internas y solo con PVP fijado) y todos los datos de
// la casa (nombre, dirección, teléfono, turnos) salen de los mandos de
// Ajustes: renombrar el restaurante actualiza la web sola.
import { headers } from "next/headers";
import Link from "next/link";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { conPlazo, getDb, schema } from "@/lib/db";
import { cargarMandos } from "@/lib/reservas/mandos-db";
import { eur } from "@/lib/utils";
import { HeaderWeb, Reveal } from "./ui";

export const dynamic = "force-dynamic";

const BRONCE = "#A47B4F";

// Fotos de ambiente (CDN Unsplash, licencia libre) — placeholders hasta tener
// reportaje propio: se sustituyen subiendo ficheros a /public y cambiando URLs.
const FOTOS = {
  hero: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=2200&q=70",
  casa: "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1000&q=70",
  mercado: "https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=900&q=70",
  brasa: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=70",
  bodega: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=900&q=70",
  sala: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=70",
  detalle: "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=70",
  terraza: "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=70",
  mesa: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=2200&q=70",
};

type TipoPlato = "entrante" | "principal" | "postre" | "bebida" | "otro";
type PlatoCarta = { nombre: string; tipo: TipoPlato; pvp: number };

// Carta pública: platos activos con precio fijado, sin sub-recetas internas.
async function getCartaPublica(): Promise<PlatoCarta[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const filas = await conPlazo(
      db
        .select({ nombre: schema.platos.nombre, tipo: schema.platos.tipoPlato, pvp: schema.platos.pvp })
        .from(schema.platos)
        .where(
          and(
            eq(schema.platos.activo, true),
            eq(schema.platos.esPreparacion, false),
            isNotNull(schema.platos.pvp),
          ),
        )
        .orderBy(asc(schema.platos.nombre)),
    );
    return filas
      .map((f) => ({ nombre: f.nombre, tipo: f.tipo, pvp: Number(f.pvp) }))
      .filter((f) => f.pvp > 0);
  } catch (e) {
    console.error("[web] getCartaPublica falló:", e instanceof Error ? e.message : e);
    return [];
  }
}

const GRUPOS_CARTA: { tipo: TipoPlato; titulo: string }[] = [
  { tipo: "entrante", titulo: "Para empezar" },
  { tipo: "principal", titulo: "Principales" },
  { tipo: "postre", titulo: "Dulce final" },
];

export default async function WebPage() {
  const [mandos, carta] = await Promise.all([cargarMandos(), getCartaPublica()]);
  const r = mandos.restaurante;

  const mapsUrl =
    r.mapsUrl.trim() ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.nombre} ${r.direccion}`.trim())}`;

  const cab = await headers();
  const host = cab.get("host") ?? "";
  const base = host ? `${cab.get("x-forwarded-proto") ?? "https"}://${host}` : "";

  const grupos = GRUPOS_CARTA.map((g) => ({
    ...g,
    platos: carta.filter((p) => p.tipo === g.tipo),
  })).filter((g) => g.platos.length > 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: r.nombre,
    servesCuisine: "Cocina mediterránea",
    acceptsReservations: "True",
    ...(r.direccion ? { address: { "@type": "PostalAddress", streetAddress: r.direccion } } : {}),
    ...(r.telefono ? { telephone: r.telefono } : {}),
    ...(base ? { url: `${base}/web`, menu: `${base}/web#carta` } : {}),
  };

  return (
    <main className="bg-paper text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <HeaderWeb nombre={r.nombre} />

      {/* ══ HERO ══ */}
      <section id="inicio" className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[#14110E]">
        <div className="absolute inset-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={FOTOS.hero} alt="" aria-hidden className="kenburns h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/45 to-black/70" />
        </div>

        <div className="relative z-10 px-5 text-center text-white">
          <Reveal>
            <p className="text-[11px] font-semibold tracking-[0.34em] text-white/70 uppercase">
              Restaurant · Barcelona
            </p>
          </Reveal>
          <Reveal delay={150}>
            <h1 className="f-serif mt-6 text-[clamp(46px,9vw,110px)] leading-[1.05] font-light tracking-[0.14em] uppercase">
              {r.nombre}
            </h1>
          </Reveal>
          <Reveal delay={300}>
            <p className="f-serif mt-6 text-[clamp(17px,2.2vw,22px)] font-normal text-white/85 italic">
              Producto de mercado. Fuego lento. Mediterráneo.
            </p>
          </Reveal>
          <Reveal delay={450}>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/reservar"
                className="bg-paper px-8 py-3.5 text-[11.5px] font-semibold tracking-[0.2em] text-ink uppercase transition-colors hover:bg-white"
              >
                Reservar mesa
              </Link>
              <a
                href="#carta"
                className="border border-white/60 px-8 py-3.5 text-[11.5px] font-semibold tracking-[0.2em] text-white uppercase transition-colors hover:bg-white hover:text-ink"
              >
                Ver la carta
              </a>
            </div>
          </Reveal>
        </div>

        <div className="absolute bottom-7 left-1/2 -translate-x-1/2 text-white/50">
          <div className="mx-auto h-10 w-px bg-white/40" />
        </div>
      </section>

      {/* ══ LA CASA ══ */}
      <section id="casa" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20 md:py-28">
        <Reveal>
          <Cabecera kicker="La casa" titulo="Cocina de mercado, maneras de fonda" />
        </Reveal>

        <div className="mt-12 grid items-center gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-16">
          <Reveal>
            <div className="relative aspect-[2/3] w-full overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={FOTOS.casa} alt={`Cocina de ${r.nombre}`} className="h-full w-full object-cover" />
            </div>
          </Reveal>
          <Reveal delay={150}>
            <div>
              <p className="f-serif text-[clamp(24px,3vw,32px)] leading-snug font-light">
                Una casa de comidas de hoy: lonja y payés, brasa y cuchara, la temporada mandando en la
                pizarra.
              </p>
              <p className="mt-6 leading-relaxed text-ink-soft">
                En {r.nombre} cocinamos lo que el mercado da cada mañana. Platos de memoria — los arroces,
                el pescado de playa, la casquería fina — tratados con técnica y servidos sin ceremonia,
                en mesas donde nadie tiene prisa.
              </p>
              <p className="mt-4 leading-relaxed text-ink-soft">
                Carta corta que cambia con la semana, vinos catalanes vivos y el fuego encendido desde el
                mediodía hasta la última sobremesa.
              </p>
              <div className="mt-8 flex flex-wrap gap-x-10 gap-y-3 border-t border-ink/15 pt-6 text-[11px] font-semibold tracking-[0.22em] uppercase" style={{ color: BRONCE }}>
                <span>Producto de lonja</span>
                <span>Brasa de encina</span>
                <span>Vinos vivos</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ TRES PILARES ══ */}
      <section className="mx-auto max-w-6xl px-5 pb-20 md:pb-28">
        <div className="grid gap-8 md:grid-cols-3">
          {[
            {
              foto: FOTOS.mercado,
              titulo: "Mercado",
              texto: "El género se compra cada mañana: lo que no está en su punto, no entra en cocina.",
            },
            {
              foto: FOTOS.brasa,
              titulo: "Brasa",
              texto: "Fuego lento de encina: humo, hierro y paciencia para el pescado y la carne madurada.",
            },
            {
              foto: FOTOS.bodega,
              titulo: "Bodega",
              texto: "Vinos catalanes y mediterráneos de payés, elegidos para la mesa, no para la etiqueta.",
            },
          ].map((p, i) => (
            <Reveal key={p.titulo} delay={i * 130}>
              <article className="group">
                <div className="aspect-[2/3] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.foto}
                    alt={p.titulo}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                </div>
                <h3 className="f-serif mt-5 text-[24px] font-light tracking-[0.18em] uppercase">{p.titulo}</h3>
                <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-ink-soft">{p.texto}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══ LA CARTA (en vivo desde el CRM) ══ */}
      <section id="carta" className="mx-auto max-w-6xl scroll-mt-24 px-5 pb-20 md:pb-28">
        <Reveal>
          <Cabecera kicker="La carta" titulo="Lo que da el mercado esta semana" />
        </Reveal>

        {grupos.length > 0 ? (
          <>
            <div className="mt-12 grid gap-x-16 gap-y-12 md:grid-cols-2">
              {grupos.map((g, i) => (
                <Reveal key={g.tipo} delay={i * 120} className={g.platos.length > 9 ? "md:col-span-2" : undefined}>
                  <div>
                    <h3
                      className="mb-5 text-[11px] font-bold tracking-[0.26em] uppercase"
                      style={{ color: BRONCE }}
                    >
                      {g.titulo}
                    </h3>
                    <ul className={g.platos.length > 9 ? "grid gap-x-16 md:grid-cols-2" : undefined}>
                      {g.platos.map((p) => (
                        <li key={p.nombre} className="flex items-baseline py-2 text-[15px]">
                          <span className="f-serif text-[17px]">{p.nombre}</span>
                          <span className="leader" aria-hidden />
                          <span className="tabular-nums">{eur(p.pvp)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal>
              <p className="mt-10 border-t border-ink/15 pt-5 text-[13px] text-ink-soft">
                Precios con IVA. La carta cambia con el mercado — si un plato se acaba, se acaba.
                Alergias e intolerancias: pregúntanos en sala.
              </p>
            </Reveal>
          </>
        ) : (
          <Reveal>
            <p className="f-serif mt-12 max-w-xl text-[22px] leading-snug font-light">
              La carta se escribe cada semana con lo que da el mercado.
              <span className="mt-3 block text-[15px] font-normal text-ink-soft">
                Pídela en sala{r.telefono ? ` o llámanos al ${r.telefono}` : ""} — y déjate aconsejar.
              </span>
            </p>
          </Reveal>
        )}
      </section>

      {/* ══ EL ESPACIO ══ */}
      <section id="espacio" className="scroll-mt-0 bg-[#14110E] py-20 text-white md:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <div>
              <div className="h-[6px] w-full bg-white" />
              <div className="mt-5 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="f-serif text-[clamp(30px,4.5vw,46px)] leading-tight font-light">
                  Luz de barrio, mesas sin prisa
                </h2>
                <span className="text-[11px] font-bold tracking-[0.26em] uppercase" style={{ color: BRONCE }}>
                  El espacio
                </span>
              </div>
            </div>
          </Reveal>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[FOTOS.sala, FOTOS.detalle, FOTOS.terraza].map((f, i) => (
              <Reveal key={f} delay={i * 130}>
                <div className="h-[320px] overflow-hidden md:h-[420px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f} alt="" className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.04]" />
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <p className="mt-10 max-w-2xl leading-relaxed text-white/70">
              Comedor de luz natural, barra para comer solo y bien, y sobremesas largas. El espacio lo
              hicimos como la cocina: materiales nobles, nada que sobre.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ══ CONTACTO / INFORMACIÓN PRÁCTICA ══ */}
      <section id="contacto" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20 md:py-28">
        <Reveal>
          <Cabecera kicker="Contacto" titulo="Dónde y cuándo" />
        </Reveal>

        <div className="mt-12 grid gap-12 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Reveal>
            <dl className="flex flex-col text-[15px]">
              <div className="border-b border-ink/15 py-5 first:pt-0">
                <dt className="text-[11px] font-bold tracking-[0.26em] uppercase" style={{ color: BRONCE }}>
                  Horarios
                </dt>
                <dd className="mt-2 flex flex-col gap-1">
                  {mandos.servicios.map((s) => (
                    <span key={s.nombre}>
                      <b className="font-semibold">{s.nombre}</b> — {s.inicio} a {s.fin}
                    </span>
                  ))}
                </dd>
              </div>
              {r.direccion && (
                <div className="border-b border-ink/15 py-5">
                  <dt className="text-[11px] font-bold tracking-[0.26em] uppercase" style={{ color: BRONCE }}>
                    Dirección
                  </dt>
                  <dd className="mt-2">
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                      {r.direccion}
                    </a>
                  </dd>
                </div>
              )}
              {r.telefono && (
                <div className="border-b border-ink/15 py-5">
                  <dt className="text-[11px] font-bold tracking-[0.26em] uppercase" style={{ color: BRONCE }}>
                    Teléfono
                  </dt>
                  <dd className="mt-2">
                    <a href={`tel:${r.telefono.replace(/\s/g, "")}`} className="underline-offset-4 hover:underline">
                      {r.telefono}
                    </a>
                  </dd>
                </div>
              )}
              <div className="py-5">
                <dt className="text-[11px] font-bold tracking-[0.26em] uppercase" style={{ color: BRONCE }}>
                  Reservas
                </dt>
                <dd className="mt-3">
                  <Link
                    href="/reservar"
                    className="inline-block border border-ink px-6 py-3 text-[11.5px] font-semibold tracking-[0.2em] uppercase transition-colors hover:bg-ink hover:text-paper"
                  >
                    Reservar online
                  </Link>
                  <p className="mt-3 text-[13px] text-ink-soft">Sin comisiones, directamente con la casa.</p>
                </dd>
              </div>
            </dl>
          </Reveal>

          {r.direccion && (
            <Reveal delay={150}>
              <div className="h-full min-h-[360px] overflow-hidden border border-ink/15">
                <iframe
                  src={`https://www.google.com/maps?q=${encodeURIComponent(`${r.nombre} ${r.direccion}`.trim())}&z=16&output=embed`}
                  className="block h-full min-h-[360px] w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={`Mapa de ${r.nombre}`}
                />
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* ══ BANDA FINAL DE RESERVA ══ */}
      <section className="relative overflow-hidden bg-[#14110E] py-24 text-center text-white md:py-32">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={FOTOS.mesa} alt="" aria-hidden className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/70" />
        </div>
        <Reveal className="relative z-10 px-5">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.34em] text-white/70 uppercase">{r.nombre}</p>
            <p className="f-serif mt-5 text-[clamp(34px,6vw,64px)] leading-tight font-light">
              La mesa está puesta.
            </p>
            <Link
              href="/reservar"
              className="mt-9 inline-block bg-paper px-10 py-4 text-[11.5px] font-semibold tracking-[0.2em] text-ink uppercase transition-colors hover:bg-white"
            >
              Reservar mesa
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ══ FOOTER ══ */}
      <footer className="bg-ink py-14 text-[13px] text-white/60">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="grid size-12 place-items-center border border-white/25">
              <span className="f-serif text-[20px] text-white">{r.nombre.slice(0, 1)}</span>
            </div>
            <p className="f-serif mt-4 text-[18px] tracking-[0.2em] text-white uppercase">{r.nombre}</p>
            <p className="mt-2 max-w-xs leading-relaxed">
              Cocina mediterránea de mercado en Barcelona. Reserva sin comisiones, directamente con la casa.
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="text-[10.5px] font-bold tracking-[0.26em] text-white/40 uppercase">Visita</span>
            {r.direccion && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                {r.direccion}
              </a>
            )}
            {r.telefono && (
              <a href={`tel:${r.telefono.replace(/\s/g, "")}`} className="hover:text-white">
                {r.telefono}
              </a>
            )}
            {mandos.servicios.map((s) => (
              <span key={s.nombre}>
                {s.nombre}: {s.inicio}–{s.fin}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="text-[10.5px] font-bold tracking-[0.26em] text-white/40 uppercase">Enlaces</span>
            <a href="#casa" className="hover:text-white">La casa</a>
            <a href="#carta" className="hover:text-white">La carta</a>
            <a href="#espacio" className="hover:text-white">El espacio</a>
            <Link href="/reservar" className="hover:text-white">Reservar mesa</Link>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-6xl border-t border-white/10 px-5 pt-6 text-[11.5px] text-white/35">
          © {new Date().getFullYear()} {r.nombre} · Barcelona
        </div>
      </footer>
    </main>
  );
}

// Cabecera de sección estilo "revista impresa": barra de tinta gruesa contra
// filetes finos, kicker bronce en versalitas y título serif en peso light.
function Cabecera({ kicker, titulo }: { kicker: string; titulo: string }) {
  return (
    <div>
      <div className="h-[6px] w-full bg-ink" />
      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="f-serif text-[clamp(30px,4.5vw,46px)] leading-tight font-light">{titulo}</h2>
        <span className="text-[11px] font-bold tracking-[0.26em] uppercase" style={{ color: BRONCE }}>
          {kicker}
        </span>
      </div>
    </div>
  );
}
