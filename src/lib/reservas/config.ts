// ═════════════════════════════════════════════════════════════════════
// LOS MANDOS DEL ALGORITMO DE RESERVAS
// Aquí se afina cómo asigna mesas el cover manager. Cada número tiene un
// efecto concreto y se puede tocar sin miedo: el asignador solo compara
// puntuaciones (menos puntos = mejor mesa).
// ═════════════════════════════════════════════════════════════════════

export const CONFIG_RESERVAS = {
  // ── Duración estimada de la mesa según el tamaño del grupo ──────────
  // Una pareja cena más rápido que una mesa de 8. Esto decide cuánto
  // tiempo "bloquea" cada reserva su mesa (y por tanto cuántos turnos
  // caben por servicio). Si el local rota más rápido, baja estos números.
  duracionPorComensales(comensales: number): number {
    if (comensales <= 2) return 75; // minutos
    if (comensales <= 4) return 90;
    return 120;
  },

  // ── Margen entre reservas de la misma mesa ──────────────────────────
  // Tiempo para limpiar y remontar. Subirlo da aire al servicio;
  // bajarlo mete más turnos.
  margenLimpiezaMin: 10,

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
