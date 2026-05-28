import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Users, Sparkles } from 'lucide-react';
import ProfessionalCard, { type Professional } from '../components/professionals/ProfessionalCard';
import BookingModal from '../components/professionals/BookingModal';
import FilterBar, { type FilterState } from '../components/professionals/FilterBar';
import Footer from '../sections/Footer';

// Mock data for professionals
const mockProfessionals: Professional[] = [
  {
    id: '1',
    name: 'Dr. Ricardo Mendes',
    photo: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=400&fit=crop',
    profession: 'contador',
    specialty: 'Contabilidade Fiscal',
    location: 'São Paulo, SP',
    rating: 4.9,
    reviewCount: 127,
    education: 'Bacharel em Ciências Contábeis',
    experience: '15 anos',
    hourlyRate: 250,
    isAvailable: true,
    specialties: ['Planejamento Tributário', 'Contabilidade Societária', 'Auditoria', 'SPED'],
    about: 'Especialista em planejamento tributário para empresas de médio e grande porte. Experiência em otimização fiscal e compliance contábil.',
    certifications: ['CRC Ativo', 'Certificação CVM', 'Especialista em IFRS'],
  },
  {
    id: '2',
    name: 'Dra. Ana Carolina Silva',
    photo: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=400&fit=crop',
    profession: 'advogado',
    specialty: 'Direito Empresarial',
    location: 'Rio de Janeiro, RJ',
    rating: 4.8,
    reviewCount: 89,
    education: 'Bacharel em Direito - UFRJ',
    experience: '12 anos',
    hourlyRate: 350,
    isAvailable: true,
    specialties: ['Contratos Empresariais', 'Fusões e Aquisições', 'Societário', 'Compliance'],
    about: 'Advogada especializada em direito empresarial com foco em startups e empresas em crescimento. Experiência em operações de M&A.',
    certifications: ['OAB/RJ', 'Especialista em Direito Societário', 'Arbitragem'],
  },
  {
    id: '3',
    name: 'Carlos Eduardo Lima',
    photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop',
    profession: 'contador',
    specialty: 'Contabilidade para MEI',
    location: 'Belo Horizonte, MG',
    rating: 4.7,
    reviewCount: 203,
    education: 'Bacharel em Ciências Contábeis - UFMG',
    experience: '8 anos',
    hourlyRate: 120,
    isAvailable: true,
    specialties: ['MEI', 'Simples Nacional', 'Abertura de Empresas', 'Regularização'],
    about: 'Contador especializado em atender MEIs e pequenas empresas. Foco em simplificação e baixo custo para empreendedores.',
    certifications: ['CRC Ativo', 'Especialista em MEI'],
  },
  {
    id: '4',
    name: 'Dra. Fernanda Oliveira',
    photo: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=400&fit=crop',
    profession: 'advogado',
    specialty: 'Direito Trabalhista',
    location: 'São Paulo, SP',
    rating: 4.9,
    reviewCount: 156,
    education: 'Bacharel em Direito - USP',
    experience: '10 anos',
    hourlyRate: 300,
    isAvailable: false,
    specialties: ['Reclamações Trabalhistas', 'Auditoria Trabalhista', 'Acordos', 'CCT'],
    about: 'Advogada trabalhista com vasta experiência em defesa de empresas. Especialista em prevenção de passivos trabalhistas.',
    certifications: ['OAB/SP', 'Especialista em Direito do Trabalho', 'Mediadora'],
  },
  {
    id: '5',
    name: 'Marcelo Santos',
    photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
    profession: 'tecnico',
    specialty: 'Consultor de RH',
    location: 'Curitiba, PR',
    rating: 4.6,
    reviewCount: 78,
    education: 'Administração - PUCPR',
    experience: '11 anos',
    hourlyRate: 180,
    isAvailable: true,
    specialties: ['Folha de Pagamento', 'Departamento Pessoal', 'Recrutamento', 'Treinamento'],
    about: 'Consultor de RH com experiência em gestão de pessoas para empresas de tecnologia e serviços.',
    certifications: ['CIPD', 'SHRM-CP', 'Coach Profissional'],
  },
  {
    id: '6',
    name: 'Dra. Juliana Costa',
    photo: 'https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?w=400&h=400&fit=crop',
    profession: 'advogado',
    specialty: 'Direito Tributário',
    location: 'Brasília, DF',
    rating: 5.0,
    reviewCount: 67,
    education: 'Bacharel em Direito - UNB',
    experience: '14 anos',
    hourlyRate: 450,
    isAvailable: true,
    specialties: ['Contencioso Tributário', 'Planejamento Tributário', 'Recuperação de Créditos', 'CARF'],
    about: 'Advogada tributarista com experiência em grandes escritórios. Atuação no contencioso administrativo e judicial.',
    certifications: ['OAB/DF', 'Especialista em Direito Tributário', 'LLM Tributário'],
  },
  {
    id: '7',
    name: 'Roberto Almeida',
    photo: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&h=400&fit=crop',
    profession: 'contador',
    specialty: 'Auditoria Contábil',
    location: 'Porto Alegre, RS',
    rating: 4.8,
    reviewCount: 94,
    education: 'Bacharel em Ciências Contábeis - UFRGS',
    experience: '20 anos',
    hourlyRate: 380,
    isAvailable: true,
    specialties: ['Auditoria Independente', 'Due Diligence', 'Perícia Contábil', 'IFRS'],
    about: 'Contador com vasta experiência em auditoria para empresas listadas em bolsa. Perito judicial contábil.',
    certifications: ['CRC Ativo', 'Auditor Independente - CVM', 'Perito Judicial'],
  },
  {
    id: '8',
    name: 'Patrícia Mendonça',
    photo: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop',
    profession: 'tecnico',
    specialty: 'Consultora Financeira',
    location: 'São Paulo, SP',
    rating: 4.7,
    reviewCount: 112,
    education: 'Economia - FGV',
    experience: '9 anos',
    hourlyRate: 220,
    isAvailable: false,
    specialties: ['Planejamento Financeiro', 'Fluxo de Caixa', 'Análise de Investimentos', 'Budget'],
    about: 'Consultora financeira com experiência em grandes corporações. Ajuda empresas a otimizarem sua gestão financeira.',
    certifications: ['CFA', 'CPA', 'MBA em Finanças'],
  },
  {
    id: '9',
    name: 'Dr. Bruno Ferreira',
    photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop',
    profession: 'advogado',
    specialty: 'Direito Civil',
    location: 'Salvador, BA',
    rating: 4.5,
    reviewCount: 45,
    education: 'Bacharel em Direito - UFBA',
    experience: '7 anos',
    hourlyRate: 200,
    isAvailable: true,
    specialties: ['Contratos', 'Responsabilidade Civil', 'Direito de Família', 'Inventários'],
    about: 'Advogado civilista com atuação em consultoria preventiva e contencioso. Atendimento humanizado e próximo.',
    certifications: ['OAB/BA', 'Mediador'],
  },
];

