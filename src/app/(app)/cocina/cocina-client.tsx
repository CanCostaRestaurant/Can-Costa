"use client";

// KDS — la cola del pase, copiada de los grandes: tarjetas con semáforo de
// tiempo (Square), "All Day" agregado por plato (Toast), bump de un toque con
// recuperación (Fresh) y ding cuando entra comanda.
//
// DOS pieles para la misma cola:
//  · KIOSCO (tablets de cocina, roles tpv/chef): oscuro, a pantalla completa,
//    letra gigante — la tablet ES la pantalla de cocina.
//  · CRM (admin/gestor en el PC): página normal clara, con su cabecera y sus
//    tarjetas como el resto del panel; botón "Pantalla completa" opcional.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCheck, Expand, Flame, RotateCcw, Volume2, X } from "lucide-react";
import { PageHead } from "@/components/ui";
import { cn } from "@/lib/utils";
import { estadoCocina, marcarLista, recuperarComanda, type ComandaCocina, type EstadoCocina } from "./actions";

const SONDEO_MS = 4000;

// Semáforo: verde hasta 8 min, ámbar hasta 15, rojo a partir de ahí.
function tono(min: number): { borde: string; chip: string; pulso: boolean } {
  if (min < 8) return { borde: "border-[#3E7C4F]", chip: "bg-[#3E7C4F]", pulso: false };
  if (min < 15) return { borde: "border-[#B07C2E]", chip: "bg-[#B07C2E]", pulso: false };
  return { borde: "border-[#C0392B]", chip: "bg-[#C0392B]", pulso: true };
}

