export interface Professional {
  id: string;
  name: string;
  photo: string;
  profession: 'contador' | 'advogado' | 'tecnico';
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
}

export interface FilterState {
  search: string;
  profession: string;
  specialty: string;
  location: string;
  minRating: number;
  availability: 'all' | 'available' | 'unavailable';
  maxPrice: number;
}
