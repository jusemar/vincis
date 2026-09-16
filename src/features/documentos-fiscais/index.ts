/*
  Central Fiscal — vocabulário e contratos puros.

  Só o vocabulário puro passa por este índice. `lib/acesso-documentos-fiscais`
  importa o banco e é importado pelo caminho dele, para não arrastar o Drizzle
  para componentes de `use client` que só precisam das listas.
*/
export * from './constants/dominio'
export * from './constants/nfe'
export * from './constants/permissoes'
export * from './schemas/documento-interpretado'
