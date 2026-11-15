-- Perfil Pro (advocacia): espaço incluído aprovado = 5 GB (5 * 1024^3 bytes).
-- Não sobrescreve valor já ajustado pela gestão.
INSERT INTO "configuracoes_plataforma" ("chave", "valor")
VALUES ('perfil_pro.armazenamento_incluido_bytes', '5368709120')
ON CONFLICT ("chave") DO NOTHING;
