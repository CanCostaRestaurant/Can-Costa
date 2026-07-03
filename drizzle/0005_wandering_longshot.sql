CREATE TYPE "public"."mesa_forma" AS ENUM('cuadrada', 'redonda', 'alargada');--> statement-breakpoint
ALTER TABLE "mesas" ADD COLUMN "forma" "mesa_forma" DEFAULT 'cuadrada' NOT NULL;--> statement-breakpoint
ALTER TABLE "mesas" ADD COLUMN "pos_x" integer;--> statement-breakpoint
ALTER TABLE "mesas" ADD COLUMN "pos_y" integer;