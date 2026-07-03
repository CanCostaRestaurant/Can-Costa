CREATE TYPE "public"."mesa_zona" AS ENUM('sala', 'terraza', 'barra');--> statement-breakpoint
CREATE TYPE "public"."metodo_pago" AS ENUM('efectivo', 'tarjeta');--> statement-breakpoint
CREATE TYPE "public"."ticket_estado" AS ENUM('abierto', 'cobrado', 'anulado');--> statement-breakpoint
CREATE TABLE "mesas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"zona" "mesa_zona" DEFAULT 'sala' NOT NULL,
	"capacidad" integer DEFAULT 4 NOT NULL,
	"orden" integer,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_lineas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"plato_id" uuid,
	"descripcion" text NOT NULL,
	"cantidad" integer DEFAULT 1 NOT NULL,
	"precio_unitario" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mesa_id" uuid,
	"estado" "ticket_estado" DEFAULT 'abierto' NOT NULL,
	"comensales" integer,
	"metodo_pago" "metodo_pago",
	"total" numeric(12, 2),
	"abierto_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cobrado_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ticket_lineas" ADD CONSTRAINT "ticket_lineas_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_lineas" ADD CONSTRAINT "ticket_lineas_plato_id_platos_id_fk" FOREIGN KEY ("plato_id") REFERENCES "public"."platos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_mesa_id_mesas_id_fk" FOREIGN KEY ("mesa_id") REFERENCES "public"."mesas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_lineas_ticket_idx" ON "ticket_lineas" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "tickets_estado_idx" ON "tickets" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "tickets_cobrado_idx" ON "tickets" USING btree ("cobrado_at");