// Asignador de mesas del cover manager. Funciones PURAS (sin BD): reciben
// mesas y ocupaciones, devuelven la mejor mesa (o pareja de mesas juntas)
// y el porqué. Los criterios se afinan en config.ts.
import { CONFIG_RESERVAS } from "./config";

export type MesaAsignable = {
  id: string;
  nombre: string;
  zona: "sala" | "terraza" | "barra";
  capacidad: number;
  combinable: boolean;
  posX: number | null;
  posY: number | null;
};

// Franja ya ocupada de una mesa (reserva asignada), en minutos desde medianoche.
export type Ocupacion = { mesaId: string; inicioMin: number; finMin: number };

export type Solicitud = {
  comensales: number;
  inicioMin: number;
  duracionMin: number;
  zonaPreferida?: "sala" | "terraza" | "barra" | null;
};

export type Sugerencia = {
  mesaId: string;
  mesaNombre: string;
  mesa2Id: string | null; // segunda mesa cuando hay que juntar
  mesa2Nombre: string | null;
  puntuacion: number;
  motivo: string;
};

export function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
}

function solapa(sol: Solicitud, ocupacion: Ocupacion, margen: number): boolean {
  const inicio = sol.inicioMin;
  const fin = sol.inicioMin + sol.duracionMin + margen;
  return ocupacion.inicioMin < fin && inicio < ocupacion.finMin + margen;
}

function distanciaPlano(a: MesaAsignable, b: MesaAsignable): number | null {
  if (a.posX === null || a.posY === null || b.posX === null || b.posY === null) return null;
  return Math.hypot(a.posX - b.posX, a.posY - b.posY);
}

export function sugerirMesa(
  sol: Solicitud,
  mesas: MesaAsignable[],
  ocupaciones: Ocupacion[],
  margenLimpiezaMin: number = CONFIG_RESERVAS.margenLimpiezaMin,
): Sugerencia | null {
  const cfg = CONFIG_RESERVAS;
  let mejor: Sugerencia | null = null;

  const libre = (mesa: MesaAsignable) =>
    !ocupaciones.some((o) => o.mesaId === mesa.id && solapa(sol, o, margenLimpiezaMin));

  // ── Mesas individuales ──
  for (const mesa of mesas) {
    if (mesa.capacidad < sol.comensales) continue;
    if (!libre(mesa)) continue;

    const desperdicio = mesa.capacidad - sol.comensales;
    let puntuacion = desperdicio * cfg.pesoDesperdicio;
    const motivos: string[] = [];

    if (desperdicio === 0) motivos.push(`ajuste perfecto (${sol.comensales}/${mesa.capacidad})`);
    else motivos.push(`sobran ${desperdicio} ${desperdicio === 1 ? "plaza" : "plazas"}`);

    if (sol.zonaPreferida && mesa.zona !== sol.zonaPreferida) {
      puntuacion += cfg.penalizacionZona;
      motivos.push(`fuera de la zona pedida (${sol.zonaPreferida})`);
    }
    if (mesa.capacidad >= cfg.mesaGrandeDesde && sol.comensales * 2 <= mesa.capacidad) {
      puntuacion += cfg.penalizacionMesaGrande;
      motivos.push("usa una mesa grande protegida");
    }

    if (!mejor || puntuacion < mejor.puntuacion) {
      mejor = {
        mesaId: mesa.id,
        mesaNombre: mesa.nombre,
        mesa2Id: null,
        mesa2Nombre: null,
        puntuacion,
        motivo: motivos.join(" · "),
      };
    }
  }

  // ── Parejas de mesas juntas (misma zona, cercanas en el plano) ──
  if (cfg.combinarMesas.activado) {
    for (let i = 0; i < mesas.length; i++) {
      for (let j = i + 1; j < mesas.length; j++) {
        const a = mesas[i];
        const b = mesas[j];
        if (!a.combinable || !b.combinable) continue;
        if (a.zona !== b.zona) continue;

        const capacidadConjunta = a.capacidad + b.capacidad - cfg.combinarMesas.sillasPerdidas;
        if (capacidadConjunta < sol.comensales) continue;
        // No juntar si el grupo cabe de sobra en una de las dos por separado.
        if (a.capacidad >= sol.comensales || b.capacidad >= sol.comensales) continue;
        if (!libre(a) || !libre(b)) continue;

        const distancia = distanciaPlano(a, b);
        if (distancia !== null && distancia > cfg.combinarMesas.distanciaMaxPlano) continue;

        const desperdicio = capacidadConjunta - sol.comensales;
        let puntuacion = desperdicio * cfg.pesoDesperdicio + cfg.combinarMesas.penalizacion;
        const motivos = [`juntando ${a.nombre} + ${b.nombre} (${capacidadConjunta} plazas)`];

        if (sol.zonaPreferida && a.zona !== sol.zonaPreferida) {
          puntuacion += cfg.penalizacionZona;
          motivos.push(`fuera de la zona pedida (${sol.zonaPreferida})`);
        }
        if (desperdicio > 0) {
          motivos.push(`sobran ${desperdicio} ${desperdicio === 1 ? "plaza" : "plazas"}`);
        }

        if (!mejor || puntuacion < mejor.puntuacion) {
          mejor = {
            mesaId: a.id,
            mesaNombre: a.nombre,
            mesa2Id: b.id,
            mesa2Nombre: b.nombre,
            puntuacion,
            motivo: motivos.join(" · "),
          };
        }
      }
    }
  }

  return mejor;
}

// Reoptimización del día (first-fit decreasing): reparte TODAS las reservas
// pendientes de mayor a menor grupo — los grupos grandes eligen primero,
// que es lo que evita quedarse sin mesas grandes por culpa de parejas.
export type ReservaAReoptimizar = Solicitud & { id: string };

export function reoptimizarAsignaciones(
  reservas: ReservaAReoptimizar[],
  mesas: MesaAsignable[],
  ocupacionesFijas: Ocupacion[], // reservas ya sentadas: no se mueven
  margenLimpiezaMin: number = CONFIG_RESERVAS.margenLimpiezaMin,
): Map<string, Sugerencia | null> {
  const orden = [...reservas].sort(
    (a, b) => b.comensales - a.comensales || a.inicioMin - b.inicioMin,
  );
  const ocupaciones = [...ocupacionesFijas];
  const resultado = new Map<string, Sugerencia | null>();

  for (const reserva of orden) {
    const sugerencia = sugerirMesa(reserva, mesas, ocupaciones, margenLimpiezaMin);
    resultado.set(reserva.id, sugerencia);
    if (sugerencia) {
      const fin = reserva.inicioMin + reserva.duracionMin;
      ocupaciones.push({ mesaId: sugerencia.mesaId, inicioMin: reserva.inicioMin, finMin: fin });
      if (sugerencia.mesa2Id) {
        ocupaciones.push({ mesaId: sugerencia.mesa2Id, inicioMin: reserva.inicioMin, finMin: fin });
      }
    }
  }
  return resultado;
}
