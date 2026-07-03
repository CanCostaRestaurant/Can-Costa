CREATE TYPE "public"."reserva_estado" AS ENUM('confirmada', 'sentada', 'no_show', 'cancelada');--> statement-breakpoint
CREATE TABLE "reservas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text,
	"comensales" integer NOT NULL,
	"fecha" date NOT NULL,
	"hora" time NOT NULL,
	"duracion_min" integer DEFAULT 90 NOT NULL,
	"zona_preferida" "mesa_zona",
	"mesa_id" uuid,
	"estado" "reserva_estado" DEFAULT 'confirmada' NOT NULL,
	"notas" text,
	"origen" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_mesa_id_mesas_id_fk" FOREIGN KEY ("mesa_id") REFERENCES "public"."mesas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservas_fecha_idx" ON "reservas" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "reservas_mesa_idx" ON "reservas" USING btree ("mesa_id");