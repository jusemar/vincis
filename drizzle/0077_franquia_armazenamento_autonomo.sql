-- Contador Autônomo: franquia gratuita aprovada = 1 GB (1024^3 bytes).
-- Não sobrescreve valor já ajustado pela gestão.
INSERT INTO "configuracoes_plataforma" ("chave", "valor")
VALUES ('autonomo.armazenamento_gratuito_bytes', '1073741824')
ON CONFLICT ("chave") DO NOTHING;
