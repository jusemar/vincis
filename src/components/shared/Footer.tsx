"use client";
import { motion } from 'framer-motion';
import { 
  Mail, 
  Phone, 
  MapPin, 
  Linkedin, 
  Instagram, 
  Twitter, 
  Facebook,
  ArrowUpRight,
  Shield,
  CheckCircle
} from 'lucide-react';

const footerLinks = {
  servicos: [
    { name: 'Contabilidade', href: '#' },
    { name: 'Assistência Jurídica', href: '#' },
    { name: 'Serviços Avulsos', href: '#' },
    { name: 'Diretório de Advogados', href: '#' },
    { name: 'Planos e Preços', href: '#' },
  ],
  empresa: [
    { name: 'Sobre Nós', href: '#' },
    { name: 'Como Funciona', href: '#' },
    { name: 'Blog', href: '#' },
    { name: 'Carreiras', href: '#' },
    { name: 'Contato', href: '#' },
    { name: 'Parceiros', href: '/parceiros' },
  ],
  suporte: [
    { name: 'Central de Ajuda', href: '/suporte' },
    { name: 'Documentação', href: '#' },
    { name: 'Status', href: '#' },
    { name: 'Termos de Uso', href: '#' },
    { name: 'Privacidade', href: '#' },
  ],
};

const socialLinks = [
  { icon: Linkedin, href: '#', label: 'LinkedIn' },
  { icon: Instagram, href: '#', label: 'Instagram' },
  { icon: Twitter, href: '#', label: 'Twitter' },
  { icon: Facebook, href: '#', label: 'Facebook' },
];

const certifications = [
  { name: 'SSL Seguro', icon: Shield },
  { name: 'LGPD Compliant', icon: CheckCircle },
];

export default function Footer() {
  return (
    <footer className="relative bg-background border-t border-border/50">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="col-span-2 md:col-span-4 lg:col-span-2">
            {/* Logo */}
            <motion.a
              href="#"
              className="flex items-center gap-3 mb-6 group"
              whileHover={{ scale: 1.02 }}
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-gold flex items-center justify-center shadow-glow">
                <span className="text-navy-900 font-bold text-2xl">V</span>
              </div>
              <div>
                <span className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors">
                  Vincis
                </span>
                <p className="text-xs text-muted-foreground">Plataforma de Profissionais</p>
              </div>
            </motion.a>

            <p className="text-muted-foreground mb-6 max-w-sm leading-relaxed">
              Conectamos empresas aos melhores contadores, advogados e técnicos 
              especializados. Simplificamos a gestão do seu negócio.
            </p>

            {/* Contact Info */}
            <div className="space-y-3 mb-6">
              <a href="mailto:contato@vincis.com.br" className="alvo-toque-h group flex items-center gap-3 text-muted-foreground transition-colors hover:text-foreground">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Mail className="w-4 h-4" />
                </div>
                contato@vincis.com.br
              </a>
              <a href="tel:+551140045678" className="alvo-toque-h group flex items-center gap-3 text-muted-foreground transition-colors hover:text-foreground">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Phone className="w-4 h-4" />
                </div>
                (11) 4004-5678
              </a>
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <MapPin className="w-4 h-4" />
                </div>
                São Paulo, SP - Brasil
              </div>
            </div>

            {/* Social Links */}
            <div className="flex gap-3">
              {socialLinks.map((social) => {
                const Icon = social.icon;
                return (
                  <motion.a
                    key={social.label}
                    href={social.href}
                    className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-primary/20 transition-all"
                    whileHover={{ scale: 1.1, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    aria-label={social.label}
                  >
                    <Icon className="w-5 h-5" />
                  </motion.a>
                );
              })}
            </div>
          </div>

          {/* Services Links */}
          <div>
            <h4 className="text-foreground font-semibold mb-4">Serviços</h4>
            <ul className="space-y-3">
              {footerLinks.servicos.map((link) => (
                <li key={link.name}>
                  <a 
                    href={link.href}
                    className="alvo-toque-h group flex items-center gap-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.name}
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h4 className="text-foreground font-semibold mb-4">Empresa</h4>
            <ul className="space-y-3">
              {footerLinks.empresa.map((link) => (
                <li key={link.name}>
                  <a 
                    href={link.href}
                    className="alvo-toque-h group flex items-center gap-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.name}
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Support Links */}
          <div>
            <h4 className="text-foreground font-semibold mb-4">Suporte</h4>
            <ul className="space-y-3">
              {footerLinks.suporte.map((link) => (
                <li key={link.name}>
                  <a 
                    href={link.href}
                    className="alvo-toque-h group flex items-center gap-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.name}
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Copyright */}
            <p className="text-muted-foreground text-sm text-center md:text-left">
              © {new Date().getFullYear()} Vincis. Todos os direitos reservados.
            </p>

            {/* Certifications */}
            <div className="flex items-center gap-6">
              {certifications.map((cert) => {
                const Icon = cert.icon;
                return (
                  <div key={cert.name} className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Icon className="w-4 h-4" />
                    <span>{cert.name}</span>
                  </div>
                );
              })}
            </div>

            {/* Legal Links */}
            <div className="flex items-center gap-6 text-sm">
              <a href="#" className="alvo-toque-h inline-flex items-center text-muted-foreground transition-colors hover:text-foreground">
                Termos
              </a>
              <a href="#" className="alvo-toque-h inline-flex items-center text-muted-foreground transition-colors hover:text-foreground">
                Privacidade
              </a>
              <a href="#" className="alvo-toque-h inline-flex items-center text-muted-foreground transition-colors hover:text-foreground">
                Cookies
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
