import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  DollarSign,
  FileText,
  Camera,
  Eye,
  Save,
  Shield,
  Bell,
  CreditCard,
  Globe,
  Edit,
  Check,
} from 'lucide-react';

export default function ProfilePage() {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: 'Ana Silva',
    title: 'Contadora',
    email: 'ana.silva@email.com',
    phone: '(11) 99999-1234',
    location: 'São Paulo, SP',
    bio: 'Atendo pequenas empresas há 10 anos, oferecendo soluções contábeis e jurídicas completas. Especialista em Simples Nacional e Tributação.',
    specialties: ['Imposto de Renda', 'MEI', 'Simples Nacional', 'Contabilidade Geral', 'Planejamento Tributário'],
    basePrice: '350',
    cnpj: '12.345.678/0001-90',
    registration: 'CRC SP 123456',
    languages: ['Português', 'Inglês'],
  });

  const stats = {
    clients: 24,
    services: 156,
    rating: 4.8,
    yearsExperience: 10,
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-2xl font-bold">Meu Perfil</h2>
          <p className="text-muted-foreground">Gerencie suas informações profissionais.</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsEditing(!isEditing)}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-all ${
            isEditing
              ? 'bg-green-500 text-white'
              : 'bg-gradient-gold text-on-gradient shadow-glow hover:shadow-glow-lg'
          }`}
        >
          {isEditing ? (
            <>
              <Check className="w-5 h-5" />
              Salvar Alterações
            </>
          ) : (
            <>
              <Edit className="w-5 h-5" />
              Editar Perfil
            </>
          )}
        </motion.button>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-1 space-y-6"
        >
          <div className="bg-card border rounded-xl p-6 text-center">
            <div className="relative inline-block mb-4">
              <div className="w-32 h-32 rounded-full bg-gradient-gold flex items-center justify-center shadow-glow">
                <span className="font-bold text-4xl text-on-gradient">AS</span>
              </div>
              {isEditing && (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg"
                >
                  <Camera className="w-5 h-5 text-primary-foreground" />
                </motion.button>
              )}
            </div>
            <h3 className="text-xl font-bold">{formData.name}</h3>
            <p className="text-muted-foreground">{formData.title}</p>
            <div className="flex items-center justify-center gap-2 mt-2 text-amber-500">
              {[...Array(5)].map((_, i) => (
                <span key={i} className={i < Math.floor(stats.rating) ? '★' : '☆'}>
                  ★
                </span>
              ))}
              <span className="text-foreground ml-1">{stats.rating}</span>
            </div>
            <div className="flex items-center justify-center gap-6 mt-4 py-4 border-t border-b">
              <div>
                <p className="text-2xl font-bold">{stats.clients}</p>
                <p className="text-xs text-muted-foreground">Clientes</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.services}</p>
                <p className="text-xs text-muted-foreground">Serviços</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.yearsExperience}</p>
                <p className="text-xs text-muted-foreground">Anos</p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border hover:bg-muted transition-colors"
            >
              <Eye className="w-4 h-4" />
              Visualizar Card Público
            </motion.button>
          </div>

          <div className="bg-card border rounded-xl p-5">
            <h3 className="font-semibold mb-4">Especialidades</h3>
            <div className="flex flex-wrap gap-2">
              {formData.specialties.map((specialty, index) => (
                <motion.span
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + index * 0.05 }}
                  className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm"
                >
                  {specialty}
                </motion.span>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 space-y-6"
        >
          <div className="bg-card border rounded-xl p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <User className="w-5 h-5" />
              Informações Pessoais
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Nome Completo</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full h-11 px-4 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">{formData.name}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Título Profissional</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full h-11 px-4 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">{formData.title}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">E-mail</label>
                {isEditing ? (
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full h-11 px-4 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">{formData.email}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Telefone</label>
                {isEditing ? (
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full h-11 px-4 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">{formData.phone}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Localização</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full h-11 px-4 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">{formData.location}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">CNPJ/CPF</label>
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">{formData.cnpj}</p>
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-xl p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Informações Profissionais
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Registro Profissional</label>
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">{formData.registration}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Preço Base (Serviço Avulso)</label>
                {isEditing ? (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                    <input
                      type="text"
                      value={formData.basePrice}
                      onChange={(e) => setFormData({ ...formData, basePrice: e.target.value })}
                      className="w-full h-11 pl-10 pr-4 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">R$ {formData.basePrice}</p>
                )}
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium mb-1.5">Descrição / Bio</label>
              {isEditing ? (
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              ) : (
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">{formData.bio}</p>
              )}
            </div>
          </div>

          <div className="bg-card border rounded-xl p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Idiomas
            </h3>
            <div className="flex flex-wrap gap-2">
              {formData.languages.map((lang, index) => (
                <motion.span
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + index * 0.05 }}
                  className="px-3 py-1.5 rounded-lg bg-muted text-sm"
                >
                  {lang}
                </motion.span>
              ))}
              {isEditing && (
                <button className="px-3 py-1.5 rounded-lg border border-dashed text-sm text-muted-foreground hover:text-foreground hover:border-primary transition-colors">
                  + Adicionar
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}