export default function ProfessionalsPage() {
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    profession: 'all',
    specialty: 'Todas as Especialidades',
    location: 'Todas as Localizações',
    minRating: 0,
    availability: 'all',
    maxPrice: 1000,
  });

  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  const handleOpenBooking = (professional: Professional) => {
    setSelectedProfessional(professional);
    setIsBookingOpen(true);
  };

  const filteredProfessionals = useMemo(() => {
    return mockProfessionals.filter((prof) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          prof.name.toLowerCase().includes(searchLower) ||
          prof.specialty.toLowerCase().includes(searchLower) ||
          prof.specialties.some(s => s.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }

      // Profession filter
      if (filters.profession !== 'all' && prof.profession !== filters.profession) {
        return false;
      }

      // Specialty filter
      if (filters.specialty !== 'Todas as Especialidades') {
        const matchesSpecialty = 
          prof.specialty === filters.specialty ||
          prof.specialties.includes(filters.specialty);
        if (!matchesSpecialty) return false;
      }

      // Location filter
      if (filters.location !== 'Todas as Localizações' && prof.location !== filters.location) {
        return false;
      }

      // Rating filter
      if (prof.rating < filters.minRating) {
        return false;
      }

      // Availability filter
      if (filters.availability === 'available' && !prof.isAvailable) {
        return false;
      }
      if (filters.availability === 'unavailable' && prof.isAvailable) {
        return false;
      }

      // Price filter
      if (prof.hourlyRate > filters.maxPrice) {
        return false;
      }

      return true;
    });
  }, [filters]);

  const availableCount = filteredProfessionals.filter(p => p.isAvailable).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="relative pt-24 pb-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="absolute inset-0 bg-grid opacity-30" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Title Section - sem o badge e sem stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-4">
              Encontre seu{' '}
              <span className="text-gradient-gold">Profissional</span>
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Escolha entre contadores, advogados e técnicos especializados. 
              Todos verificados e prontos para ajudar seu negócio.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Filters & Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <FilterBar filters={filters} onFilterChange={setFilters} />

        {/* Results Count - simplificado */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-between mb-6"
        >
          <p className="text-muted-foreground">
            {filteredProfessionals.length === 0 ? (
              'Nenhum profissional encontrado'
            ) : (
              <>
                Mostrando <span className="font-semibold text-foreground">{filteredProfessionals.length}</span> profissionais
              </>
            )}
          </p>
          {availableCount > 0 && (
            <p className="text-sm text-green-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              {availableCount} disponíveis para atendimento online
            </p>
          )}
        </motion.div>

        {/* Professionals Grid */}
        {filteredProfessionals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProfessionals.map((professional, index) => (
              <ProfessionalCard 
                key={professional.id} 
                professional={professional} 
                index={index}
              />
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Users className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Nenhum profissional encontrado
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Tente ajustar seus filtros ou buscar por outros critérios para encontrar o profissional ideal.
            </p>
          </motion.div>
        )}
      </div>

      {/* Footer - adicionado igual à página inicial */}
      <Footer />

      {/* Booking Modal - externo */}
      {selectedProfessional && (
        <BookingModal
          professional={selectedProfessional}
          isOpen={isBookingOpen}
          onClose={() => {
            setIsBookingOpen(false);
            setSelectedProfessional(null);
          }}
        />
      )}
    </div>
  );
}