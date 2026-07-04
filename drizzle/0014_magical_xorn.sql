ALTER TYPE "public"."usuario_rol" ADD VALUE 'tpv';--> statement-breakpoint
CREATE TABLE "retiradas_caja" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fecha" date NOT NULL,
	"importe" numeric(12, 2) NOT NULL,
	"motivo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cierres_caja" ADD COLUMN "retiradas" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
CREATE INDEX "retiradas_caja_fecha_idx" ON "retiradas_caja" USING btree ("fecha");