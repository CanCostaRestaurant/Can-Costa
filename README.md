# Can Costa · CRM del restaurante

Gestión completa de un restaurante en una sola app: food cost y escandallos, compras y proveedores,
facturas de proveedor leídas con IA, inventario, TPV de sala en tablet, comandero en el móvil,
pantalla de cocina, reservas, clientes, caja, facturación, personal y un panel con los números.

- **Producción:** https://can-costa.vercel.app
- **Código:** https://github.com/CanCostaRestaurant/Can-Costa (rama `main`; cada push despliega solo en Vercel)

## Stack

Next.js 16 (App Router, server actions, Turbopack) · React 19 · TypeScript · Tailwind 4 ·
Drizzle ORM sobre Postgres (Supabase) · Vercel (hosting + crons) · API de Anthropic para la IA
(lectura de facturas y extractos, asistente) · nodemailer / imapflow para el correo.

Node 20 o superior (probado con 24). Todo el proyecto está en castellano: código, comentarios y pantalla.

> Next 16 trae cambios respecto a versiones anteriores (`proxy.ts` en vez de `middleware.ts`, `searchParams`
> y `cookies()` asíncronos, etc.). Antes de tocar algo "de Next", mirar la guía que viene en
> `node_modules/next/dist/docs/` (ver `AGENTS.md`).

## Qué hay dentro

| Sección | Qué hace |
|---|---|
| Home / Dashboard | Resumen del negocio: ventas, food cost, alertas |
| Escandallos | Recetas con ingredientes, coste vivo, margen y PVP |
| TPV (`/tpv`) | Tablet de sala: plano de mesas, comanda, cobro, recibo, factura |
| Comandero (`/tpv/comandero`) | App de móvil del camarero: tomar la comanda en la mesa y enviarla a cocina |
| Cocina (`/cocina`) | Pantalla de cocina (KDS) con pases, All Day y tiempos; impresora de cocina opcional |
| Ventas · Caja · Facturación | Ventas del día, cierre de caja con arqueo, facturas de venta `AAAA/NNNN` |
| Reservas · Clientes | Reservas con recordatorios, ficha de cliente y gasto |
| Documentos | Facturas y albaranes de proveedor: foto o correo → la IA los lee y clasifica |
| Conciliación · Banco | Albaranes contra facturas; extractos bancarios leídos con IA |
| Productos · Inventario · Proveedores · Incidencias | Compras, stock teórico, recuentos, lista de compra sugerida |
| Personal | Equipo, horarios y fichajes |
| Briefing | Reunión pre-servicio que se rellena sola con los datos del día |
| Fina | Asistente de IA que responde sobre los números |
| Preferencias | Ajustes del negocio, datos del ticket y **usuarios con su rol** |

**Roles** (`src/proxy.ts` decide qué rutas ve cada uno): `admin` (todo), `gestor` (consulta y descarga, para la
gestoría), `chef` (escandallos, productos, inventario, cocina), `documentos` (quien recepciona mercancía) y
`tpv` (la tablet de sala: solo TPV, cocina, ventas, caja y facturas). El propietario entra con la contraseña
maestra (`AUTH_PASSWORD`) como admin y crea al resto en Preferencias.

**Apps instalables (PWA):** desde la página correspondiente, "Añadir a pantalla de inicio" crea una app
propia: TPV (tablet, horizontal, `/tpv`), Comandero (móvil, vertical, `/tpv/comandero`) y Cocina
(`/cocina`). Si se abre `/tpv` desde un móvil, salta solo al comandero (`/tpv?tablet=1` fuerza el TPV completo).

## Ponerlo en marcha en local

```bash
git clone https://github.com/CanCostaRestaurant/Can-Costa.git
cd Can-Costa
npm install
cp .env.local.example .env.local   # y rellenar (tabla de abajo)
npm run dev                         # → http://localhost:3500
```

Entrar con la contraseña maestra (`AUTH_PASSWORD`). Sin `DATABASE_URL` la app arranca pero todas las
pantallas avisan "la base de datos no responde".

### Base de datos

- **Para seguir con Can Costa:** la base de datos de producción ya tiene el esquema y los datos. Basta con
  copiar las variables del proyecto de Vercel (Settings → Environment Variables) a `.env.local`.
  Ojo: en local se trabaja contra los datos reales.
