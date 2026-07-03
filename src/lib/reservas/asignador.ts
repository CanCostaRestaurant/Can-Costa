// Asignador de mesas del cover manager. Funciones PURAS (sin BD): reciben
// mesas y ocupaciones, devuelven la mejor mesa y el porqué. Los criterios
// se afinan en config.ts.
import { CONFIG_RESERVAS } from "./config";

export type MesaAsignable = {
  id: string;
  nombre: string;
  zona: "sala" | "terraza" | "barra";
  capacidad: number;
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
  puntuacion: number;
  motivo: string;
};

export function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
}

function solapa(sol: Solicitud, ocupacion: Ocupacion): boolean {
  const margen = CONFIG_RESERVAS.margenLimpiezaMin;
  const inicio = sol.inicioMin;
  const fin = sol.inicioMin + sol.duracionMin + margen;
  return ocupacion.inicioMin < fin && inicio < ocupacion.finMin + margen;
}

export function sugerirMesa(
  sol: Solicitud,
  mesas: MesaAsignable[],
  ocupaciones: Ocupacion[],
): Sugerencia | null {
  const cfg = CONFIG_RESERVAS;
  let mejor: Sugerencia | null = null;

  for (const mesa of mesas) {
    if (mesa.capacidad < sol.comensales) continue; // no caben
    const ocupada = ocupaciones.some((o) => o.mesaId === mesa.id && solapa(sol, o));
    if (ocupada) continue;

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
      mejor = { mesaId: mesa.id, mesaNombre: mesa.nombre, puntuacion, motivo: motivos.join(" · ") };
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
): Map<string, Sugerencia | null> {
  const orden = [...reservas].sort(
    (a, b) => b.comensales - a.comensales || a.inicioMin - b.inicioMin,
  );
  const ocupaciones = [...ocupacionesFijas];
  const resultado = new Map<string, Sugerencia | null>();

  for (const reserva of orden) {
    const sugerencia = sugerirMesa(reserva, mesas, ocupaciones);
    resultado.set(reserva.id, sugerencia);
    if (sugerencia) {
      ocupaciones.push({
        mesaId: sugerencia.mesaId,
        inicioMin: reserva.inicioMin,
        finMin: reserva.inicioMin + reserva.duracionMin,
      });
    }
  }
  return resultado;
}
