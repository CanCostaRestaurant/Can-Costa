ALTER TABLE "mesas" ADD COLUMN "combinable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "reservas" ADD COLUMN "mesa2_id" uuid;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_mesa2_id_mesas_id_fk" FOREIGN KEY ("mesa2_id") REFERENCES "public"."mesas"("id") ON DELETE set null ON UPDATE no action;