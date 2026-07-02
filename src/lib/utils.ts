import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const nf = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  // es-ES no agrupa 4 cifras por defecto; lo forzamos siempre
  useGrouping: "always" as unknown as boolean,
});

const nf0 = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 0,
  useGrouping: "always" as unknown as boolean,
});

export function eur(n: number, decimales = true): string {
  return `${(decimales ? nf : nf0).format(n)} €`;
}

export function pct(n: number, decimales = 1): string {
  return `${n.toFixed(decimales).replace(".", ",")}%`;
}
