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
import { cargarMandos } from "@/lib/reservas/mandos-db";
import { eur } from "@/lib/utils";
import { HeaderWeb, Reveal } from "./ui";

export const dynamic = "force-dynamic";

const BRONCE = "#A47B4F";

// Fotos de ambiente (CDN Unsplash, licencia libre) con intención "de casa"
// (fuego, manos, sobremesa — nada de bodegón comercial), estilo fotos reales
// de perfil de Google. Placeholders hasta tener reportaje propio: se
// sustituyen subiendo ficheros a /public y cambiando URLs.
// Set curado A MANO mirando cada foto (estilo IG de bar de barrio: comida
// sobre la mesa, luz real, gente, cero bodegón): pasta de almejas con vino,
// contraluz de ventana con grano, tomates de mercado, costillar tostado,
// botellas, sala llena, paella, comedor con plantas y sobremesa sobre
// baldosa hidráulica.
const FOTOS = {
  hero: "photo-1551218808-94e220e084d2", // mano SIN tatuajes aliñando en hilo un plato negro (verdura a la brasa): el gesto de alta cocina de la referencia, en oscuro editorial
  casa: "photo-1482275548304-a58859dc31b7",
  mercado: "photo-1561136594-7f68413baa99",
  brasa: "photo-1529193591184-b1d58069ecdd",
  bodega: "photo-1516594915697-87eb3b1c14ea",
  sala: "photo-1525610553991-2bede1a236e2",
  detalle: "photo-1559742811-822873691df8", // llagostins a la brasa en plato negro (está en la carta)
  terraza: "photo-1537047902294-62a40c20a6ae",
  mesa: "photo-1466978913421-dad2ebd01d17",
};

// El 90% del tráfico será móvil: cada <img> lleva srcset para que un iPhone
// en 4G baje ~480-800px en vez de la foto de 2200px de escritorio.
const foto = (id: string, w: number) => `https://images.unsplash.com/${id}?auto=format&fit=crop&q=70&w=${w}`;
const fotoSet = (id: string) => [480, 800, 1200, 1800].map((w) => `${foto(id, w)} ${w}w`).join(", ");

// La carta REAL de la casa, en catalán (los precios son provisionales hasta
// fijar los definitivos). Cuando la carta esté cargada en el CRM con sus PVP
// reales, se puede volver a pintar en vivo desde la tabla platos.
type PlatoCarta = { nombre: string; pvp: number; nota?: string };

const CARTA: { titulo: string; platos: PlatoCarta[] }[] = [
  {
    titulo: "Per picar",
    platos: [
      { nombre: "Braves", pvp: 6.5 },
      { nombre: "Cecina", pvp: 12 },
      { nombre: "Croqueta de pollastre a la brasa", pvp: 2.9, nota: "u." },
      { nombre: "Amanida de tomàquet", pvp: 9.5 },
      { nombre: "Torradeta d'anxova fumada", pvp: 4.8, nota: "u." },
      { nombre: "Formatge de cabra i figues a la brasa", pvp: 11.5 },
    ],
  },
  {
    titulo: "Platillos",
    platos: [
      { nombre: "Macarrons de rostit de pollastre", pvp: 12.5 },
      { nombre: "Musclos a la marinera", pvp: 13.5 },
      { nombre: "Carxofa amb pernil", pvp: 14.5 },
      { nombre: "Calamarsets", pvp: 16.9 },
      { nombre: "Albergínia a la brasa amb ricotta i nous", pvp: 12 },
      { nombre: "Tomàquet confitat amb porro i stracciatella", pvp: 13 },
    ],
  },
  {
    titulo: "Brasa",
    platos: [
      { nombre: "Roger a la brasa amb pilpil", pvp: 19.5 },
      { nombre: "Parpatana de tonyina a la brasa", pvp: 24 },
      { nombre: "Llagostí a la brasa", pvp: 22 },
      { nombre: "Xuleta a la brasa", pvp: 58, nota: "kg" },
    ],
  },
  {
    titulo: "Postres",
    platos: [
      { nombre: "Carquinyolis i encenalls", pvp: 6.5 },
      { nombre: "Moixaines", pvp: 7 },
      { nombre: "Torrija de croissant", pvp: 7.5 },
      { nombre: "Préssec amb gelat de vainilla", pvp: 6.9 },
    ],
  },
];

