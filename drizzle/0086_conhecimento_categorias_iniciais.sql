-- Central de Conhecimento: as nove categorias iniciais aprovadas.
--
-- IDs fixos + ON CONFLICT DO NOTHING: rodar de novo não duplica nem
-- sobrescreve o que o Gestor já tiver editado ou desativado.
--
-- `area_busca` aponta só para filtros reais da busca (/profissionais?area=…).
-- "Gestão e Empreendedorismo" não tem área própria: a chamada leva à busca
-- sem filtro, em vez de afirmar uma especialidade que a busca não oferece.
INSERT INTO "conhecimento_categorias"
  ("id", "nome", "slug", "descricao", "area_busca", "chamada_conversao", "ativa", "ordem")
VALUES
  ('7c1d5e2a-4b3f-4e8a-9c10-1a2b3c4d5e01', 'MEI e Microempreendedorismo', 'mei-e-microempreendedorismo',
   'Abertura, obrigações e limites do MEI e de pequenos negócios.', 'contabilidade',
   'Precisa de orientação sobre seu MEI? Encontre um profissional.', true, 0),
  ('7c1d5e2a-4b3f-4e8a-9c10-1a2b3c4d5e02', 'Imposto de Renda', 'imposto-de-renda',
   'Declaração de pessoa física e jurídica, deduções e prazos.', 'contabilidade',
   'Encontre um profissional para ajudar com sua declaração.', true, 1),
  ('7c1d5e2a-4b3f-4e8a-9c10-1a2b3c4d5e03', 'Reforma Tributária', 'reforma-tributaria',
   'O que muda com a reforma tributária e como se preparar.', 'contabilidade',
   'Quer entender o impacto da reforma no seu negócio? Fale com um profissional.', true, 2),
  ('7c1d5e2a-4b3f-4e8a-9c10-1a2b3c4d5e04', 'Contabilidade Empresarial', 'contabilidade-empresarial',
   'Rotinas contábeis, demonstrações e gestão financeira da empresa.', 'contabilidade',
   'Procurando contabilidade para sua empresa? Encontre um profissional.', true, 3),
  ('7c1d5e2a-4b3f-4e8a-9c10-1a2b3c4d5e05', 'Lucro Real e Lucro Presumido', 'lucro-real-e-lucro-presumido',
   'Regimes de tributação, comparações e enquadramento.', 'contabilidade',
   'Em dúvida sobre o melhor regime? Encontre um profissional.', true, 4),
  ('7c1d5e2a-4b3f-4e8a-9c10-1a2b3c4d5e06', 'Simples Nacional', 'simples-nacional',
   'Anexos, faixas, DAS e permanência no Simples Nacional.', 'contabilidade',
   'Precisa de ajuda com o Simples Nacional? Encontre um profissional.', true, 5),
  ('7c1d5e2a-4b3f-4e8a-9c10-1a2b3c4d5e07', 'Obrigações Fiscais', 'obrigacoes-fiscais',
   'Declarações, prazos e obrigações acessórias.', 'contabilidade',
   'Quer manter as obrigações em dia? Encontre um profissional.', true, 6),
  ('7c1d5e2a-4b3f-4e8a-9c10-1a2b3c4d5e08', 'Direito Empresarial', 'direito-empresarial',
   'Contratos, sociedades e questões jurídicas do dia a dia da empresa.', 'advocacia',
   'Precisa de orientação jurídica para sua empresa? Encontre um advogado.', true, 7),
  ('7c1d5e2a-4b3f-4e8a-9c10-1a2b3c4d5e09', 'Gestão e Empreendedorismo', 'gestao-e-empreendedorismo',
   'Planejamento, gestão e crescimento de negócios.', NULL,
   'Quer apoio profissional para o seu negócio? Encontre um profissional.', true, 8)
ON CONFLICT ("id") DO NOTHING;