const mmss = (desdeISO: string, ahora: number) => {
  const s = Math.max(0, Math.floor((ahora - new Date(desdeISO).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const minutosDe = (desdeISO: string, ahora: number) => (ahora - new Date(desdeISO).getTime()) / 60000;

// ── La tarjeta de un pase (misma estructura en oscuro y en claro) ──────────
function TarjetaComanda({
  c,
  ahora,
  oscuro,
  destacada,
  onBump,
}: {
  c: ComandaCocina;
  ahora: number;
  oscuro: boolean;
  destacada: boolean;
  onBump: () => void;
}) {
  const t = tono(minutosDe(c.creadaAt, ahora));
  return (
    <button
      onClick={onBump}
      className={cn(
        "flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 text-left transition-transform active:scale-[0.985]",
        oscuro ? "bg-[#211B17]" : "bg-card shadow-(--shadow-lift)",
        t.borde,
        t.pulso && "animate-pulse",
        destacada && "ring-4 ring-[#F26A3E]/60",
      )}
    >
      <div className={cn("flex items-center justify-between gap-2 px-4 py-2.5", t.chip)}>
        <b className={cn("font-display leading-none font-bold text-white", oscuro ? "text-[19px]" : "text-[16px]")}>
          {c.mesa}
        </b>
        <span className="flex items-center gap-2 text-[13px] font-bold text-white/90">
          <span className="rounded-full bg-black/25 px-2 py-0.5">{c.pase}º pase</span>
          <span className="tabular-nums">{mmss(c.creadaAt, ahora)}</span>
        </span>
      </div>
      <div className="flex-1 px-4 py-3">
        {c.items.map((it, i) => (
          <div key={i} className={cn("py-1", it.quitar && (oscuro ? "rounded-lg bg-[#C0392B]/20 px-2" : "rounded-lg bg-bad-soft px-2"))}>
            <div className="flex items-baseline gap-2.5">
              <b
                className={cn(
                  "font-display leading-tight font-bold tabular-nums",
                  oscuro ? "text-[22px]" : "text-[17px]",
                  it.quitar ? (oscuro ? "text-[#FF9C8A]" : "text-bad") : oscuro ? "text-[#F4B860]" : "text-brand",
                )}
              >
                {it.quitar ? "−" : ""}
                {it.cantidad}×
              </b>
              <span
                className={cn(
                  "leading-tight font-semibold",
                  oscuro ? "text-[19px]" : "text-[15px]",
                  it.quitar && cn("line-through decoration-2", oscuro ? "text-[#FF9C8A]" : "text-bad"),
                )}
              >
                {it.quitar ? `QUITAR ${it.descripcion}` : it.descripcion}
              </span>
            </div>
            {it.nota && (
              <p
                className={cn(
                  "pl-10 leading-snug font-bold",
                  oscuro ? "text-[15px] text-[#FF9C8A]" : "text-[13px] text-bad",
                )}
              >
                → {it.nota}
              </p>
            )}
          </div>
        ))}
        {c.nota && (
          <p
            className={cn(
              "mt-2 rounded-lg px-2.5 py-1.5 font-bold",
              oscuro ? "bg-[#B07C2E]/25 text-[14px] text-[#F4B860]" : "bg-warn-soft text-[12.5px] text-warn",
            )}
          >
            {c.nota}
          </p>
        )}
      </div>
      <div
        className={cn(
          "border-t px-4 py-2 text-center text-[12px] font-bold tracking-[0.2em] uppercase",
          oscuro ? "border-white/10 text-white/50" : "border-line text-ink-soft",
        )}
      >
        Tocar cuando salga
      </div>
    </button>
  );
}

export function CocinaClient({ inicial, kioscoInicial }: { inicial: EstadoCocina; kioscoInicial: boolean }) {
  const [pendientes, setPendientes] = useState<ComandaCocina[]>(inicial.pendientes);
  const [listas, setListas] = useState<ComandaCocina[]>(inicial.listas);
  const [ahora, setAhora] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(inicial.ok ? null : (inicial.error ?? null));
  const [conSonido, setConSonido] = useState(false);
  const [kiosco, setKiosco] = useState(kioscoInicial);

  const idsRef = useRef(new Set(inicial.pendientes.map((c) => c.id)));
  const audioRef = useRef<AudioContext | null>(null);
  const nuevasRef = useRef(new Set<string>());

  // Ding de dos notas (sin ficheros: WebAudio). Los navegadores exigen un
  // gesto del usuario antes de sonar: el botón 🔊 lo desbloquea una vez.
  function ding() {
    const ctx = audioRef.current;
    if (!ctx) return;
    const nota = (freq: number, t0: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t0);
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t0);
      osc.stop(ctx.currentTime + t0 + 0.55);
    };
    nota(880, 0);
    nota(1174.66, 0.18);
  }

  function activarSonido() {
    if (!audioRef.current) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioRef.current = new Ctor();
    }
    void audioRef.current.resume();
    setConSonido(true);
    ding();
  }

  // Reloj del semáforo (cada segundo) y sondeo de la cola (cada 4s).
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    const sondeo = setInterval(async () => {
      const res = await estadoCocina();
      if (!res.ok) {
        setError(res.error ?? "Sin conexión");
        return;
      }
      setError(null);
      const entrantes = res.pendientes.filter((c) => !idsRef.current.has(c.id));
      if (entrantes.length > 0) {
        ding();
        for (const c of entrantes) nuevasRef.current.add(c.id);
        setTimeout(() => {
          for (const c of entrantes) nuevasRef.current.delete(c.id);
        }, 4000);
      }
      idsRef.current = new Set(res.pendientes.map((c) => c.id));
      setPendientes(res.pendientes);
      setListas(res.listas);
    }, SONDEO_MS);
    return () => {
      clearInterval(reloj);
      clearInterval(sondeo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bump optimista: la tarjeta sale ya; si la BD falla, vuelve.
  async function bump(c: ComandaCocina) {
    setPendientes((p) => p.filter((x) => x.id !== c.id));
    setListas((l) => [{ ...c, listaAt: new Date().toISOString() }, ...l].slice(0, 6));
    idsRef.current.delete(c.id);
    const res = await marcarLista(c.id);
    if (!res.ok) {
      setError(res.error ?? "No se pudo marcar");
      setPendientes((p) => [...p, c].sort((a, b) => a.creadaAt.localeCompare(b.creadaAt)));
      setListas((l) => l.filter((x) => x.id !== c.id));
      idsRef.current.add(c.id);
    }
  }

  async function recuperar(c: ComandaCocina) {
    setListas((l) => l.filter((x) => x.id !== c.id));
    setPendientes((p) => [...p, { ...c, listaAt: null }].sort((a, b) => a.creadaAt.localeCompare(b.creadaAt)));
    idsRef.current.add(c.id);
    const res = await recuperarComanda(c.id);
    if (!res.ok) setError(res.error ?? "No se pudo recuperar");
  }

  // "All Day" (Toast): total agregado por plato de TODO lo pendiente.
  const allDay = useMemo(() => {
    const suma = new Map<string, number>();
    for (const c of pendientes)
      for (const it of c.items) suma.set(it.descripcion, (suma.get(it.descripcion) ?? 0) + (it.quitar ? -it.cantidad : it.cantidad));
    return [...suma.entries()]
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [pendientes]);

  // ═══════════════════ Modo CRM: página normal del panel ═══════════════════
  if (!kiosco) {
    return (
      <section className="anim-in">
        <PageHead
          titulo="Cocina"
          subtitulo="La cola del pase en vivo — lo mismo que ve la tablet de cocina"
          derecha={
            <div className="flex items-center gap-2">
              {!conSonido && (
                <button
                  onClick={activarSonido}
                  className="card flex cursor-pointer items-center gap-2 rounded-full! px-4 py-2 text-[13.5px] font-semibold"
                >
                  <Volume2 className="size-4 text-ink-soft" /> Sonido
                </button>
              )}
              <button
                onClick={() => setKiosco(true)}
                className="flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13.5px] font-semibold text-white transition-colors hover:bg-black"
              >
                <Expand className="size-4" /> Pantalla completa
              </button>
            </div>
          }
        />

        {error && (
          <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">
            {error}
          </div>
        )}

        {allDay.length > 0 && (
          <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11.5px] font-bold tracking-[0.18em] text-ink-soft uppercase">En marcha</span>
            {allDay.map(([desc, n]) => (
              <span key={desc} className="rounded-full border border-line bg-card px-3 py-1 text-[13px] font-semibold">
                <b className="font-display text-brand">{n}×</b> {desc}
              </span>
            ))}
          </div>
        )}

        {pendientes.length === 0 ? (
          <div className="card mb-3.5 flex items-center gap-3 px-5 py-6">
            <CheckCheck className="size-6 shrink-0 text-good" />
            <div>
              <b className="block text-[14.5px] font-bold">Todo al día</b>
              <span className="text-[13px] text-ink-soft">
                Cuando sala envíe un pase aparecerá aquí en vivo (y en la tablet de cocina).
              </span>
            </div>
          </div>
        ) : (
          <div className="mb-3.5 grid grid-cols-3 gap-3.5 max-xl:grid-cols-2 max-md:grid-cols-1">
            {pendientes.map((c) => (
              <TarjetaComanda
                key={c.id}
                c={c}
                ahora={ahora}
                oscuro={false}
                destacada={nuevasRef.current.has(c.id)}
                onBump={() => bump(c)}
              />
            ))}
          </div>
        )}

        {listas.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11.5px] font-bold tracking-[0.18em] text-ink-soft uppercase">
              Listas hace nada
            </span>
            {listas.map((c) => (
              <button
                key={c.id}
                onClick={() => recuperar(c)}
                title="Recuperar (deshacer)"
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-[12.5px] font-semibold text-ink-soft hover:border-brand hover:text-ink"
              >
                <RotateCcw className="size-3" /> {c.mesa} · {c.pase}º
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  // ═══════════ Modo KIOSCO: la tablet de cocina, pantalla completa ═════════
  const relojHHMM = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(ahora);

  return (
    <section className="fixed inset-0 z-50 flex flex-col bg-[#161210] text-[#F4EDE3] select-none">
      {/* ── Cabecera ── */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Flame className="size-5 text-[#F26A3E]" />
          <h1 className="font-display text-lg font-bold tracking-tight">Cocina</h1>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 font-display text-[14px] font-bold tabular-nums",
              pendientes.length > 0 ? "bg-[#F26A3E] text-white" : "bg-white/10 text-white/70",
            )}
          >
            {pendientes.length}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {error && (
            <span className="rounded-lg bg-[#C0392B]/25 px-3 py-1 text-[12.5px] font-semibold text-[#FF9C8A]">
              {error}
            </span>
          )}
          {!conSonido && (
            <button
              onClick={activarSonido}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/20 px-3 py-1.5 text-[13px] font-semibold text-white/80 hover:bg-white/10"
            >
              <Volume2 className="size-4" /> Activar sonido
            </button>
          )}
          <span className="font-display text-[22px] font-bold text-white/85 tabular-nums">{relojHHMM}</span>
          {kioscoInicial ? (
            // En la tablet de cocina, salir = volver a su inicio (según rol).
            <Link
              href="/"
              title="Salir de cocina"
              className="grid size-9 cursor-pointer place-items-center rounded-xl text-white/45 hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" />
            </Link>
          ) : (
            // Desde el CRM, salir = volver a la página normal del panel.
            <button
              onClick={() => setKiosco(false)}
              title="Salir de pantalla completa"
              className="grid size-9 cursor-pointer place-items-center rounded-xl text-white/45 hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── Tarjetas ── */}
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {pendientes.length === 0 ? (
            <div className="grid h-full min-h-[300px] place-items-center">
              <div className="text-center">
                <CheckCheck className="mx-auto mb-3 size-12 text-[#3E7C4F]" />
                <p className="text-xl font-semibold text-white/85">Todo al día</p>
                <p className="mt-1 text-sm text-white/45">Las comandas nuevas aparecen solas (y suenan)</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 max-xl:grid-cols-2 max-md:grid-cols-1">
              {pendientes.map((c) => (
                <TarjetaComanda
                  key={c.id}
                  c={c}
                  ahora={ahora}
                  oscuro
                  destacada={nuevasRef.current.has(c.id)}
                  onBump={() => bump(c)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Carril derecho: All Day + recuperar (solo si hay algo) ── */}
        {(allDay.length > 0 || listas.length > 0) && (
          <aside className="flex w-60 shrink-0 flex-col border-l border-white/10 max-md:hidden">
            <div className="flex-1 overflow-y-auto p-4">
              <h2 className="mb-2.5 text-[11.5px] font-bold tracking-[0.22em] text-white/45 uppercase">En marcha</h2>
              {allDay.length === 0 ? (
                <p className="text-[13px] text-white/35">Nada pendiente</p>
              ) : (
                allDay.map(([desc, n]) => (
                  <div key={desc} className="flex items-baseline gap-2 py-1">
                    <b className="font-display w-9 text-right text-[18px] font-bold text-[#F4B860] tabular-nums">
                      {n}×
                    </b>
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-white/85">{desc}</span>
                  </div>
                ))
              )}
            </div>
            {listas.length > 0 && (
              <div className="border-t border-white/10 p-4">
                <h2 className="mb-2 text-[11.5px] font-bold tracking-[0.22em] text-white/45 uppercase">
                  Listas hace nada
                </h2>
                {listas.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => recuperar(c)}
                    className="mb-1.5 flex w-full cursor-pointer items-center gap-2 rounded-xl border border-white/12 px-3 py-2 text-left hover:bg-white/8"
                  >
                    <RotateCcw className="size-3.5 shrink-0 text-white/40" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white/70">
                      {c.mesa} · {c.pase}º
                    </span>
                    <span className="shrink-0 text-[11.5px] text-white/40 tabular-nums">
                      {c.listaAt ? mmss(c.listaAt, ahora) : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
