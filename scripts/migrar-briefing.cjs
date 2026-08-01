// Briefing diario del equipo de sala (reunion pre-servicio digital): una fila
// por dia con las secciones editables en jsonb. Las secciones automaticas
// (reservas, agotados, fichas de platos) se calculan en vivo, no se guardan.
// Idempotente. Ejecutar: node scripts/migrar-briefing.cjs
require("dotenv").config({ path: ".env.local" });
const postgres = require("postgres");
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL no configurada"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

(async () => {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS briefings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        fecha date NOT NULL UNIQUE,
        datos jsonb NOT NULL,
        actualizado_por text,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
    console.log("OK -> briefings");
    await sql.end();
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
})();
