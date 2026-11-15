export interface Professional {
  id: string;
  name: string;
  /** `null` quando o profissional ainda não enviou foto — nunca string vazia. */
  photo: string | null;
  profession: "contador" | "advogado" | "tecnico";
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
  /** Advocacia: Perfil Essencial ou Pro. Ausente nas demais categorias. */
  perfilAdvocacia?: "essencial" | "pro" | null;
  /** Contabilidade: modelo comercial definido pelo gestor. Ausente = não exibir. */
  modeloContratacao?: "vincis" | "autonomo" | null;
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
