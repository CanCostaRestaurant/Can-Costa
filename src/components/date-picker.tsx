"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* Calendario propio, a juego con la marca (papel cálido + acento naranja).
   Sustituye al <input type="date"> / type="month" nativos, que no se pueden
   estilizar y salen en azul del navegador. Trabaja con strings "YYYY-MM(-DD)". */

const DIAS_CABECERA = ["L", "M", "X", "J", "V", "S", "D"];
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]; // Date.getDay(): 0=dom
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`; // m: 1-12

function hoyYmd() {
  const t = new Date();
  return ymd(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

function parseYmd(v?: string) {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/* Cierra al hacer clic fuera o con Escape. */
function usePopover<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/* 42 celdas (6 filas) con lunes primero, incluyendo días de meses vecinos. */
function construirMalla(y: number, m: number) {
  const primero = new Date(y, m - 1, 1);
  const desfase = (primero.getDay() + 6) % 7; // getDay 0=dom -> lunes=0
  const inicio = new Date(y, m - 1, 1 - desfase);
  return Array.from({ length: 42 }, (_, i) => {
    const dt = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    const cy = dt.getFullYear();
    const cm = dt.getMonth() + 1;
    const cd = dt.getDate();
    return { d: cd, ymd: ymd(cy, cm, cd), enMes: cm === m && cy === y };
  });
}

const PANEL =
  "anim-in absolute top-full z-50 mt-2 rounded-[18px] border border-line bg-card p-3 shadow-lift";
const NAV_BTN =
  "grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-ink-soft transition-colors hover:bg-hover hover:text-ink";

export function DatePicker({
  value,
  onChange,
  min,
  max,
  align = "right",
  clearable,
  className,
}: {
  value: string; // "YYYY-MM-DD"
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  align?: "left" | "right";
  clearable?: boolean;
  className?: string;
}) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const hoy = hoyYmd();
  const sel = parseYmd(value);

  const [vista, setVista] = useState(() => {
    const base = sel ?? parseYmd(hoy)!;
    return { y: base.y, m: base.m };
  });

  // Al abrir, saltar siempre al mes de la fecha seleccionada (o al de hoy).
  useEffect(() => {
    if (!open) return;
    const base = parseYmd(value) ?? parseYmd(hoy)!;
    setVista({ y: base.y, m: base.m });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const malla = useMemo(() => construirMalla(vista.y, vista.m), [vista]);
  const bloqueado = (d: string) => (min && d < min) || (max && d > max);

  const etiqueta = sel
    ? `${DIAS_CORTOS[new Date(sel.y, sel.m - 1, sel.d).getDay()]} ${sel.d} ${MESES_CORTOS[sel.m - 1]} ${sel.y}`
    : "Elegir fecha";

  const irMes = (paso: number) =>
    setVista((v) => {
      const idx = v.m - 1 + paso;
      return { y: v.y + Math.floor(idx / 12), m: ((idx % 12) + 12) % 12 + 1 };
    });

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "card flex cursor-pointer items-center gap-2 rounded-full! px-4 py-2 text-[13.5px] font-semibold whitespace-nowrap transition-colors hover:border-brand",
          open && "border-brand",
          className,
        )}
      >
        <Calendar className="size-4 text-ink-soft" />
        {etiqueta}
      </button>

      {open && (
        <div className={cn(PANEL, "w-[292px]", align === "right" ? "right-0" : "left-0")}>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => irMes(-1)} className={NAV_BTN}>
              <ChevronLeft className="size-4.5" />
            </button>
            <div className="font-display text-[15px] font-bold">
              {MESES[vista.m - 1]} {vista.y}
            </div>
            <button type="button" onClick={() => irMes(1)} className={NAV_BTN}>
              <ChevronRight className="size-4.5" />
            </button>
          </div>

          <div className="grid grid-cols-7">
            {DIAS_CABECERA.map((d, i) => (
              <div key={i} className="grid h-7 place-items-center text-[11px] font-bold text-ink-soft">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {malla.map((c) => {
              const isSel = value === c.ymd;
              const isHoy = hoy === c.ymd;
              const dis = bloqueado(c.ymd);
              return (
                <div key={c.ymd} className="grid place-items-center">
                  <button
                    type="button"
                    disabled={!!dis}
                    onClick={() => {
                      onChange(c.ymd);
                      setOpen(false);
                    }}
                    className={cn(
                      "grid size-9 cursor-pointer place-items-center rounded-full text-[13.5px] font-semibold transition-colors",
                      c.enMes ? "text-ink" : "text-ink-soft/40",
                      !isSel && "hover:bg-brand-soft hover:text-brand",
                      isHoy && !isSel && "text-brand ring-1 ring-inset ring-brand/30",
                      isSel && "bg-brand text-white shadow-sm hover:bg-brand hover:text-white",
                      dis && "cursor-not-allowed opacity-30 ring-0 hover:bg-transparent hover:text-inherit",
                    )}
                  >
                    {c.d}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between pt-1">
            {clearable ? (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="cursor-pointer text-[12.5px] font-semibold text-ink-soft transition-colors hover:text-ink"
              >
                Borrar
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              disabled={!!bloqueado(hoy)}
              onClick={() => {
                onChange(hoy);
                setOpen(false);
              }}
              className="cursor-pointer text-[12.5px] font-semibold text-brand transition-colors hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Hoy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MonthPicker({
  value,
  onChange,
  align = "left",
  clearable,
  className,
}: {
  value: string; // "YYYY-MM"
  onChange: (v: string) => void;
  align?: "left" | "right";
  clearable?: boolean;
  className?: string;
}) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const sel = value ? { y: Number(value.slice(0, 4)), m: Number(value.slice(5, 7)) } : null;
  const ahora = new Date();
  const [anyo, setAnyo] = useState(() => sel?.y ?? ahora.getFullYear());

  useEffect(() => {
    if (open) setAnyo(sel?.y ?? ahora.getFullYear());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const etiqueta = sel ? `${MESES[sel.m - 1]} ${sel.y}` : "Cualquier mes";

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[13px] whitespace-nowrap transition-colors hover:border-brand",
          open && "border-brand",
          sel ? "font-semibold text-ink" : "text-ink-soft",
          className,
        )}
      >
        <Calendar className="size-3.5 text-ink-soft" />
        {etiqueta}
      </button>

      {open && (
        <div className={cn(PANEL, "w-[248px]", align === "right" ? "right-0" : "left-0")}>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setAnyo((a) => a - 1)} className={NAV_BTN}>
              <ChevronLeft className="size-4.5" />
            </button>
            <div className="font-display text-[15px] font-bold">{anyo}</div>
            <button type="button" onClick={() => setAnyo((a) => a + 1)} className={NAV_BTN}>
              <ChevronRight className="size-4.5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {MESES_CORTOS.map((nombre, i) => {
              const isSel = !!sel && sel.y === anyo && sel.m === i + 1;
              const isActual = anyo === ahora.getFullYear() && i === ahora.getMonth();
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onChange(`${anyo}-${pad(i + 1)}`);
                    setOpen(false);
                  }}
                  className={cn(
                    "cursor-pointer rounded-[11px] py-2 text-[13px] font-semibold capitalize transition-colors",
                    !isSel && "text-ink hover:bg-brand-soft hover:text-brand",
                    isActual && !isSel && "text-brand ring-1 ring-inset ring-brand/30",
                    isSel && "bg-brand text-white shadow-sm hover:bg-brand",
                  )}
                >
                  {nombre}
                </button>
              );
            })}
          </div>

          {clearable && (
            <div className="mt-2 flex justify-start pt-1">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="cursor-pointer text-[12.5px] font-semibold text-ink-soft transition-colors hover:text-ink"
              >
                Borrar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