- **Para una copia nueva (otro restaurante o entorno de pruebas):** crear un proyecto en
  [supabase.com](https://supabase.com), copiar la URL, la clave `anon`, la `service_role` y la cadena de
  conexión del *Session pooler* (puerto 5432), y crear todas las tablas desde el esquema:

  ```bash
  npm run db:push      # crea las tablas de src/lib/db/schema.ts en la BD vacía
  ```

  Datos de ejemplo opcionales: `scripts/seed-demo*.sql` (y `scripts/reset-demo.sql` para vaciar), desde el
  editor SQL de Supabase. En `drizzle/` está el histórico de migraciones, pero en producción varias se
  aplicaron a mano (`scripts/migrar-*.cjs`): para una BD nueva usa `db:push`, no `db:migrate`.
- El plan gratuito de Supabase **pausa el proyecto tras una semana sin uso** y no hace copias de seguridad.
  Para un restaurante en marcha: plan Pro, o al menos exportar la BD de vez en cuando.

### Variables de entorno

| Variable | Para qué | |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` | Proyecto Supabase (Project Settings → API) | obligatorias |
| `DATABASE_URL` | Postgres por el *Session pooler* (5432) | obligatoria |
| `AUTH_SECRET` | Firma la cookie de sesión (cadena larga aleatoria, p. ej. `openssl rand -hex 32`). **Sin ella la app queda abierta sin login** (solo vale para desarrollo) | obligatoria |
| `AUTH_PASSWORD` | Contraseña maestra del propietario (entra como admin) | obligatoria |
| `CRON_SECRET` | Protege `/api/cron/*`; Vercel la manda sola en las tareas programadas | recomendada |
| `ANTHROPIC_API_KEY` | IA: leer facturas y tickets (Documentos), extractos (Banco) y Fina. Sin ella esas funciones avisan y el resto va igual | opcional |
| `IMAP_USER` · `IMAP_PASSWORD` (+ `IMAP_HOST`/`IMAP_PORT`, `SMTP_HOST`/`SMTP_PORT`; por defecto Gmail) | Buzón donde llegan las facturas de proveedor (cron de las 6:00) y envío de correos (facturas de venta, confirmaciones). Con Gmail, contraseña de aplicación | opcional |
| `TWILIO_ACCOUNT_SID` · `TWILIO_AUTH_TOKEN` · `TWILIO_FROM` | SMS de confirmación de reservas | opcional |
| `WHATSAPP_TOKEN` · `WHATSAPP_PHONE_ID` · `WHATSAPP_VERIFY_TOKEN` · `WHATSAPP_TEMPLATE_NAME` · `WHATSAPP_TEMPLATE_LANG` | Recordatorios de reserva por WhatsApp (Meta Cloud API) | opcional |
| `IMPRESORA_SECRET` | Impresora de cocina Star CloudPRNT (`/api/impresora/cocina?clave=…`) | opcional |
| `VOZ_SECRET` | Agente de voz para reservas por teléfono (ElevenLabs), ver `docs/agente-voz.md` | opcional |

Las integraciones opcionales están preparadas y quedan **inertes** hasta que existe su clave.

## Desplegar

Importar el repositorio en [Vercel](https://vercel.com) (framework Next.js, sin configuración extra), añadir las
variables en Production y Preview, y desplegar. `vercel.json` fija la región `fra1` y dos tareas
programadas: `/api/cron/correo` (06:00 UTC, lee el buzón de facturas) y `/api/cron/recordatorios`
(08:00 UTC, recordatorios de reservas). Después, cada push a `main` despliega solo.

Antes de subir cambios:

```bash
npm run typecheck && npm run build
```

## Dónde está cada cosa

```
src/app/(app)/<modulo>/      una carpeta por sección: page.tsx (servidor) + *-client.tsx (UI) + actions.ts (server actions)
src/app/(comandero)/         comandero móvil, con layout propio sin menú
src/app/login  src/proxy.ts  login, sesión por cookie firmada y permisos por rol
src/app/api/                 cron, impresora, voz, webhooks, salud
src/lib/db/schema.ts         el esquema de la base de datos (Drizzle); queries.ts = lecturas
src/lib/{ia,correo,whatsapp,notificaciones,stock}/   integraciones y motores
src/components/              UI compartida (sidebar, barra de la tablet, ui.tsx)
public/manifest-*.webmanifest  las apps instalables
scripts/                     migraciones a mano ya aplicadas en producción (histórico) y seeds de demo
drizzle/                     migraciones generadas (histórico)
docs/                        documentación de integraciones
```

Convenciones: las server actions devuelven `{ ok, error }` y nunca lanzan; los importes van en `numeric` y se
convierten con `Number()` al leer; nada de `confirm()` nativo ni de dejar secretos en el código.

## Seguridad

- **Este repositorio es público:** nunca subir `.env.local` ni claves (está en `.gitignore`; el único fichero
  de entorno versionado es `.env.local.example`, sin valores).
- `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL` dan acceso total a la base de datos: solo en el servidor
  (Vercel) y en el `.env.local` de quien desarrolla.
- Si se da acceso al proyecto a alguien externo y luego se retira, rotar `AUTH_SECRET`, `AUTH_PASSWORD` y
  las claves de Supabase.

## Comandos

| Comando | |
|---|---|
| `npm run dev` | Servidor de desarrollo en el puerto 3500 |
| `npm run build` · `npm start` | Compilar y servir producción |
| `npm run typecheck` · `npm run lint` | Tipos y lint |
| `npm run db:push` | Crear/sincronizar las tablas desde `schema.ts` (BD nueva) |
| `npm run db:generate` | Generar una migración en `drizzle/` tras cambiar `schema.ts` |
| `npm run db:studio` | Explorar la BD en el navegador |
