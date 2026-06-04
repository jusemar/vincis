export interface Service {
  title: string;
  description: string;
  price: string;
  priceNote?: string;
  chips: string[];
  cta: string;
  isOrcamento?: boolean;
}

export interface CaseStudy {
  type: string;
  title: string;
  description: string;
}

export interface Timeline {
  year: string;
  title: string;
  description: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface Review {
  name: string;
  text: string;
  rating: number;
}

export interface ProfessionalData {
  name: string;
  subtitle: string;
  about: string;
  location: string;
  rating: number;
  reviewCount: number;
  education: string;
  experience: string;
  declarations: string;
  hourlyRate: number;
  specialties: string[];
  certifications: string[];
  services: Service[];
  cases: CaseStudy[];
  timeline: Timeline[];
  faqs: FAQ[];
  reviews: Review[];
}
