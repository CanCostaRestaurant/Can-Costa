import { estadoCocina } from "./actions";
import { CocinaClient } from "./cocina-client";

export const dynamic = "force-dynamic";

// La pantalla de cocina (KDS): una tablet colgada en el pase a pantalla
// completa. El servidor solo sirve la foto inicial; a partir de ahí el
// cliente sondea cada pocos segundos y suena cuando entra comanda nueva.
export default async function CocinaPage() {
  const inicial = await estadoCocina();
  return <CocinaClient inicial={inicial} />;
}
