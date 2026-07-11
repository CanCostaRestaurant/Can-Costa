"use client";

// Piezas con estado de la web pública: header que pasa de transparente a
// papel al hacer scroll, y revelado de secciones al entrar en viewport.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const ANCLAS = [
  { href: "#casa", etiqueta: "La casa" },
  { href: "#carta", etiqueta: "La carta" },
  { href: "#espacio", etiqueta: "El espacio" },
  { href: "#contacto", etiqueta: "Contacto" },
];

export function HeaderWeb({ nombre }: { nombre: string }) {
  const [solido, setSolido] = useState(false);

  useEffect(() => {
    const alScroll = () => setSolido(window.scrollY > 40);
    alScroll();
    window.addEventListener("scroll", alScroll, { passive: true });
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        solido ? "bg-paper/95 py-3 shadow-[0_1px_0_rgba(34,36,43,0.08)] backdrop-blur-sm" : "bg-transparent py-5",
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-8 px-5">
        <a
          href="#inicio"
          className={cn(
            "f-serif text-[19px] tracking-[0.22em] uppercase transition-colors",
            solido ? "text-ink" : "text-white",
          )}
        >
          {nombre}
        </a>

        <nav
          className={cn(
            "ml-auto hidden items-center gap-7 text-[11.5px] font-semibold tracking-[0.18em] uppercase md:flex",
            solido ? "text-ink/70" : "text-white/80",
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
            "ml-auto border px-5 py-2.5 text-[11.5px] font-semibold tracking-[0.18em] uppercase transition-colors md:ml-0",
            solido
              ? "border-ink text-ink hover:bg-ink hover:text-paper"
              : "border-white/70 text-white hover:bg-white hover:text-ink",
          )}
        >
          Reservar
        </Link>
      </div>
    </header>
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
