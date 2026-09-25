"use client";

// COMANDERO · pantalla 2: LA COMANDA. El camarero está de pie en la mesa:
// carta a toques grandes con la cantidad en cada plato, buscador, la comanda
// como hoja inferior (por enviar / en cocina / bebidas) con notas rápidas
// para cocina, y un único botón Enviar. Sin cobro (eso vive en la tablet).
//
// Motor local→sync: cantidades ABSOLUTAS con fijarLinea (idempotente, sin
// carreras al tocar deprisa) y delta de cocina con enviadosRef. Es el mismo
// patrón que la comanda de la tablet — si se toca uno, revisar el otro.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Flame, Minus, NotebookPen, Plus, ReceiptText, Search, Users, X } from "lucide-react";
import type { PlatoTpv, TicketDetalle } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { cambiarComensales } from "@/app/(app)/tpv/actions";
import { enviarACocina, fijarLinea, fijarNotaLinea } from "@/app/(app)/tpv/comanda-actions";
import { type Aviso, AvisoFlotante, Hoja } from "./comandero-ui";

type LineaLocal = {
  key: string;
  platoId: string | null;
  descripcion: string;
  precio: number;
  cantidad: number;
  nota: string | null;
};

const claveDe = (platoId: string | null, descripcion: string, precio: number) =>
  platoId ? `p:${platoId}` : `l:${descripcion}|${precio.toFixed(2)}`;

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Notas de cocina de un toque. Se acumulan en la nota de la línea separadas
// por comas, así viajan en el pase igual que una nota escrita.
const NOTAS_RAPIDAS = [
  "Sin cebolla",
  "Sin gluten",
  "Poco hecho",
  "Al punto",
  "Muy hecho",
  "Aparte",
  "Para compartir",
  "Sin sal",
  "Sin picante",
];
const partesNota = (nota: string | null) =>
  (nota ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const tieneNotaRapida = (nota: string | null, token: string) =>
  partesNota(nota).some((p) => p.toLowerCase() === token.toLowerCase());

const CATEGORIAS: { tipo: PlatoTpv["tipo"]; etiqueta: string }[] = [
  { tipo: "entrante", etiqueta: "Entrantes" },
  { tipo: "principal", etiqueta: "Principales" },
  { tipo: "postre", etiqueta: "Postres" },
  { tipo: "bebida", etiqueta: "Bebidas" },
  { tipo: "otro", etiqueta: "Otros" },
];

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function ComanderoComanda({ ticket, platos }: { ticket: TicketDetalle; platos: PlatoTpv[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [notaAbierta, setNotaAbierta] = useState<string | null>(null);
  const [pases, setPases] = useState(0); // envíos hechos desde esta pantalla
  const [notaPase, setNotaPase] = useState("");
  const [notaPaseAbierta, setNotaPaseAbierta] = useState(false);
  const [libreDesc, setLibreDesc] = useState("");
  const [librePrecio, setLibrePrecio] = useState("");

  // Aviso flotante breve (+1 plato, pase enviado…)
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const avisoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function mostrarAviso(a: Omit<Aviso, "id">, ms = 1600) {
    if (avisoTimerRef.current) clearTimeout(avisoTimerRef.current);
    setAviso({ id: Date.now(), ...a });
    avisoTimerRef.current = setTimeout(() => setAviso(null), ms);
  }
  useEffect(
    () => () => {
      if (avisoTimerRef.current) clearTimeout(avisoTimerRef.current);
    },
    [],
  );

  // Comensales: se preguntan al abrir una mesa nueva (aún sin nada) y se
  // cambian desde la cabecera. Estado local: no hace falta recargar.
  const [comensales, setComensales] = useState<number | null>(ticket.comensales);
  const [pedirComensales, setPedirComensales] = useState(
    ticket.comensales === null && ticket.lineas.length === 0,
  );
  async function elegirComensales(n: number) {
    setComensales(n);
    setPedirComensales(false);
    const res = await cambiarComensales(ticket.id, n);
    if (!res.ok) setError(res.error ?? "No se pudieron guardar los comensales");
  }

  // Buscador: sustituye a las categorías mientras hay texto.
  const [buscando, setBuscando] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const aLocal = (l: TicketDetalle["lineas"][number]): LineaLocal => ({
    key: claveDe(l.platoId, l.descripcion, l.precioUnitario),
    platoId: l.platoId,
    descripcion: l.descripcion,
    precio: l.precioUnitario,
    cantidad: l.cantidad,
    nota: l.nota,
  });

  const [lineas, setLineas] = useState<LineaLocal[]>(() =>
    ticket.lineas.map(aLocal).filter((l) => l.cantidad > 0),
  );
  const lineasRef = useRef(lineas);
  const sincronizadoRef = useRef(new Map(lineas.map((l) => [l.key, { ...l }] as const)));
  const enviadosRef = useRef(
    new Map(ticket.lineas.map((l) => [claveDe(l.platoId, l.descripcion, l.precioUnitario), l.enviado] as const)),
  );
  // Última versión conocida de cada línea (también las que están a 0): para
  // poder restaurar una que se quitó del todo después de ir a cocina.
  const conocidasRef = useRef(new Map(ticket.lineas.map(aLocal).map((l) => [l.key, l] as const)));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardandoRef = useRef(false);

  const total = useMemo(
    () => lineas.reduce((a, l) => a + Math.round(l.precio * l.cantidad * 100) / 100, 0),
    [lineas],
  );
  const unidades = useMemo(() => lineas.reduce((a, l) => a + l.cantidad, 0), [lineas]);

  // ── Motor de sincronización (idéntico patrón que la tablet) ──
  function tareas(previo: Map<string, LineaLocal>, actual: Map<string, LineaLocal>) {
    const t: { linea: LineaLocal; cantidad: number }[] = [];
    for (const [key, l] of actual) if (previo.get(key)?.cantidad !== l.cantidad) t.push({ linea: l, cantidad: l.cantidad });
    for (const [key, l] of previo) if (!actual.has(key)) t.push({ linea: l, cantidad: 0 });
    return t;
  }
  const mapaActual = () => new Map(lineasRef.current.map((l) => [l.key, { ...l }] as const));

  async function sincronizar(): Promise<boolean> {
    if (guardandoRef.current) return true;
    const actual = mapaActual();
    const pendientes = tareas(sincronizadoRef.current, actual);
    if (pendientes.length === 0) return true;
    guardandoRef.current = true;
    try {
      for (const p of pendientes) {
        const res = await fijarLinea(
          ticket.id,
          p.linea.platoId ? { platoId: p.linea.platoId } : { descripcion: p.linea.descripcion, precio: p.linea.precio },
          p.cantidad,
        );
        if (!res.ok) {
          setError(res.error ?? "No se pudo guardar — reintenta");
          return false;
        }
      }
      sincronizadoRef.current = actual;
      return true;
    } finally {
      guardandoRef.current = false;
    }
  }

  function programar(ms = 350) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      const ok = await sincronizar();
      if (!ok) programar(1500);
      else if (tareas(sincronizadoRef.current, mapaActual()).length > 0) programar(60);
    }, ms);
  }

  async function flush(): Promise<boolean> {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    let vueltas = 0;
    while (guardandoRef.current || tareas(sincronizadoRef.current, mapaActual()).length > 0) {
      if (guardandoRef.current) await esperar(30);
      else if (!(await sincronizar())) return false;
      if (++vueltas > 200) return false;
    }
    return true;
  }

  function ajustar(platoId: string | null, descripcion: string, precio: number, delta: number) {
    setError(null);
    const key = claveDe(platoId, descripcion, precio);
    const prev = lineasRef.current;
    const i = prev.findIndex((l) => l.key === key);
    let next: LineaLocal[];
    if (i === -1) {
      if (delta <= 0) return;
      const conocida = conocidasRef.current.get(key);
      next = [...prev, { key, platoId, descripcion, precio, cantidad: delta, nota: conocida?.nota ?? null }];
    } else {
      const cantidad = prev[i].cantidad + delta;
      next = cantidad <= 0 ? prev.filter((_, j) => j !== i) : prev.map((l, j) => (j === i ? { ...l, cantidad } : l));
    }
    lineasRef.current = next;
    for (const l of next) conocidasRef.current.set(l.key, { ...l });
    setLineas(next);
    programar();
  }

  function anadirPlato(p: PlatoTpv) {
    ajustar(p.id, p.nombre, p.pvp ?? 0, 1);
    if (navigator.vibrate) navigator.vibrate(12);
    mostrarAviso({
      texto: `+1 ${p.nombre}`,
      accion: {
        etiqueta: "Deshacer",
        onClick: () => {
          ajustar(p.id, p.nombre, p.pvp ?? 0, -1);
          setAviso(null);
        },
      },
    });
  }

  // ── Notas de línea: se escriben al instante y se guardan con retardo ──
  const notasSuciasRef = useRef(new Set<string>());
  const notaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cambiarNota(key: string, nota: string) {
    const next = lineasRef.current.map((l) => (l.key === key ? { ...l, nota: nota || null } : l));
    lineasRef.current = next;
    for (const l of next) conocidasRef.current.set(l.key, { ...l });
    setLineas(next);
    notasSuciasRef.current.add(key);
    if (notaTimerRef.current) clearTimeout(notaTimerRef.current);
    notaTimerRef.current = setTimeout(() => void guardarNotas(), 600);
  }

  // Guarda las notas pendientes (tras asegurar que la línea ya existe en BD).
  async function guardarNotas(): Promise<boolean> {
    if (notaTimerRef.current) {
      clearTimeout(notaTimerRef.current);
      notaTimerRef.current = null;
    }
    if (notasSuciasRef.current.size === 0) return true;
    if (!(await flush())) return false;
    const claves = [...notasSuciasRef.current];
    notasSuciasRef.current.clear();
    for (const key of claves) {
      const l = lineasRef.current.find((x) => x.key === key);
      if (!l) continue; // la línea se quitó: no hay nota que guardar
      const res = await fijarNotaLinea(
        ticket.id,
        l.platoId ? { platoId: l.platoId } : { descripcion: l.descripcion, precio: l.precio },
        l.nota ?? "",
      );
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar la nota");
        notasSuciasRef.current.add(key);
        return false;
      }
    }
    return true;
  }
  useEffect(
    () => () => {
      if (notaTimerRef.current) clearTimeout(notaTimerRef.current);
    },
    [],
  );

  function alternarNotaRapida(l: LineaLocal, token: string) {
    const partes = partesNota(l.nota);
    const i = partes.findIndex((p) => p.toLowerCase() === token.toLowerCase());
    if (i >= 0) partes.splice(i, 1);
    else partes.push(token);
    cambiarNota(l.key, partes.join(", "));
  }

  // ── Cocina: qué saldría en el próximo pase ──
  const bebidaIds = useMemo(() => new Set(platos.filter((p) => p.tipo === "bebida").map((p) => p.id)), [platos]);
  const esBebida = (l: LineaLocal) => (l.platoId ? bebidaIds.has(l.platoId) : false);

  const pendienteCocina = useMemo(() => {
    let nuevos = 0;
    let quitar = 0;
    const vivos = new Map(lineas.map((l) => [l.key, l] as const));
    for (const l of lineas) {
      if (l.platoId && bebidaIds.has(l.platoId)) continue;
      const env = enviadosRef.current.get(l.key) ?? 0;
      if (l.cantidad > env) nuevos += l.cantidad - env;
      else if (l.cantidad < env) quitar += env - l.cantidad;
    }
    for (const [key, env] of enviadosRef.current) if (env > 0 && !vivos.has(key)) quitar += env;
    return { nuevos, quitar, hay: nuevos > 0 || quitar > 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas, bebidaIds, pases]);

  // La comanda agrupada como la lee el camarero: lo que falta por enviar,
  // lo que ya está en cocina (y lo quitado del todo, hasta avisar) y bebidas.
  const grupos = useMemo(() => {
    const porEnviar: LineaLocal[] = [];
    const enCocina: LineaLocal[] = [];
    const bebidas: LineaLocal[] = [];
    for (const l of lineas) {
      if (l.platoId && bebidaIds.has(l.platoId)) bebidas.push(l);
      else if (l.cantidad > (enviadosRef.current.get(l.key) ?? 0)) porEnviar.push(l);
      else enCocina.push(l);
    }
    const vivas = new Set(lineas.map((l) => l.key));
    const quitadas: { linea: LineaLocal; enviado: number }[] = [];
    let enCocinaUds = 0;
    for (const [key, env] of enviadosRef.current) {
      enCocinaUds += env;
      const conocida = conocidasRef.current.get(key);
      if (env > 0 && !vivas.has(key) && conocida) quitadas.push({ linea: conocida, enviado: env });
    }
    return { porEnviar, enCocina, bebidas, quitadas, enCocinaUds };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas, bebidaIds, pases]);

  async function enviarCocina() {
    if (enviando) return;
    setError(null);
    setEnviando(true);
    try {
      if (!(await guardarNotas())) return;
      if (!(await flush())) return;
      const res = await enviarACocina(ticket.id, notaPase.trim() || undefined);
      if (!res.ok) {
        setError(res.error ?? "No se pudo enviar a cocina");
        return;
      }
      // Las bebidas no viajan a cocina: no cuentan como enviadas.
      enviadosRef.current = new Map(
        lineasRef.current.filter((l) => l.cantidad > 0 && !esBebida(l)).map((l) => [l.key, l.cantidad] as const),
      );
      setPases((p) => p + 1);
      setHojaAbierta(false);
      setNotaPase("");
      setNotaPaseAbierta(false);
      if (navigator.vibrate) navigator.vibrate([60, 40, 60]); // confirmación táctil
      mostrarAviso({ texto: `Pase ${res.pase ?? pases + 1} enviado a cocina`, tono: "ok" }, 2400);
    } finally {
      setEnviando(false);
    }
  }

  function anadirLibre() {
    const desc = libreDesc.trim();
    const precio = parseFloat(librePrecio.replace(",", "."));
    if (!desc || !Number.isFinite(precio) || precio < 0) return;
    ajustar(null, desc, precio, 1);
    setLibreDesc("");
    setLibrePrecio("");
  }

  async function volver() {
    await guardarNotas();
    await flush();
    router.push("/tpv/comandero");
  }

  // ── Carta: categorías por tipo de plato, o el buscador ──
  const carta = useMemo(() => platos.filter((p) => p.pvp !== null), [platos]);
  const categorias = useMemo(
    () =>
      CATEGORIAS.map((c) => ({ ...c, platos: carta.filter((p) => p.tipo === c.tipo) })).filter(
        (c) => c.platos.length > 0,
      ),
    [carta],
  );
  const [catActiva, setCatActiva] = useState(0);
  const filtro = normalizar(busqueda.trim());
  const visibles = filtro
    ? carta.filter((p) => normalizar(p.nombre).includes(filtro))
    : (categorias[catActiva]?.platos ?? []);
  const cantidadDe = (p: PlatoTpv) => lineas.find((l) => l.key === claveDe(p.id, p.nombre, p.pvp ?? 0))?.cantidad ?? 0;

  const subtitulo =
    unidades === 0
      ? "Toca los platos para añadirlos"
      : `${unidades} ${unidades === 1 ? "ud" : "uds"} · ${eur(total)}${
          grupos.enCocinaUds > 0 ? ` · ${grupos.enCocinaUds} en cocina` : ""
        }`;

  const etiquetaEnviar = (larga: boolean) =>
    enviando
      ? "Enviando…"
      : pendienteCocina.nuevos > 0
        ? `${larga ? "Enviar a cocina" : "Enviar"} · ${pendienteCocina.nuevos}`
        : pendienteCocina.quitar > 0
          ? `Avisar quitar ${pendienteCocina.quitar}`
          : pases > 0 || grupos.enCocinaUds > 0
            ? "Todo en cocina ✓"
            : larga
              ? "Enviar a cocina"
              : "Enviar";
  const claseEnviar = cn(
    "flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-45",
    pendienteCocina.quitar > 0 && pendienteCocina.nuevos === 0 ? "bg-bad" : "bg-brand",
  );

  const captionDe = (l: LineaLocal): { texto: string; tono: string } | null => {
    if (esBebida(l)) return null;
    const env = enviadosRef.current.get(l.key) ?? 0;
    if (env === 0) return null;
    if (l.cantidad > env) return { texto: `${env} en cocina · +${l.cantidad - env} por enviar`, tono: "text-brand" };
    if (l.cantidad < env) return { texto: `Se avisará a cocina: quitar ${env - l.cantidad}`, tono: "text-bad" };
    return null;
  };

  const filaDe = (l: LineaLocal) => (
    <FilaLinea
      key={l.key}
      linea={l}
      caption={captionDe(l)}
      notaAbierta={notaAbierta === l.key}
      onAjustar={(delta) => ajustar(l.platoId, l.descripcion, l.precio, delta)}
      onNota={() => setNotaAbierta(notaAbierta === l.key ? null : l.key)}
      onAlternarNotaRapida={(t) => alternarNotaRapida(l, t)}
      onCambiarNota={(nota) => cambiarNota(l.key, nota)}
      onCerrarNota={() => {
        setNotaAbierta(null);
        void guardarNotas();
      }}
    />
  );

  // SIN anim-in aquí ni en ningún ancestro: su transform convierte la sección
  // en el bloque contenedor de los `fixed` (barra, hoja, avisos).
  return (
    <section className="mx-auto max-w-lg px-3.5 pb-36">
      {/* ── Cabecera fija: volver, mesa, comensales, buscar + categorías ── */}
      <header className="sticky top-0 z-20 -mx-3.5 bg-paper/95 px-3.5 pt-[max(10px,env(safe-area-inset-top))] pb-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={volver}
            aria-label="Volver a las mesas"
            className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-line bg-card active:bg-chip"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate text-[19px] leading-tight font-bold tracking-tight">{ticket.mesaNombre}</h1>
            <p className="truncate text-[12px] leading-tight text-ink-soft">{subtitulo}</p>
          </div>
          <button
            onClick={() => setPedirComensales(true)}
            aria-label="Comensales"
            className="font-display flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-card px-3 text-[14px] font-bold active:bg-chip"
          >
            <Users className="size-4 text-ink-soft" />
            {comensales ?? "—"}
          </button>
          <button
            onClick={() => setBuscando(true)}
            aria-label="Buscar plato"
            className={cn(
              "grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-line bg-card active:bg-chip",
              buscando && "border-ink bg-ink text-white",
            )}
          >
            <Search className="size-4.5" />
          </button>
        </div>

        {buscando ? (
          <div className="mt-2.5 flex items-center gap-2">
            <input
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en la carta…"
              className="min-h-11 min-w-0 flex-1 select-text rounded-xl border border-line bg-card px-3.5 text-[15px] outline-none focus:border-brand"
            />
            <button
              onClick={() => {
                setBuscando(false);
                setBusqueda("");
              }}
              aria-label="Cerrar buscador"
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl bg-chip active:opacity-70"
            >
              <X className="size-4.5" />
            </button>
          </div>
        ) : (
          <div className="-mx-3.5 mt-2.5 flex gap-1.5 overflow-x-auto px-3.5 [scrollbar-width:none]">
            {categorias.map((c, i) => (
              <button
                key={c.tipo}
                onClick={() => setCatActiva(i)}
                className={cn(
                  "min-h-10 shrink-0 cursor-pointer rounded-full px-4 text-[14px] font-bold transition-colors",
                  i === catActiva ? "bg-ink text-white" : "border border-line bg-card text-ink-soft",
                )}
              >
                {c.etiqueta}
              </button>
            ))}
          </div>
        )}
      </header>

      {error && (
        <div className="mt-3 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">{error}</div>
      )}

      {/* ── Carta ── */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {visibles.map((p) => (
          <TarjetaPlato
            key={p.id}
            plato={p}
            cantidad={cantidadDe(p)}
            onAnadir={() => anadirPlato(p)}
            onQuitar={() => ajustar(p.id, p.nombre, p.pvp ?? 0, -1)}
          />
        ))}
        {visibles.length === 0 && (
          <p className="col-span-2 py-10 text-center text-[14px] text-ink-soft">
            {filtro ? "Nada en la carta con ese nombre" : "Esta categoría está vacía"}
          </p>
        )}
      </div>

      <AvisoFlotante aviso={aviso} />

      {/* ── Barra fija inferior: la comanda y Enviar ── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-3 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg gap-2">
          <button
            onClick={() => setHojaAbierta(true)}
            className="flex min-h-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-ink text-[15px] font-bold text-white transition-transform active:scale-[0.98]"
          >
            <ReceiptText className="size-5" />
            {unidades > 0 ? (
              <>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[13px]">{unidades}</span>
                {eur(total)}
              </>
            ) : (
              "Comanda"
            )}
          </button>
          <button onClick={enviarCocina} disabled={!pendienteCocina.hay || enviando} className={cn(claseEnviar, "flex-1")}>
            <Flame className="size-5" />
            {etiquetaEnviar(false)}
          </button>
        </div>
      </div>

      {/* ── Hoja: la comanda ── */}
      <Hoja
        titulo={`${ticket.mesaNombre} · ${unidades} ${unidades === 1 ? "ud" : "uds"}`}
        abierta={hojaAbierta}
        onCerrar={() => {
          setHojaAbierta(false);
          setNotaAbierta(null);
          void guardarNotas();
        }}
        pie={
          <div>
            <div className="mb-2.5 flex items-baseline justify-between">
              <span className="text-[12px] font-bold tracking-wider text-ink-soft uppercase">Total</span>
              <b className="font-display text-[24px] font-bold tracking-tight">{eur(total)}</b>
            </div>
            <button onClick={enviarCocina} disabled={!pendienteCocina.hay || enviando} className={cn(claseEnviar, "w-full")}>
              <Flame className="size-5" />
              {etiquetaEnviar(true)}
            </button>
          </div>
        }
      >
        {lineas.length === 0 && grupos.quitadas.length === 0 && (
          <p className="px-4 py-10 text-center text-[14px] text-ink-soft">Aún no hay nada — toca platos de la carta</p>
        )}

        {grupos.porEnviar.length > 0 && (
          <Grupo titulo={`Por enviar a cocina · ${pendienteCocina.nuevos}`} tono="brand">
            {grupos.porEnviar.map(filaDe)}
          </Grupo>
        )}

        {(grupos.enCocina.length > 0 || grupos.quitadas.length > 0) && (
          <Grupo titulo="En cocina" tono="good">
            {grupos.enCocina.map(filaDe)}
            {grupos.quitadas.map(({ linea, enviado }) => (
              <div key={linea.key} className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
                <span className="font-display grid h-10 w-26 shrink-0 place-items-center rounded-xl bg-bad-soft text-[13px] font-bold text-bad">
                  quitar {enviado}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink-soft line-through">
                  {linea.descripcion}
                </span>
                <button
                  onClick={() => ajustar(linea.platoId, linea.descripcion, linea.precio, enviado)}
                  className="shrink-0 cursor-pointer rounded-lg bg-chip px-2.5 py-1.5 text-[12.5px] font-bold text-ink active:bg-line"
                >
                  Restaurar
                </button>
              </div>
            ))}
          </Grupo>
        )}

        {grupos.bebidas.length > 0 && <Grupo titulo="Bebidas · barra">{grupos.bebidas.map(filaDe)}</Grupo>}

        {/* Fuera de carta */}
        <div className="px-3.5 pt-4 pb-2">
          <div className="mb-1.5 text-[11px] font-bold tracking-[0.16em] text-ink-soft uppercase">Fuera de carta</div>
          <div className="flex gap-2">
            <input
              placeholder="Descripción"
              value={libreDesc}
              onChange={(e) => setLibreDesc(e.target.value)}
              className="min-h-11 min-w-0 flex-1 select-text rounded-xl border border-line bg-card px-3 text-[14px] outline-none focus:border-brand"
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="€"
              value={librePrecio}
              onChange={(e) => setLibrePrecio(e.target.value)}
              className="min-h-11 w-18 select-text rounded-xl border border-line bg-card px-2 text-center text-[14px] outline-none focus:border-brand"
            />
            <button
              onClick={anadirLibre}
              disabled={!libreDesc.trim() || !librePrecio}
              aria-label="Añadir fuera de carta"
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl bg-ink text-white disabled:opacity-40"
            >
              <Plus className="size-5" />
            </button>
          </div>
        </div>

        {/* Nota del pase (alergias, "todo junto"…): viaja con el próximo envío */}
        <div className="px-3.5 pt-1 pb-3">
          {notaPaseAbierta || notaPase ? (
            <input
              autoFocus={notaPaseAbierta}
              value={notaPase}
              onChange={(e) => setNotaPase(e.target.value)}
              placeholder="Nota para cocina: alergias, todo junto…"
              className="min-h-11 w-full select-text rounded-xl border border-brand/40 bg-brand-soft/40 px-3 text-[14px] outline-none focus:border-brand"
            />
          ) : (
            <button
              onClick={() => setNotaPaseAbierta(true)}
              className="min-h-10 cursor-pointer text-[13.5px] font-bold text-brand active:opacity-70"
            >
              + Nota para cocina (alergias, todo junto…)
            </button>
          )}
        </div>
      </Hoja>

      {/* ── Hoja: comensales ── */}
      <Hoja titulo="¿Cuántos comensales?" abierta={pedirComensales} onCerrar={() => setPedirComensales(false)}>
        <div className="grid grid-cols-5 gap-2 px-4 pb-3">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => void elegirComensales(n)}
              className={cn(
                "font-display min-h-14 cursor-pointer rounded-2xl text-[20px] font-bold transition-transform active:scale-95",
                comensales === n ? "bg-brand text-white" : "border border-line bg-card active:bg-chip",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="px-4 pb-3">
          <button
            onClick={() => setPedirComensales(false)}
            className="min-h-12 w-full cursor-pointer rounded-2xl bg-chip text-[14px] font-semibold text-ink-soft active:opacity-70"
          >
            Ahora no
          </button>
        </div>
      </Hoja>
    </section>
  );
}

// ── Piezas ──────────────────────────────────────────────────────────────

function TarjetaPlato({
  plato: p,
  cantidad: n,
  onAnadir,
  onQuitar,
}: {
  plato: PlatoTpv;
  cantidad: number;
  onAnadir: () => void;
  onQuitar: () => void;
}) {
  return (
    <button
      onClick={onAnadir}
      className={cn(
        "relative flex min-h-24 cursor-pointer flex-col justify-between rounded-2xl border-2 p-3 text-left transition-transform active:scale-[0.96]",
        n > 0 ? "border-brand bg-brand-soft" : "border-line bg-card",
      )}
    >
      <div className="flex w-full items-start justify-between gap-1">
        <span className="text-[22px] leading-none">{p.emoji}</span>
        {n > 0 && (
          <span className="font-display grid h-6 min-w-6 place-items-center rounded-full bg-brand px-1.5 text-[13px] font-bold text-white">
            {n}
          </span>
        )}
      </div>
      <div className={cn("w-full", n > 0 && "pr-10")}>
        <span className="line-clamp-2 text-[14px] leading-tight font-bold">{p.nombre}</span>
        <span className="font-display mt-0.5 block text-[12.5px] font-bold text-ink-soft">{eur(p.pvp ?? 0)}</span>
      </div>
      {n > 0 && (
        // Deshacer un toque de más sin abrir la comanda: − en la tarjeta.
        <span
          role="button"
          aria-label={`Quitar un ${p.nombre}`}
          onClick={(e) => {
            e.stopPropagation();
            onQuitar();
          }}
          className="absolute right-2 bottom-2 grid size-9 cursor-pointer place-items-center rounded-full border-2 border-brand bg-card text-brand active:scale-90"
        >
          <Minus className="size-4.5" />
        </span>
      )}
    </button>
  );
}

function Grupo({ titulo, tono, children }: { titulo: string; tono?: "brand" | "good"; children: React.ReactNode }) {
  return (
    <div>
      <div
        className={cn(
          "px-4 pt-3.5 pb-1.5 text-[11px] font-bold tracking-[0.16em] uppercase",
          tono === "brand" ? "text-brand" : tono === "good" ? "text-good" : "text-ink-soft",
        )}
      >
        {titulo}
      </div>
      {children}
    </div>
  );
}

function FilaLinea({
  linea: l,
  caption,
  notaAbierta,
  onAjustar,
  onNota,
  onAlternarNotaRapida,
  onCambiarNota,
  onCerrarNota,
}: {
  linea: LineaLocal;
  caption: { texto: string; tono: string } | null;
  notaAbierta: boolean;
  onAjustar: (delta: number) => void;
  onNota: () => void;
  onAlternarNotaRapida: (token: string) => void;
  onCambiarNota: (nota: string) => void;
  onCerrarNota: () => void;
}) {
  return (
    <div className="border-b border-line px-3.5 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex shrink-0 items-center overflow-hidden rounded-xl border border-line bg-card">
          <button
            onClick={() => onAjustar(-1)}
            aria-label={`Quitar un ${l.descripcion}`}
            className="grid size-10 cursor-pointer place-items-center active:bg-chip"
          >
            <Minus className="size-4" />
          </button>
          <b className="font-display w-6 text-center text-[16px]">{l.cantidad}</b>
          <button
            onClick={() => onAjustar(1)}
            aria-label={`Añadir un ${l.descripcion}`}
            className="grid size-10 cursor-pointer place-items-center active:bg-chip"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <button onClick={onNota} className="min-w-0 flex-1 cursor-pointer text-left">
          <span className="block truncate text-[14.5px] leading-tight font-semibold">{l.descripcion}</span>
          <span className="block truncate text-[12px] leading-tight text-ink-soft">
            <span className="font-display font-bold text-ink">{eur(l.precio * l.cantidad)}</span>
            {caption && (
              <>
                {" · "}
                <span className={cn("font-semibold", caption.tono)}>{caption.texto}</span>
              </>
            )}
          </span>
          {l.nota && !notaAbierta && (
            <span className="block truncate text-[12px] leading-tight font-semibold text-brand">✎ {l.nota}</span>
          )}
        </button>
        <button
          onClick={onNota}
          aria-label={`Nota para ${l.descripcion}`}
          className={cn(
            "grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg",
            l.nota || notaAbierta ? "bg-brand-soft text-brand" : "text-ink-soft active:bg-chip",
          )}
        >
          <NotebookPen className="size-4" />
        </button>
      </div>

      {notaAbierta && (
        <div className="mt-2.5 rounded-xl border border-line bg-card p-2.5">
          <div className="flex flex-wrap gap-1.5">
            {NOTAS_RAPIDAS.map((t) => {
              const activa = tieneNotaRapida(l.nota, t);
              return (
                <button
                  key={t}
                  onClick={() => onAlternarNotaRapida(t)}
                  className={cn(
                    "min-h-9 cursor-pointer rounded-full px-3 text-[12.5px] font-semibold",
                    activa ? "bg-brand text-white" : "bg-chip text-ink active:bg-line",
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <input
            value={l.nota ?? ""}
            onChange={(e) => onCambiarNota(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onCerrarNota()}
            placeholder="Otra nota para cocina…"
            className="mt-2.5 min-h-11 w-full select-text rounded-lg border border-line bg-paper px-3 text-[14px] outline-none focus:border-brand"
          />
          <button
            onClick={onCerrarNota}
            className="mt-2 min-h-10 w-full cursor-pointer rounded-lg bg-ink text-[13px] font-bold text-white active:opacity-85"
          >
            Listo
          </button>
        </div>
      )}
    </div>
  );
}