export default async function WebPage() {
  const mandos = await cargarMandos();
  const r = mandos.restaurante;

  const mapsUrl =
    r.mapsUrl.trim() ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.nombre} ${r.direccion}`.trim())}`;

  const cab = await headers();
  const host = cab.get("host") ?? "";
  const base = host ? `${cab.get("x-forwarded-proto") ?? "https"}://${host}` : "";

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
      <HeaderWeb nombre={r.nombre} telefono={r.telefono} />

      {/* ══ HERO ══ */}
      <section id="inicio" className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[#14110E]">
        <div className="absolute inset-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={foto(FOTOS.hero, 1800)}
            srcSet={fotoSet(FOTOS.hero)}
            sizes="100vw"
            fetchPriority="high"
            alt=""
            aria-hidden
            className="kenburns h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/45 to-black/70" />
        </div>

        <div className="relative z-10 px-5 text-center text-white">
          <Reveal>
            <p className="text-[11px] font-semibold tracking-[0.34em] text-white/70 uppercase">
              Restaurant · Barcelona
            </p>
          </Reveal>
          <Reveal delay={150}>
            <h1 className="f-serif mt-6 text-[clamp(36px,11vw,110px)] leading-[1.05] font-light tracking-[0.14em] uppercase">
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
      <section id="casa" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 md:py-28">
        <Reveal>
          <Cabecera kicker="La casa" titulo="Cocina de mercado, maneras de fonda" />
        </Reveal>

        <div className="mt-12 grid items-center gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-16">
          <Reveal>
            <div className="relative aspect-[4/5] w-full overflow-hidden md:aspect-[2/3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={foto(FOTOS.casa, 1000)}
                srcSet={fotoSet(FOTOS.casa)}
                sizes="(min-width: 768px) 42vw, 100vw"
                loading="lazy"
                decoding="async"
                alt={`Cocina de ${r.nombre}`}
                className="h-full w-full object-cover"
              />
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
      {/* En móvil es un carrusel con snap (se hojea con el pulgar); en
          escritorio, la retícula de tres columnas de siempre. */}
      <section className="mx-auto max-w-6xl px-5 pb-16 md:pb-28">
        <div className="sin-scrollbar -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 md:mx-0 md:grid md:grid-cols-3 md:gap-8 md:overflow-visible md:px-0">
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
            <Reveal key={p.titulo} delay={i * 130} className="w-[76%] shrink-0 snap-start md:w-auto">
              <article className="group">
                <div className="aspect-[3/4] overflow-hidden md:aspect-[2/3]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={foto(p.foto, 900)}
                    srcSet={fotoSet(p.foto)}
                    sizes="(min-width: 768px) 31vw, 76vw"
                    loading="lazy"
                    decoding="async"
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
      <section id="carta" className="mx-auto max-w-6xl scroll-mt-24 px-5 pb-16 md:pb-28">
        <Reveal>
          <Cabecera kicker="La carta" titulo="Lo que da el mercado esta semana" />
        </Reveal>

        {/* El ritual de la casa: la cervesa con su picada, destacado como
            una línea de bienvenida antes de la carta */}
        <Reveal>
          <div className="mt-10 flex flex-wrap items-baseline gap-x-4 gap-y-1 border border-ink/20 px-6 py-5">
            <span className="f-serif text-[22px] font-light italic">Amb la cervesa</span>
            <span className="text-[13.5px] text-ink-soft">oliva gilda o brava</span>
            <span className="leader" aria-hidden />
            <span className="tabular-nums text-[15px]">{eur(4)}</span>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-x-16 gap-y-12 md:grid-cols-2">
          {CARTA.map((g, i) => (
            <Reveal key={g.titulo} delay={i * 120}>
              <div>
                <h3
                  className="mb-5 text-[11px] font-bold tracking-[0.26em] uppercase"
                  style={{ color: BRONCE }}
                >
                  {g.titulo}
                </h3>
                <ul>
                  {g.platos.map((p) => (
                    <li key={p.nombre} className="flex items-baseline py-2 text-[15px]">
                      <span className="f-serif text-[17px]">{p.nombre}</span>
                      <span className="leader" aria-hidden />
                      <span className="tabular-nums whitespace-nowrap">
                        {eur(p.pvp)}
                        {p.nota && <span className="ml-1 text-[12px] text-ink-soft">/ {p.nota}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="mt-10 border-t border-ink/15 pt-5 text-[13px] text-ink-soft">
            Preus amb IVA. La carta canvia amb el mercat — si un plat s&apos;acaba, s&apos;acaba.
            Al·lèrgies i intoleràncies: pregunta&apos;ns a sala.
          </p>
        </Reveal>
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

          <div className="sin-scrollbar -mx-5 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 md:mx-0 md:mt-12 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
            {[FOTOS.sala, FOTOS.detalle, FOTOS.terraza].map((f, i) => (
              <Reveal key={f} delay={i * 130} className="w-[82%] shrink-0 snap-start md:w-auto">
                <div className="h-[300px] overflow-hidden md:h-[420px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={foto(f, 1200)}
                    srcSet={fotoSet(f)}
                    sizes="(min-width: 768px) 31vw, 82vw"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.04]"
                  />
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

      {/* ══ EL EQUIPO ══ */}
      <section id="equipo" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 md:py-28">
        <Reveal>
          <Cabecera kicker="El equipo" titulo="Dos socios, una casa" />
        </Reveal>

        <Reveal delay={120}>
          <p className="f-serif mt-10 max-w-2xl text-[clamp(20px,2.6vw,26px)] leading-snug font-light">
            Dos socios jóvenes y una idea vieja: producto, fuego y hospitalidad. Uno manda en la sala,
            el otro en la brasa — y la casa es de los dos.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-8 md:grid-cols-2">
          {[
            {
              inicial: "P",
              nombre: "Pau",
              rol: "Jefe de sala · Socio",
              bio: "La sala es suya: los vinos vivos de la bodega, la memoria de cada mesa y la sobremesa como religión. Si has venido dos veces, ya sabe qué bebes.",
            },
            {
              inicial: "I",
              nombre: "Iou",
              rol: "Jefe de cocina · Socio",
              bio: "El fuego es suyo: mercado de mañana, brasa de encina y una carta corta que no necesita discurso. Lo que no está en su punto, no sale al pase.",
            },
          ].map((s, i) => (
            <Reveal key={s.nombre} delay={i * 150}>
              <article className="flex h-full flex-col border border-ink/20 p-8 transition-colors hover:bg-ink hover:text-paper md:p-10">
                <span className="f-serif text-[64px] leading-none font-light" style={{ color: BRONCE }}>
                  {s.inicial}
                </span>
                <h3 className="f-serif mt-6 text-[30px] font-light">{s.nombre}</h3>
                <p className="mt-1 text-[11px] font-bold tracking-[0.26em] uppercase" style={{ color: BRONCE }}>
                  {s.rol}
                </p>
                <p className="mt-5 text-[14.5px] leading-relaxed opacity-80">{s.bio}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══ CONTACTO / INFORMACIÓN PRÁCTICA ══ */}
      <section id="contacto" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 md:py-28">
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
      <section className="relative overflow-hidden bg-[#14110E] py-20 text-center text-white md:py-32">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={foto(FOTOS.mesa, 1800)}
            srcSet={fotoSet(FOTOS.mesa)}
            sizes="100vw"
            loading="lazy"
            decoding="async"
            alt=""
            aria-hidden
            className="h-full w-full object-cover"
          />
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
            <a href="#equipo" className="hover:text-white">El equipo</a>
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
