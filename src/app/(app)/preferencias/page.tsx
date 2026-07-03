import { getAjustes, getUsuarios } from "@/lib/db/queries";
import { PreferenciasClient } from "./preferencias-client";

export const dynamic = "force-dynamic";

export default async function PreferenciasPage() {
  const [ajustes, usuarios] = await Promise.all([getAjustes(), getUsuarios()]);
  return <PreferenciasClient ajustes={ajustes} usuarios={usuarios} />;
}
