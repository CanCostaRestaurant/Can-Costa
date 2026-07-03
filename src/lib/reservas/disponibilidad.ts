// Parrilla de horas disponibles estilo CoverManager: para una fecha y un
// tamaño de grupo, calcula el estado de cada tramo de 15/30 min de los
// turnos de servicio. Funciones PURAS (sin BD).
import { sugerirMesa, type MesaAsignable, type Ocupacion } from "./asignador";
import { duracionPorComensales, type MandosReservas } from "./config";

export type EstadoSlot =
  | "libre" // hay mesa y sobra hueco
  | "pocas" // hay mesa pero quedan pocas para ese tamaño de grupo
  | "lleno" // ninguna mesa (ni combinación) libre a esa hora
  | "cupo"; // hay mesa, pero el cupo de entrada del tramo está cubierto

export type SlotDisponibilidad = {
  hora: string; // "13:15"
  servicio: string; // "Comida"
  estado: EstadoSlot;
  mesasLibres: number; // mesas individuales que encajan y están libres
  paxTramo: number; // comensales que ya ENTRAN en este tramo
  cupo: number | null; // cupo del tramo (null = sin límite)
  hastaHora: string; // hasta cuándo tendría la mesa el grupo (doblaje)
};

export function minutosAHora(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function horaAMin(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
}

// Entradas ya reservadas del día (para el cupo por tramo): hora de inicio
// en minutos + comensales. Solo cuentan las que ENTRAN en el tramo, no las
// que siguen sentadas (el cupo controla el ritmo de entrada en cocina).
export type EntradaDia = { inicioMin: number; comensales: number };

export function calcularDisponibilidad(
  comensales: number,
  mesas: MesaAsignable[],
  ocupaciones: Ocupacion[],
  entradas: EntradaDia[],
  mandos: MandosReservas,
): SlotDisponibilidad[] {
  const duracion = duracionPorComensales(comensales, mandos);
  const slots: SlotDisponibilidad[] = [];

  for (const servicio of mandos.servicios) {
    const desde = horaAMin(servicio.inicio);
    const hasta = horaAMin(servicio.fin); // última hora de entrada, inclusive
    if (hasta <= desde) continue;

    for (let t = desde; t <= hasta; t += mandos.pasoMin) {
      const solicitud = { comensales, inicioMin: t, duracionMin: duracion, zonaPreferida: null };

      // Mesas individuales que encajan y están libres en este tramo
      // (para el matiz libre/pocas; las combinaciones las cubre sugerirMesa).
      const margen = mandos.margenLimpiezaMin;
      const finConMargen = t + duracion + margen;
      const mesasLibres = mesas.filter(
        (m) =>
          m.capacidad >= comensales &&
          !ocupaciones.some(
            (o) => o.mesaId === m.id && o.inicioMin < finConMargen && t < o.finMin + margen,
          ),
      ).length;

      const haySitio =
        mesasLibres > 0 || sugerirMesa(solicitud, mesas, ocupaciones, margen) !== null;

      const paxTramo = entradas
        .filter((e) => e.inicioMin >= t && e.inicioMin < t + mandos.pasoMin)
        .reduce((acc, e) => acc + e.comensales, 0);
      const cupo = mandos.cupoPorTramo > 0 ? mandos.cupoPorTramo : null;
      const cupoCubierto = cupo !== null && paxTramo + comensales > cupo;

      slots.push({
        hora: minutosAHora(t),
        servicio: servicio.nombre,
        estado: !haySitio ? "lleno" : cupoCubierto ? "cupo" : mesasLibres <= 1 ? "pocas" : "libre",
        mesasLibres,
        paxTramo,
        cupo,
        hastaHora: minutosAHora(t + duracion),
      });
    }
  }

  return slots;
}
