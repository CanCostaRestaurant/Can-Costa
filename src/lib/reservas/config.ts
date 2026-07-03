// ═════════════════════════════════════════════════════════════════════
// LOS MANDOS DEL ALGORITMO DE RESERVAS
//
// Dos niveles, como CoverManager:
//  - MandosReservas: lo que el restaurante toca a diario desde
//    /reservas/ajustes (doblaje, turnos, cupos). Persisten en la tabla
//    reservas_config y AQUÍ solo viven los valores por defecto.
//  - CONFIG_RESERVAS: los pesos del algoritmo de asignación. Se afinan
//    en código porque cambiarlos sin entender el scoring rompe el
//    reparto (menos puntos = mejor mesa).
// ═════════════════════════════════════════════════════════════════════

// ── Mandos editables ───────────────────────────────────────────────────

export type ServicioTurno = {
  nombre: string; // "Comida", "Cena"
  inicio: string; // "13:00" — primer tramo reservable
  fin: string; // "15:30" — última hora de entrada (last seating)
};

export type MandosReservas = {
  // DOBLAJE: cuánto tiempo bloquea su mesa cada reserva según el tamaño
  // del grupo. Es el mando que decide cada cuánto se "dobla" una mesa:
  // 60 = doblar cada hora, 120 = cada dos horas. Al cliente se le informa
  // del tiempo del que dispone (como hace CoverManager).
  doblaje: {
    hasta2: number; // parejas
    hasta4: number;
    hasta6: number;
    grandes: number; // 7 o más
  };

  // Minutos entre reservas de la misma mesa (limpiar y remontar).
  margenLimpiezaMin: number;

  // Tramos de la parrilla de horas (15 = como CoverManager).
  pasoMin: number;

  // Cupo de comensales NUEVOS que pueden entrar por tramo (el "(0/1285)"
  // de CoverManager): controla el ritmo de entrada en cocina. 0 = sin límite.
  cupoPorTramo: number;

  // Turnos de servicio: fuera de estas franjas la hora sale como
  // "no disponible" (reservable solo a mano, forzando).
  servicios: ServicioTurno[];

  // Datos del local para las confirmaciones por email/SMS.
  restaurante: {
    nombre: string;
    direccion: string;
    telefono: string;
    mapsUrl: string; // enlace de Google Maps; vacío = se genera con nombre+dirección
  };
};

export const MANDOS_POR_DEFECTO: MandosReservas = {
  doblaje: { hasta2: 75, hasta4: 90, hasta6: 105, grandes: 120 },
  margenLimpiezaMin: 10,
  pasoMin: 15,
  cupoPorTramo: 0,
  servicios: [
    { nombre: "Comida", inicio: "13:00", fin: "15:30" },
    { nombre: "Cena", inicio: "20:00", fin: "23:00" },
  ],
  restaurante: {
    nombre: "Can Costa",
    direccion: "Barcelona",
    telefono: "",
    mapsUrl: "",
  },
};

export function duracionPorComensales(comensales: number, mandos: MandosReservas): number {
  if (comensales <= 2) return mandos.doblaje.hasta2;
  if (comensales <= 4) return mandos.doblaje.hasta4;
  if (comensales <= 6) return mandos.doblaje.hasta6;
  return mandos.doblaje.grandes;
}

