import { ENQUADRAMENTO_MAPA } from "./rede-territorial";

/** Dados inteiramente fictícios; a demonstração não acessa empresas ou usuários reais. */
export const especialistasDemo = [
  { nome: "Camila Rocha", especialidade: "Comércio Exterior", profissao: "Contadora", classificacao: "Autônoma", complemento: "", local: "São Paulo - SP", experiencia: "12 anos em importação", asset: "autonoma-camila-ambiente" },
  { nome: "Rafael Mendes", especialidade: "Especialista Tributário", profissao: "Profissional de Contabilidade", classificacao: "Autônomo Vincis", complemento: "", local: "Recife - PE", experiencia: "8 anos de experiência", asset: "tecnico-rafael-ambiente" },
  { nome: "Equipe Horizonte", especialidade: "Consultoria Fiscal", profissao: "Escritório Contábil e Jurídico", classificacao: "Contador e Advogado", complemento: "Equipe Vincis", local: "Curitiba - PR", experiencia: "Uma equipe ao seu lado", asset: "escritorio-equipe" },
] as const;
export const atendimentosDemo = [
  { nome: "Lucas", local: "Manaus · AM", pedido: "Preciso de suporte em importação.", resposta: "Sua análise de importação está pronta.", cliente: [160, 150], profissional: [835, 150], asset: "cliente", cor: "#58b99a", especialidades: ["Comércio Exterior", "Especialista Tributário", "Consultoria Fiscal"] },
  { nome: "Marina", local: "Cuiabá · MT", pedido: "Preciso de ajuda com tributação.", resposta: "Seu planejamento tributário está pronto.", cliente: [140, 330], profissional: [860, 335], asset: "cliente-marina-ambiente", cor: "#d4ad55", especialidades: ["Tributário · ICMS e ISS", "Planejamento Tributário", "Consultoria Fiscal"] },
  { nome: "André", local: "Porto Alegre · RS", pedido: "Tenho dúvida sobre Imposto de Renda.", resposta: "Sua revisão do Imposto de Renda está pronta.", cliente: [190, 510], profissional: [820, 515], asset: "cliente-andre-ambiente", cor: "#79aee4", especialidades: ["Imposto de Renda", "Contabilidade de Pessoa Física", "Planejamento Patrimonial"] },
] as const;
export const etapasDemo = [
  { inicio: 0, titulo: "Necessidade", descricao: "Tudo começa com o que você precisa.", curto: "Digitando" },
  { inicio: 7000, titulo: "Especialidade", descricao: "A Vincis encontra especialistas para você.", curto: "Especialistas" },
  { inicio: 13000, titulo: "Escolha", descricao: "Você escolhe com quem quer seguir.", curto: "Escolhendo" },
  { inicio: 18000, titulo: "Rede Vincis", descricao: "Pessoas independentes. Uma rede de possibilidades.", curto: "Conectando" },
  { inicio: 22500, titulo: "Operação", descricao: "O profissional recebe, analisa e prepara a resposta.", curto: "Trabalhando" },
  { inicio: 32000, titulo: "Conclusão", descricao: "O resultado volta pela Vincis e chega até você.", curto: "Entregando" },
] as const;
/** Um ciclo global dá a todos os clientes tempo de concluir antes de reiniciar a cena. */
export const DURACAO_CICLO = 80000;
export const INTERVALO_CLIENTES = 16000;
export const MARCOS_DEMO = {
  fimDigitacao: 3200,
  enviar: 4000,
  receber: 7000,
  mostrarCards: 9500,
  escolher: 13000,
  confirmarEscolha: 14800,
  recolherCards: 17500,
  fimCards: 18500,
  encaminhar: 22500,
  receberProfissional: 26000,
  trabalhar: 28500,
  prepararResposta: 30500,
  retornar: 32000,
  receberCentral: 35500,
  entregar: 37500,
  receberCliente: 41000,
  fimAtendimento: 44000,
} as const;
// O destino das mensagens acompanha o mapa; as âncoras dos personagens permanecem fixas.
export const CENTRAL = [ENQUADRAMENTO_MAPA.x + 415, 365] as const;
