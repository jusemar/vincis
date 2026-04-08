import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  MapPin, 
  Star, 
  GraduationCap, 
  Briefcase, 
  CheckCircle2,
  Calendar,
  ArrowRight,
  Award,
  BookOpen
} from 'lucide-react';
import BookingModal from './BookingModal';

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

interface ProfessionalCardProps {
  professional: Professional;
  index: number;
}

const professionConfig = {
  contador: {
    label: 'Contador',
    color: 'blue',
    bgColor: 'bg-blue-500/20',
    textColor: 'text-blue-400',
    borderColor: 'border-blue-500/30',
  },
  advogado: {
    label: 'Advogado',
    color: 'amber',
    bgColor: 'bg-amber-500/20',
    textColor: 'text-amber-400',
    borderColor: 'border-amber-500/30',
  },
  tecnico: {
    label: 'Técnico',
    color: 'emerald',
    bgColor: 'bg-emerald-500/20',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
  },
};

export default function ProfessionalCard({ professional, index }: ProfessionalCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const config = professionConfig[professional.profession];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <>
      <motion.div
        className="relative w-full h-[520px] perspective-1000 cursor-pointer group"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: index * 0.1 }}
        onMouseEnter={() => setIsFlipped(true)}
        onMouseLeave={() => setIsFlipped(false)}
        style={{ perspective: '1000px' }}
      >
        <motion.div
          className="relative w-full h-full transition-all duration-700"
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* FRONT OF CARD */}
          <div 
            className="absolute inset-0 w-full h-full"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <div className="h-full glass-card rounded-3xl overflow-hidden border border-border hover:border-primary/30 transition-all duration-300 hover:shadow-elevated">
              {/* Photo Section */}
              <div className="relative h-48 overflow-hidden">
                <img 
                  src={professional.photo} 
                  alt={professional.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
                
                {/* Availability Badge */}
                <div className={`absolute top-4 right-4 px-3 py-1.5 rounded-full flex items-center gap-2 ${
                  professional.isAvailable 
                    ? 'bg-green-500/20 border border-green-500/30' 
                    : 'bg-red-500/20 border border-red-500/30'
                }`}>
                  {professional.isAvailable ? (
                    <>
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      <span className="text-xs font-medium text-green-400">Disponível</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 bg-red-400 rounded-full" />
                      <span className="text-xs font-medium text-red-400">Indisponível</span>
                    </>
                  )}
                </div>

                {/* Profession Badge */}
                <div className={`absolute top-4 left-4 px-3 py-1.5 rounded-full ${config.bgColor} border ${config.borderColor}`}>
                  <span className={`text-xs font-semibold ${config.textColor}`}>{config.label}</span>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                {/* Name & Specialty */}
                <h3 className="text-xl font-bold text-foreground mb-1">{professional.name}</h3>
                <p className={`text-sm font-medium ${config.textColor} mb-4`}>{professional.specialty}</p>

                {/* Rating */}
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <span className="font-semibold text-foreground">{professional.rating}</span>
                  </div>
                  <span className="text-muted-foreground text-sm">({professional.reviewCount} avaliações)</span>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="truncate">{professional.location}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <GraduationCap className="w-4 h-4 text-primary" />
                    <span className="truncate">{professional.education}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Briefcase className="w-4 h-4 text-primary" />
                    <span>{professional.experience}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4 text-primary" />
                    <span>Consultoria Online</span>
                  </div>
                </div>

                {/* Price */}
                <div className="pt-4 border-t border-border">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-gradient-gold">{formatCurrency(professional.hourlyRate)}</span>
                    <span className="text-muted-foreground text-sm">/hora</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Atendimento online incluso</p>
                </div>
              </div>

              {/* Hover hint */}
              <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  Passe o mouse <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          </div>

          {/* BACK OF CARD */}
          <div 
            className="absolute inset-0 w-full h-full"
            style={{ 
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)'
            }}
          >
            <div className="h-full glass-card rounded-3xl overflow-hidden border border-primary/30 shadow-glow p-6 flex flex-col">
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className={`w-12 h-12 rounded-xl ${config.bgColor} flex items-center justify-center border ${config.borderColor}`}>
                  <Award className={`w-6 h-6 ${config.textColor}`} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">{professional.name}</h3>
                  <p className={`text-sm ${config.textColor}`}>{config.label}</p>
                </div>
              </div>

              {/* Specialties */}
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  Especialidades
                </h4>
                <div className="flex flex-wrap gap-2">
                  {professional.specialties.map((specialty, i) => (
                    <span 
                      key={i}
                      className="px-3 py-1 text-xs rounded-full bg-primary/10 text-primary border border-primary/20"
                    >
                      {specialty}
                    </span>
                  ))}
                </div>
              </div>

              {/* About */}
              <div className="mb-4 flex-1">
                <h4 className="text-sm font-semibold text-foreground mb-2">Sobre</h4>
                <p className="text-sm text-muted-foreground line-clamp-4">{professional.about}</p>
              </div>

              {/* Certifications */}
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Certificações
                </h4>
                <ul className="space-y-1">
                  {professional.certifications.slice(0, 3).map((cert, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="w-1 h-1 bg-primary rounded-full" />
                      {cert}
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA Button - Prominent */}
              <div className="mt-auto pt-4">
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsBookingOpen(true);
                  }}
                  className={`w-full py-4 px-6 rounded-xl font-bold text-base flex items-center justify-center gap-3 transition-all ${
                    professional.isAvailable
                      ? 'bg-gradient-gold text-primary-foreground shadow-glow hover:shadow-glow-lg'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                  }`}
                  whileHover={professional.isAvailable ? { scale: 1.02 } : {}}
                  whileTap={professional.isAvailable ? { scale: 0.98 } : {}}
                  disabled={!professional.isAvailable}
                >
                  <Calendar className="w-5 h-5" />
                  {professional.isAvailable ? 'Agendar Consulta' : 'Indisponível'}
                  {professional.isAvailable && <ArrowRight className="w-5 h-5" />}
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Booking Modal */}
      <BookingModal
        professional={professional}
        isOpen={isBookingOpen}
        onClose={() => setIsBookingOpen(false)}
      />
    </>
  );
}
