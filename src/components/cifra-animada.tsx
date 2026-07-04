"use client";

import { useEffect, useRef, useState } from "react";

const nf = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always" as unknown as boolean,
});

// Número que "cuenta" hasta su valor al aparecer (y cuando el valor cambia).
// Respeta prefers-reduced-motion mostrando el valor directamente.
export function CifraAnimada({ valor, sufijo = " €" }: { valor: number; sufijo?: string }) {
  const [mostrado, setMostrado] = useState(valor);
  const desdeRef = useRef(0); // primera vez: cuenta desde 0
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMostrado(valor);
      desdeRef.current = valor;
      return;
    }
    const desde = desdeRef.current;
    if (desde === valor) return;
    const duracion = 650;
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      const suavizado = 1 - Math.pow(1 - t, 3); // ease-out cúbico
      setMostrado(desde + (valor - desde) * suavizado);
      if (t < 1) rafRef.current = requestAnimationFrame(paso);
      else desdeRef.current = valor;
    };
    rafRef.current = requestAnimationFrame(paso);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      desdeRef.current = valor;
    };
  }, [valor]);

  return (
    <span className="tabular-nums">
      {nf.format(mostrado)}
      {sufijo}
    </span>
  );
}
