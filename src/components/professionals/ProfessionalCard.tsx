import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Star, 
  Clock, 
  GraduationCap, 
  Briefcase, 
  MapPin, 
  Eye
} from 'lucide-react';

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

const ProfessionalCard = ({ professional, index }: ProfessionalCardProps) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const navigate = useNavigate();

  const {
    id,
    name,
    photo,
    profession,
    specialty,
    location,
    rating,
    reviewCount,
    education,
    experience,
    hourlyRate,
    isAvailable,
    specialties,
    about,
    certifications
  } = professional;

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const getProfessionLabel = () => {
    if (profession === 'tecnico') return 'Técnico';
    if (profession === 'contador') return 'Contabilidade';
    return 'Advocacia';
  };

  const getProfessionStyles = () => {
    if (profession === 'tecnico') return 'bg-blue-500/20 text-blue-400';
    if (profession === 'contador') return 'bg-green-500/20 text-green-400';
    return 'bg-primary/20 text-primary';
  };

  return (
    <div 
      className="group relative h-[560px] cursor-pointer"
      onClick={handleFlip}
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
      style={{ perspective: '1000px' }}
    >
      <div 
        className="relative w-full h-full transition-transform duration-700"
        style={{ 
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
        }}
      >
        {/* Front of card */}
        <div 
          className="absolute inset-0 bg-card rounded-2xl border border-border overflow-hidden shadow-lg"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {/* Category badge */}
          <div className={`absolute top-3 right-3 z-10 px-3 py-1 rounded-full text-xs font-semibold ${getProfessionStyles()}`}>
            {getProfessionLabel()}
          </div>

          {/* Availability */}
          <div className={`absolute top-3 left-3 z-10 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
            isAvailable ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isAvailable ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
            {isAvailable ? 'Disponível' : 'Ocupado'}
          </div>

          {/* Image */}
          <div className="relative h-64 overflow-hidden">
            <img 
              src={photo} 
              alt={name}
              className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
          </div>

          {/* Content */}
          <div className="p-5 flex flex-col h-[calc(100%-16rem)]">
            <h3 className="text-lg font-bold text-foreground mb-2 leading-snug">{name}</h3>

            {/* Specialty badges */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {specialties.slice(0, 3).map((tag, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-primary/10 text-primary uppercase tracking-wide"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Location + Rating */}
            <div className="flex items-center justify-between mb-2">
              {location && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{location}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star 
                    key={i}
                    className={`h-3.5 w-3.5 ${i < Math.floor(rating) ? 'text-primary fill-primary' : 'text-muted fill-muted'}`}
                  />
                ))}
                <span className="text-xs font-semibold text-foreground ml-1">{rating.toFixed(1)}</span>
                <span className="text-xs text-muted-foreground">({reviewCount})</span>
              </div>
            </div>

            {/* Education + Experience */}
            <div className="flex items-center justify-between gap-3 mb-auto">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <GraduationCap className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                <span className="line-clamp-1">{education}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
                <Briefcase className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                <span>{experience}</span>
              </div>
            </div>

            {/* Price */}
            <div className="bg-muted/50 rounded-xl p-3 mt-4">
              <div className="flex items-center justify-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">Por hora</span>
                <span className="text-xl font-bold text-primary ml-1">
                  R$ {hourlyRate.toFixed(0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Back of card */}
        <div 
          className="absolute inset-0 bg-card rounded-2xl border border-border overflow-hidden shadow-lg"
          style={{ 
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)'
          }}
        >
          <div className="h-full flex flex-col p-5">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
              <img 
                src={photo} 
                alt={name}
                className="w-12 h-12 rounded-full object-cover border-2 border-primary"
              />
              <div className="min-w-0">
                <h3 className="text-base font-bold text-foreground">{name}</h3>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {specialties.slice(0, 2).map((tag, i) => (
                    <span key={i} className="text-[11px] font-semibold text-primary uppercase">{tag}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Professional notes / About */}
            {about && (
              <div className="mb-4 p-4 bg-muted/30 rounded-xl border border-border/50">
                <p className="text-sm text-muted-foreground italic leading-relaxed line-clamp-6">
                  "{about}"
                </p>
              </div>
            )}

            {/* Action button */}
            <button 
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all duration-300 hover:shadow-lg hover:shadow-primary/25 mt-auto"
              onClick={(e) => {
                e.stopPropagation();
                navigate('/perfil-profissional');
              }}
            >
              <Eye className="h-4 w-4" />
              Ver Perfil
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalCard;