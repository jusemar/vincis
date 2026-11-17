-- Cards da Home: os três cards que estavam fixos no código passam a ser
-- registros do CMS, com os mesmos textos, selos, estilos e ordem.
-- Os indicadores numéricos do card de Contabilidade (+2.4k, 98%, 24h) não
-- vêm junto: foram retirados da seção.
--
-- IDs fixos + ON CONFLICT DO NOTHING: rodar de novo não duplica nem
-- sobrescreve o que o Gestor já tiver editado (inclusive um card excluído
-- logicamente, que continua na tabela).
--
-- Destinos (rotas reais do site):
--   Contabilidade → /precos ("Conhecer planos": configurador dos planos contábeis)
--   Jurídico      → /profissionais?area=advocacia
--   Abertura      → /profissionais?orcamento=1 (contratação avulsa; não há rota própria de abertura)
INSERT INTO "cms_cards_home"
  ("id", "selo", "titulo", "descricao", "texto_botao", "estilo", "destino_tipo", "rota", "ativo", "ordem")
VALUES
  ('5b0c2a6e-6f3d-4c1a-9a51-0c4a1d7e9a01', 'Mais popular', E'Contabilidade\n100% digital',
   'Gestão financeira, folha de pagamento, impostos e obrigações fiscais — tudo online, sem burocracia.',
   'Conhecer planos', 'destaque', 'rota', '/precos', true, 0),
  ('5b0c2a6e-6f3d-4c1a-9a51-0c4a1d7e9a02', 'Consultoria jurídica', E'Assessoria legal\npara o seu negócio',
   'Contratos, compliance, trabalhista e societário com especialistas disponíveis online.',
   'Ver serviços', 'esmeralda', 'rota', '/profissionais?area=advocacia', true, 1),
  ('5b0c2a6e-6f3d-4c1a-9a51-0c4a1d7e9a03', 'Abertura de empresa', E'Abra sua empresa\nem dias',
   'Registro, CNPJ, alvará e enquadramento tributário sem sair de casa.',
   'Começar agora', 'ambar', 'rota', '/profissionais?orcamento=1', true, 2)
ON CONFLICT ("id") DO NOTHING;
