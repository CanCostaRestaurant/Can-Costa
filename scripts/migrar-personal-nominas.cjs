// Módulo Personal estilo JOMA: roster de trabajadores + columnas de nómina
// (trabajador, tipo, PDF adjunto) en personal_gastos. Idempotente.
// Ejecutar: node scripts/migrar-personal-nominas.cjs
require("dotenv").config({ path: ".env.local" });
const postgres = require("postgres");
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL no configurada"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

(async () => {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS personal_trabajadores (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nombre text NOT NULL,
        puesto text,
        salario numeric(12,2),
        activo boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;

    await sql`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'personal_tipo') THEN
        CREATE TYPE personal_tipo AS ENUM ('nomina', 'seguridad_social', 'otro');
      END IF;
    END $$`;

    await sql`ALTER TABLE personal_gastos ADD COLUMN IF NOT EXISTS trabajador_id uuid REFERENCES personal_trabajadores(id) ON DELETE SET NULL`;
    await sql`ALTER TABLE personal_gastos ADD COLUMN IF NOT EXISTS tipo personal_tipo NOT NULL DEFAULT 'nomina'`;
    await sql`ALTER TABLE personal_gastos ADD COLUMN IF NOT EXISTS documento text`;
    await sql`ALTER TABLE personal_gastos ADD COLUMN IF NOT EXISTS documento_nombre text`;

    const [c] = await sql`SELECT count(*)::int AS n FROM personal_trabajadores`;
    console.log("OK → personal_trabajadores lista (filas:", c.n + ") y columnas de nómina en personal_gastos");
    await sql.end();
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
})();
