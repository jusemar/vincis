export const PAPEL_OPTIONS = [
  {
    valor: 'cliente' as const,
    titulo: 'Sou Cliente',
    descricao: 'Busco serviços jurídicos ou contábeis com profissionais qualificados',
    icone: 'user-plus',
  },
  {
    valor: 'profissional' as const,
    titulo: 'Sou Profissional',
    descricao: 'Advogado ou contador que deseja atender clientes pela Vincis',
    icone: 'briefcase',
  },
  {
    valor: 'colaborador' as const,
    titulo: 'Sou Colaborador',
    descricao:
      'Tenho conhecimento técnico e presto serviços compatíveis, sem registro em CRC ou OAB',
    icone: 'hand-heart',
  },
]
