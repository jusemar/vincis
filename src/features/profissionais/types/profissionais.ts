export interface Professional {
  id: string;
  name: string;
  /** `null` quando o profissional ainda não enviou foto — nunca string vazia. */
  photo: string | null;
  /** `assistente` = Assistente Contábil (Colaborador na vitrine pública). */
  profession: "contador" | "advogado" | "tecnico" | "assistente";
  specialty: string;
  location: string;
  rating: number;
  reviewCount: number;
  education: string;
  experience: string;
  hourlyRate: number;
  isAvailable: boolean;
  specialties: string[];
  about: string;
  certifications: string[];
  /** Registro (CRC/OAB) com comprovante conferido — mesma regra do perfil público. */
  registroVerificado?: boolean;
  /** Advocacia: Perfil Essencial ou Pro. Ausente nas demais categorias. */
  perfilAdvocacia?: "essencial" | "pro" | null;
  /** Contabilidade: modelo comercial definido pelo gestor. Ausente = não exibir. */
  modeloContratacao?: "vincis" | "autonomo" | null;
  /** Quando `name` é um escritório: a pessoa responsável. Nulo no individual. */
  responsavel?: string | null;
  /** `tipo_profissional` do cadastro — fonte da identificação do card. */
  tipoProfissional?: string | null;
  /** Apresenta-se como escritório (nome do escritório no lugar da pessoa). */
  ehEscritorio?: boolean;
}

export interface FilterState {
  search: string;
  profession: string;
  specialty: string;
  location: string;
  city: string;
  state: string;
  formation: string;
  minExperience: number;
  modality: "all" | "individual" | "escritorio";
  minRating: number;
  availability: "all" | "available" | "unavailable";
  maxPrice: number;
}
