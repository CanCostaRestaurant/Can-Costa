// Cliente Drizzle conectado a la Postgres de Supabase (driver postgres-js).
// Transaction pooler (6543), max:1, prepare:false. Singleton vía globalThis.
//
// Inicialización PEREZOSA: mientras no haya DATABASE_URL, getDb() devuelve
// null en vez de lanzar. Así las pantallas pueden caer a datos mock sin
// romper el build ni el deploy hasta que la variable esté configurada.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  pgClient: ReturnType<typeof postgres> | undefined;
  drizzleDb: DrizzleDb | undefined;
};

export function getDb(): DrizzleDb | null {
  if (!process.env.DATABASE_URL) return null;
  if (!globalForDb.pgClient) {
    globalForDb.pgClient = postgres(process.env.DATABASE_URL, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10, // si Supabase no responde, fallar rápido (no colgar la función)
      prepare: false,
    });
  }
  if (!globalForDb.drizzleDb) {
    globalForDb.drizzleDb = drizzle(globalForDb.pgClient, { schema });
  }
  return globalForDb.drizzleDb;
}

export { schema };

// Descarta el cliente cacheado (socket posiblemente zombi tras una incidencia
// del pooler): la siguiente petición reconectará de cero.
export function resetDb(): void {
  const cliente = globalForDb.pgClient;
  globalForDb.pgClient = undefined;
  globalForDb.drizzleDb = undefined;
  if (cliente) {
    cliente.end({ timeout: 1 }).catch(() => {});
  }
}

// Plazo duro para trabajo contra la BD: si el socket está zombi (p. ej.
// incidencia del pooler), las queries encolan sin error y la función se
// colgaría minutos. Con el race, a los N ms se rechaza y el llamante puede
// degradar a su fallback.
export function conPlazo<T>(promesa: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(new Error(`BD sin respuesta en ${ms}ms`)), ms);
      (t as unknown as { unref?: () => void }).unref?.();
    }),
  ]);
}
