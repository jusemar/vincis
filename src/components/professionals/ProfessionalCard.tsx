import { useState } from 'react';
import { 
  Star, 
  Clock, 
  GraduationCap, 
  Briefcase, 
  MapPin, 
  Calendar,
  Tag,
  Users,
  Video
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
  onOpenBooking?: () => void;
}

const ProfessionalCard = ({ professional, index, onOpenBooking }: ProfessionalCardProps) => {
  const [isFlipped, setIsFlipped] = useState(false);

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

  const pricingTiers = [
    { hours: 1, price: hourlyRate, discount: 0 },
    { hours: 5, price: Math.round(hourlyRate * 0.85), discount: 15 },
  ];

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

            {/* Pricing tiers */}
            <div className="flex-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                <Tag className="h-3.5 w-3.5" />
                Preço por Quantidade
              </div>
              <div className="space-y-2">
                {pricingTiers.map((tier) => (
                  <div 
                    key={tier.hours}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-xl"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">
                        {tier.hours}h
                      </span>
                      {tier.discount > 0 && (
                        <span className="text-[11px] font-bold text-green-500 bg-green-500/15 px-2 py-0.5 rounded-full">
                          -{tier.discount}%
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-bold text-primary">
                      R$ {tier.price * tier.hours}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Client discount + online info */}
            <div className="flex flex-col gap-2 mt-3">
              <div className="flex items-center gap-2 p-2.5 bg-primary/10 rounded-xl border border-primary/20">
                <Users className="h-4 w-4 text-primary flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-primary">Já é cliente?</span> Ganhe 10% extra!
                </p>
              </div>
              <div className="flex items-center gap-2 p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20">
                <Video className="h-4 w-4 text-blue-400 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-blue-400">100% online</span> — videochamada
                </p>
              </div>
            </div>

            {/* Action button */}
            <button 
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all duration-300 hover:shadow-lg hover:shadow-primary/25 mt-3"
              onClick={(e) => {
                e.stopPropagation();
                onOpenBooking?.();
              }}
            >
              <Calendar className="h-4 w-4" />
              Agendar Consulta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalCard;