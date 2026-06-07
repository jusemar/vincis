import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Headset } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import { BotoesAuth, ModalEntrar, ModalCadastro, useControleModais } from '@/features/usuarios';

const navLinks = [
  { name: 'Início', href: '/', type: 'route' },
  { name: 'Profissionais', href: '/profissionais', type: 'route' },
  { name: 'Parceiros', href: '/parceiros', type: 'route' },
  { name: 'Serviços', href: '/#models', type: 'hash' },
  { name: 'Como Funciona', href: '/como-funciona', type: 'route' },
  { name: 'Preços', href: '/precos', type: 'route' },
];

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { modalAberto, abrir, fechar, alternarPara } = useControleModais();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (href: string) => {
    if (href.startsWith('/#')) {
      const element = document.querySelector(href.substring(1));
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
    setIsMobileMenuOpen(false);
  };

  // Verifica se o link está ativo
  const isLinkActive = (link: typeof navLinks[0]) => {
    if (link.type === 'route') {
      return location.pathname === link.href;
    } else {
      return location.pathname === '/' && location.hash === link.href.substring(1);
    }
  };

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isScrolled
            ? 'glass py-3'
            : 'bg-transparent py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Link to="/" className="flex items-center gap-2 group">
                <div className="w-10 h-10 rounded-xl bg-gradient-gold flex items-center justify-center shadow-glow">
                  <span className="text-navy-900 font-bold text-xl">V</span>
                </div>
                <span className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                  Vincis
                </span>
              </Link>
            </motion.div>

            {/* Desktop Navigation - TODOS OS MENUS IGUAIS */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link, index) => {
                const active = isLinkActive(link);
                
                return (
                  <motion.div
                    key={link.name}
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    {link.type === 'route' ? (
                      <Link
                        to={link.href}
                        className="relative px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
                      >
                        {link.name}
                        {/* Underline animation - igual para todos */}
                        <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 bg-primary transition-all duration-300 ${
                          active ? 'w-1/2' : 'w-0 group-hover:w-1/2'
                        }`} />
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        onClick={(e) => {
                          e.preventDefault();
                          scrollToSection(link.href);
                        }}
                        className="relative px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
                      >
                        {link.name}
                        {/* Underline animation - igual para todos */}
                        <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 bg-primary transition-all duration-300 ${
                          active ? 'w-1/2' : 'w-0 group-hover:w-1/2'
                        }`} />
                      </a>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Right side buttons */}
            <div className="hidden md:flex items-center gap-3">
              {/* Suporte */}
              <Link
                to="/suporte"
                className="p-2 text-foreground/70 hover:text-primary transition-colors"
                title="Suporte"
              >
                <Headset className="w-5 h-5" />
              </Link>

              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Entrar / Criar conta */}
              <BotoesAuth onAbrirEntrar={() => abrir('entrar')} onAbrirCadastro={() => abrir('cadastro')} />
            </div>

            {/* Mobile Menu Button */}
            <div className="flex items-center gap-2 md:hidden">
              <ThemeToggle />
              <motion.button
                className="p-2 text-foreground"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                whileTap={{ scale: 0.9 }}
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 md:hidden"
          >
            <div className="absolute inset-0 bg-background/95 backdrop-blur-xl" onClick={() => setIsMobileMenuOpen(false)} />
            <motion.div
              className="absolute top-20 left-4 right-4 glass-card rounded-2xl p-6"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
            >
              <div className="flex flex-col gap-2">
                {navLinks.map((link, index) => {
                  return (
                    <motion.div
                      key={link.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      {link.type === 'route' ? (
                        <Link
                          to={link.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="px-4 py-3 text-lg font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg flex items-center gap-3"
                        >
                          {link.name}
                        </Link>
                      ) : (
                        <a
                          href={link.href}
                          onClick={(e) => {
                            e.preventDefault();
                            scrollToSection(link.href);
                          }}
                          className="px-4 py-3 text-lg font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg flex items-center gap-3"
                        >
                          {link.name}
                        </a>
                      )}
                    </motion.div>
                  );
                })}
                
                {/* Mobile menu buttons - Entrar e Cadastrar */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="mt-4 flex flex-col gap-2"
                >
                  <BotoesAuth
                    variant="mobile"
                    onAbrirEntrar={() => { setIsMobileMenuOpen(false); abrir('entrar') }}
                    onAbrirCadastro={() => { setIsMobileMenuOpen(false); abrir('cadastro') }}
                  />
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ModalEntrar
        aberto={modalAberto === 'entrar'}
        onFechar={fechar}
        onAbrirCadastro={() => alternarPara('cadastro')}
      />
      <ModalCadastro
        aberto={modalAberto === 'cadastro'}
        onFechar={fechar}
        onAbrirEntrar={() => alternarPara('entrar')}
      />
    </>
  );
}