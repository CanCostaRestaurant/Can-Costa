// La carta REAL de la casa, en catalán (los precios son provisionales hasta
// fijar los definitivos). Única fuente para la web pública (/web) y para el
// agente de voz (/api/voz/info), así un cambio de plato o precio actualiza
// los dos a la vez. Cuando la carta esté cargada en el CRM con sus PVP
// reales, se puede volver a servir en vivo desde la tabla platos.

export type PlatoCarta = { nombre: string; pvp: number; nota?: string };

// El ritual de la casa: la cervesa con su picada.
export const RITUAL_CERVESA = { nombre: "Amb la cervesa (oliva gilda o brava)", pvp: 4 };

export const CARTA: { titulo: string; platos: PlatoCarta[] }[] = [
  {
    titulo: "Per picar",
    platos: [
      { nombre: "Braves", pvp: 6.5 },
      { nombre: "Cecina", pvp: 12 },
      { nombre: "Croqueta de pollastre a la brasa", pvp: 2.9, nota: "u." },
      { nombre: "Amanida de tomàquet", pvp: 9.5 },
      { nombre: "Torradeta d'anxova fumada", pvp: 4.8, nota: "u." },
      { nombre: "Formatge de cabra i figues a la brasa", pvp: 11.5 },
    ],
  },
  {
    titulo: "Platillos",
    platos: [
      { nombre: "Macarrons de rostit de pollastre", pvp: 12.5 },
      { nombre: "Musclos a la marinera", pvp: 13.5 },
      { nombre: "Carxofa amb pernil", pvp: 14.5 },
      { nombre: "Calamarsets", pvp: 16.9 },
      { nombre: "Albergínia a la brasa amb ricotta i nous", pvp: 12 },
      { nombre: "Tomàquet confitat amb porro i stracciatella", pvp: 13 },
    ],
  },
  {
    titulo: "Brasa",
    platos: [
      { nombre: "Zamburinyes a la brasa", pvp: 14.5 },
      { nombre: "Roger a la brasa amb pilpil", pvp: 19.5 },
      { nombre: "Parpatana de tonyina a la brasa", pvp: 24 },
      { nombre: "Llagostí a la brasa", pvp: 22 },
      { nombre: "Pluma ibèrica a la brasa", pvp: 21.5 },
      { nombre: "Xuleta a la brasa", pvp: 58, nota: "kg" },
    ],
  },
  {
    titulo: "Postres",
    platos: [
      { nombre: "Carquinyolis i encenalls", pvp: 6.5 },
      { nombre: "Moixaines", pvp: 7 },
      { nombre: "Torrija de croissant", pvp: 7.5 },
      { nombre: "Préssec amb gelat de vainilla", pvp: 6.9 },
    ],
  },
];
