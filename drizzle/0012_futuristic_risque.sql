ALTER TABLE "ajustes" ADD COLUMN "nombre_fiscal" text;--> statement-breakpoint
ALTER TABLE "ajustes" ADD COLUMN "cif" text;--> statement-breakpoint
ALTER TABLE "ajustes" ADD COLUMN "direccion" text;--> statement-breakpoint
ALTER TABLE "ajustes" ADD COLUMN "telefono" text;--> statement-breakpoint
ALTER TABLE "ajustes" ADD COLUMN "pie_ticket" text DEFAULT '¡Gracias por su visita!' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "numero" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "entregado" numeric(12, 2);