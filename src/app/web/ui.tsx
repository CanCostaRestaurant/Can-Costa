"use client";

// Piezas con estado de la web pública: header que pasa de transparente a
// papel al hacer scroll (con menú overlay a pantalla completa en móvil,
// estilo Disfrutar) y revelado de secciones al entrar en viewport.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const ANCLAS = [
  { href: "#casa", etiqueta: "La casa" },
  { href: "#carta", etiqueta: "La carta" },
  { href: "#espacio", etiqueta: "El espacio" },
  { href: "#equipo", etiqueta: "Equipo" },
  { href: "#contacto", etiqueta: "Contacto" },
];

export function HeaderWeb({ nombre, telefono }: { nombre: string; telefono?: string }) {
  const [solido, setSolido] = useState(false);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const alScroll = () => setSolido(window.scrollY > 40);
    alScroll();
    window.addEventListener("scroll", alScroll, { passive: true });
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  // Con el menú abierto, la página de detrás no hace scroll.
  useEffect(() => {
    document.documentElement.style.overflow = abierto ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [abierto]);

  const oscuro = !solido && !abierto;

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-500",
          abierto
            ? "bg-transparent py-3"
            : solido
              ? "bg-paper/95 py-3 shadow-[0_1px_0_rgba(34,36,43,0.08)] backdrop-blur-sm"
              : "bg-transparent py-4 md:py-5",
        )}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 md:gap-8 md:px-5">
          <a
            href="#inicio"
            onClick={() => setAbierto(false)}
            className={cn(
              "f-serif text-[15px] tracking-[0.18em] whitespace-nowrap uppercase transition-colors md:text-[19px] md:tracking-[0.22em]",
              oscuro ? "text-white" : "text-ink",
            )}
          >
            {nombre}
          </a>

          {/* Anclas: solo escritorio; en móvil viven en el overlay */}
          <nav
            className={cn(
              "ml-auto hidden items-center gap-7 text-[11.5px] font-semibold tracking-[0.18em] uppercase md:flex",
              oscuro ? "text-white/80" : "text-ink/70",
            )}
          >
            {ANCLAS.map((a) => (
              <a key={a.href} href={a.href} className="nav-link transition-colors hover:text-current">
                {a.etiqueta}
              </a>
            ))}
          </nav>

          <Link
            href="/reservar"
            className={cn(
              "ml-auto border px-3.5 py-2 text-[10.5px] font-semibold tracking-[0.16em] whitespace-nowrap uppercase transition-colors md:ml-0 md:px-5 md:py-2.5 md:text-[11.5px] md:tracking-[0.18em]",
              oscuro
                ? "border-white/70 text-white hover:bg-white hover:text-ink"
                : "border-ink text-ink hover:bg-ink hover:text-paper",
            )}
          >
            Reservar
          </Link>

          {/* Hamburguesa (solo móvil) */}
          <button
            type="button"
            aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={abierto}
            onClick={() => setAbierto((v) => !v)}
            className="relative grid size-10 shrink-0 place-items-center md:hidden"
          >
            <span
              className={cn(
                "absolute h-px w-6 transition-all duration-300",
                oscuro ? "bg-white" : "bg-ink",
                abierto ? "rotate-45" : "-translate-y-[4px]",
              )}
            />
            <span
              className={cn(
                "absolute h-px w-6 transition-all duration-300",
                oscuro ? "bg-white" : "bg-ink",
                abierto ? "-rotate-45" : "translate-y-[4px]",
              )}
            />
          </button>
        </div>
      </header>

      {/* Overlay de menú móvil: papel a pantalla completa, links en serif */}
      <div
        className={cn(
          "fixed inset-0 z-40 flex flex-col bg-paper px-6 pt-24 pb-10 transition-all duration-400 md:hidden",
          abierto ? "visible opacity-100" : "invisible opacity-0",
        )}
      >
        <nav className="flex flex-col">
          {ANCLAS.map((a, i) => (
            <a
              key={a.href}
              href={a.href}
              onClick={() => setAbierto(false)}
              style={{ transitionDelay: abierto ? `${80 + i * 50}ms` : "0ms" }}
              className={cn(
                "f-serif border-b border-ink/10 py-4 text-[30px] font-light text-ink transition-all duration-500",
                abierto ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
              )}
            >
              {a.etiqueta}
            </a>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          <Link
            href="/reservar"
            className="bg-ink px-6 py-4 text-center text-[12px] font-semibold tracking-[0.2em] text-paper uppercase"
          >
            Reservar mesa
          </Link>
          {telefono && (
            <a
              href={`tel:${telefono.replace(/\s/g, "")}`}
              className="border border-ink/25 px-6 py-4 text-center text-[12px] font-semibold tracking-[0.2em] text-ink uppercase"
            >
              Llamar · {telefono}
            </a>
          )}
        </div>
      </div>
    </>
  );
}

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visto, setVisto] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisto(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn("reveal", visto && "reveal-vista", className)}
    >
      {children}
    </div>
  );
}
