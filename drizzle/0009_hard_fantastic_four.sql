CREATE TYPE "public"."documento_tipo" AS ENUM('factura', 'albaran', 'ticket');--> statement-breakpoint
CREATE TYPE "public"."gasto_categoria" AS ENUM('materia_prima', 'bebidas', 'limpieza', 'consumibles', 'gestoria', 'alquiler', 'suministros', 'otros');--> statement-breakpoint
CREATE TYPE "public"."proveedor_fuente" AS ENUM('albaranes', 'facturas');--> statement-breakpoint
CREATE TYPE "public"."usuario_rol" AS ENUM('admin', 'documentos', 'gestor', 'chef');--> statement-breakpoint
ALTER TYPE "public"."factura_estado" ADD VALUE 'rechazada';--> statement-breakpoint
CREATE TABLE "ajustes" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"con_iva" boolean DEFAULT true NOT NULL,
	"ventas_con_total" boolean DEFAULT true NOT NULL,
	"iva_ventas_pct" numeric(5, 2) DEFAULT '10' NOT NULL,
	"tolerancia_conciliacion" numeric(8, 2) DEFAULT '1' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"rol" "usuario_rol" DEFAULT 'admin' NOT NULL,
	"contrasena" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "tipo" "documento_tipo" DEFAULT 'factura' NOT NULL;--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "categoria" "gasto_categoria";--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "pagada" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "incidencia" text;--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "motivo_rechazo" text;--> statement-breakpoint
ALTER TABLE "proveedores" ADD COLUMN "categoria" "gasto_categoria" DEFAULT 'materia_prima' NOT NULL;--> statement-breakpoint
ALTER TABLE "proveedores" ADD COLUMN "fuente_productos" "proveedor_fuente" DEFAULT 'albaranes' NOT NULL;