// Mezcla lo guardado en BD sobre los defaults (sobrevive a mandos nuevos
// añadidos después de guardar) y sanea números fuera de rango.
export function normalizarMandos(crudo: unknown): MandosReservas {
  const c = (crudo ?? {}) as Partial<MandosReservas>;
  const d = MANDOS_POR_DEFECTO;

  const minutos = (v: unknown, porDefecto: number, min = 15, max = 360): number => {
    const n = typeof v === "number" ? v : NaN;
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : porDefecto;
  };
  const horaValida = (v: unknown): v is string => typeof v === "string" && /^\d{2}:\d{2}$/.test(v);

  const servicios = Array.isArray(c.servicios)
    ? c.servicios
        .filter((s) => s && horaValida(s.inicio) && horaValida(s.fin) && s.inicio < s.fin)
        .map((s) => ({ nombre: String(s.nombre || "Servicio").slice(0, 30), inicio: s.inicio, fin: s.fin }))
        .slice(0, 6)
    : d.servicios;

  return {
    doblaje: {
      hasta2: minutos(c.doblaje?.hasta2, d.doblaje.hasta2),
      hasta4: minutos(c.doblaje?.hasta4, d.doblaje.hasta4),
      hasta6: minutos(c.doblaje?.hasta6, d.doblaje.hasta6),
      grandes: minutos(c.doblaje?.grandes, d.doblaje.grandes),
    },
    margenLimpiezaMin: minutos(c.margenLimpiezaMin, d.margenLimpiezaMin, 0, 60),
    pasoMin: c.pasoMin === 30 ? 30 : 15, // solo 15 o 30
    cupoPorTramo: minutos(c.cupoPorTramo, d.cupoPorTramo, 0, 500),
    servicios: servicios.length ? servicios : d.servicios,
    restaurante: {
      nombre: String(c.restaurante?.nombre || d.restaurante.nombre).slice(0, 80),
      direccion: String(c.restaurante?.direccion ?? d.restaurante.direccion).slice(0, 160),
      telefono: String(c.restaurante?.telefono ?? "").slice(0, 30),
      mapsUrl: String(c.restaurante?.mapsUrl ?? "").slice(0, 300),
    },
  };
}

// ── Pesos del algoritmo (solo código) ──────────────────────────────────

export const CONFIG_RESERVAS = {
  // Compat: duración con los mandos por defecto (los llamantes con mandos
  // de BD deben usar duracionPorComensales(pax, mandos)).
  duracionPorComensales(comensales: number): number {
    return duracionPorComensales(comensales, MANDOS_POR_DEFECTO);
  },

  // Margen por defecto; el asignador acepta el margen real por parámetro.
  margenLimpiezaMin: MANDOS_POR_DEFECTO.margenLimpiezaMin,

  // ── Peso del desperdicio de sillas (EL MANDO PRINCIPAL) ─────────────
  // Cada silla vacía suma estos puntos. Con 10, sentar 2 personas en una
  // mesa de 4 suma 20 puntos; en una de 2, suma 0 → gana la de 2.
  // Subirlo hace al algoritmo más tacaño con las sillas.
  pesoDesperdicio: 10,

  // ── Respeto a la zona pedida ─────────────────────────────────────────
  // Si el cliente pide terraza y le damos sala, sumamos esta penalización.
  // Con 25, prefiere darle terraza aunque sobren 2 sillas (2×10=20 < 25),
  // pero lo mete en sala antes que desperdiciar 3+ sillas en terraza.
  // Súbelo a 1000 si la zona pedida debe ser sagrada.
  penalizacionZona: 25,

  // ── Protección de mesas grandes ──────────────────────────────────────
  // Las mesas de 6+ son oro en hora punta: si un grupo pequeño (la mitad
  // o menos de la capacidad) intenta ocuparlas, sumamos esta penalización
  // extra para reservarlas a grupos grandes que no caben en otro sitio.
  mesaGrandeDesde: 6,
  penalizacionMesaGrande: 15,

  // ── Juntar mesas (grupos que no caben en ninguna mesa sola) ─────────
  combinarMesas: {
    activado: true,

    // Solo se juntan mesas CERCANAS EN EL PLANO (distancia en % del lienzo)
    // y de la misma zona. Con 18, dos mesas contiguas de tu plano se juntan;
    // una de sala con una de la otra punta, no. Si arrastras las mesas en
    // Distribución, esto se recalcula solo.
    distanciaMaxPlano: 18,

    // Sillas que se pierden al juntar dos mesas (las cabeceras que chocan).
    // Con 0, dos de 4 sientan a 8; si tus mesas pierden sitio al juntarlas,
    // pon 2 y dos de 4 sentarán a 6.
    sillasPerdidas: 0,

    // Juntar mesas da trabajo (mover, remontar): esta penalización hace que
    // el algoritmo solo junte cuando NINGUNA mesa sola encaja razonablemente.
    penalizacion: 20,
  },
} as const;
