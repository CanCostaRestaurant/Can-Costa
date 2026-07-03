CREATE TYPE "public"."plato_tipo" AS ENUM('entrante', 'principal', 'postre', 'bebida', 'otro');--> statement-breakpoint
ALTER TABLE "plato_ingredientes" ADD COLUMN "preparacion_id" uuid;--> statement-breakpoint
ALTER TABLE "platos" ADD COLUMN "tipo_plato" "plato_tipo" DEFAULT 'principal' NOT NULL;--> statement-breakpoint
ALTER TABLE "platos" ADD COLUMN "es_preparacion" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platos" ADD COLUMN "margen_objetivo" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "platos" ADD COLUMN "raciones" numeric(8, 2) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "precio_pactado" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "plato_ingredientes" ADD CONSTRAINT "plato_ingredientes_preparacion_id_platos_id_fk" FOREIGN KEY ("preparacion_id") REFERENCES "public"."platos"("id") ON DELETE set null ON UPDATE no action;