CREATE TABLE "ventas_dia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fecha" date NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"origen" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ventas_dia_fecha_unique" UNIQUE("fecha")
);
