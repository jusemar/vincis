CREATE TABLE "conhecimento_destaques_home" (
	"card_id" uuid PRIMARY KEY NOT NULL,
	"artigo_id" uuid,
	"definido_por_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "identidade_publica" varchar(20) DEFAULT 'pessoal' NOT NULL;--> statement-breakpoint
ALTER TABLE "conhecimento_destaques_home" ADD CONSTRAINT "conhecimento_destaques_home_card_id_cms_cards_home_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cms_cards_home"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conhecimento_destaques_home" ADD CONSTRAINT "conhecimento_destaques_home_artigo_id_conhecimento_artigos_id_fk" FOREIGN KEY ("artigo_id") REFERENCES "public"."conhecimento_artigos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conhecimento_destaques_home" ADD CONSTRAINT "conhecimento_destaques_home_definido_por_id_usuarios_id_fk" FOREIGN KEY ("definido_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conhecimento_destaques_home_artigo_unique" ON "conhecimento_destaques_home" USING btree ("artigo_id");--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_identidade_publica_valida" CHECK ("usuarios"."identidade_publica" in ('pessoal', 'equipe_vincis'));