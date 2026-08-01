// Shape de las secciones EDITABLES del briefing diario (jsonb en `briefings`).
// Lo automático (reservas, agotados por stock, fichas de platos) no se guarda:
// se calcula en vivo en getBriefingDia.

export type FilaEquipo = { puesto: string; comida: string; cena: string };

export type DatosBriefing = {
  responsable: string; // quién dirige la reunión
  equipo: FilaEquipo[];
  platosDia: string[]; // ids de platos recomendados hoy (sus fichas se pintan solas)
  recomendaciones: string; // cómo venderlos: maridaje, argumentos, sugerencias
  objetivos: string;
  calidad: string;
  presentacion: string;
  espacio: string;
  ayerPositivo: string;
  ayerMejorar: string;
  reconocimientos: string;
  motivacion: string;
};

// Plantilla del primer día (textos base de la hoja de papel de Can Costa).
export function briefingVacio(): DatosBriefing {
  return {
    responsable: "",
    equipo: [
      { puesto: "Gerente", comida: "", cena: "" },
      { puesto: "Recepción", comida: "", cena: "" },
      { puesto: "Barra", comida: "", cena: "" },
      { puesto: "Sala 1", comida: "", cena: "" },
      { puesto: "Sala 2", comida: "", cena: "" },
      { puesto: "Terraza", comida: "", cena: "" },
      { puesto: "Cocina", comida: "", cena: "" },
      { puesto: "Pica", comida: "", cena: "" },
    ],
    platosDia: [],
    recomendaciones: "",
    objetivos: "",
    calidad:
      "Revisar constantemente las mesas para anticiparse a las necesidades de los clientes (doble bebida, cubiertos…).",
    presentacion: "Todo el personal debe llevar los uniformes limpios y completos.",
    espacio: "Asegurarse de que las mesas están completas antes de abrir.",
    ayerPositivo: "",
    ayerMejorar: "",
    reconocimientos: "",
    motivacion: "Cada servicio es una nueva oportunidad para mejorar. ¡Adelante!",
  };
}

// Topes: el bodySizeLimit global de las server actions es de 8 MB (por las
// fotos de albaranes) — sin acotar, un jsonb gigante dejaría inservible la
// página del día para todos. Suficiente de sobra para un briefing real.
const MAX_TEXTO = 4000;
const MAX_CORTO = 120;
const MAX_EQUIPO = 30;
const MAX_PLATOS_DIA = 50;

function texto(v: unknown, porDefecto = "", max = MAX_TEXTO): string {
  return typeof v === "string" ? v.slice(0, max) : porDefecto;
}

// Normaliza lo guardado (jsonb) al shape actual, rellenando lo que falte y
// acotando tamaños (nada raro ni gigante entra en la fila del día).
export function normalizarBriefing(crudo: unknown): DatosBriefing {
  const base = briefingVacio();
  if (!crudo || typeof crudo !== "object") return base;
  const d = crudo as Partial<DatosBriefing>;
  return {
    responsable: texto(d.responsable, base.responsable, MAX_CORTO),
    equipo: Array.isArray(d.equipo)
      ? d.equipo
          .filter((f): f is FilaEquipo => !!f && typeof f === "object")
          .slice(0, MAX_EQUIPO)
          .map((f) => ({
            puesto: texto(f.puesto, "", MAX_CORTO),
            comida: texto(f.comida, "", MAX_CORTO),
            cena: texto(f.cena, "", MAX_CORTO),
          }))
      : base.equipo,
    platosDia: Array.isArray(d.platosDia)
      ? [...new Set(d.platosDia.filter((x): x is string => typeof x === "string" && x.length <= 64))].slice(
          0,
          MAX_PLATOS_DIA,
        )
      : [],
    recomendaciones: texto(d.recomendaciones),
    objetivos: texto(d.objetivos),
    calidad: texto(d.calidad, base.calidad),
    presentacion: texto(d.presentacion, base.presentacion),
    espacio: texto(d.espacio, base.espacio),
    ayerPositivo: texto(d.ayerPositivo),
    ayerMejorar: texto(d.ayerMejorar),
    reconocimientos: texto(d.reconocimientos),
    motivacion: texto(d.motivacion, base.motivacion),
  };
}
