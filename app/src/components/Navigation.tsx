import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronRight, Users } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

const navLinks = [
  { name: 'Início', href: '/', type: 'route' },
  { name: 'Profissionais', href: '/profissionais', type: 'route', icon: Users, highlight: true },
  { name: 'Serviços', href: '/#models', type: 'hash' },
  { name: 'Como Funciona', href: '/#how-it-works', type: 'hash' },
  { name: 'Preços', href: '/#pricing', type: 'hash' },
];

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link, index) => {
                const Icon = link.icon;
                const isActive = location.pathname === link.href || 
                  (link.href.startsWith('/#') && location.pathname === '/' && location.hash === link.href.substring(1));
                
                return link.type === 'route' ? (
                  <motion.div
                    key={link.name}
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Link
                      to={link.href}
                      className={`relative px-4 py-2 text-sm font-medium transition-colors group flex items-center gap-2 rounded-lg ${
                        link.highlight 
                          ? 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20' 
                          : 'text-muted-foreground hover:text-foreground'
                      } ${isActive ? 'text-foreground' : ''}`}
                    >
                      {Icon && <Icon className="w-4 h-4" />}
                      {link.name}
                      {link.highlight && (
                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      )}
                    </Link>
                  </motion.div>
                ) : (
                  <motion.a
                    key={link.name}
                    href={link.href}
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToSection(link.href);
                    }}
                    className="relative px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.05 }}
                  >
                    {link.name}
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-primary group-hover:w-1/2 transition-all duration-300" />
                  </motion.a>
                );
              })}
            </div>

            {/* Right side buttons */}
            <div className="hidden md:flex items-center gap-4">
              {/* Theme Toggle */}
              <ThemeToggle />
              
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Link
                  to="/profissionais"
                  className="px-5 py-2.5 text-sm font-semibold text-primary-foreground bg-gradient-gold rounded-lg btn-shine shadow-glow hover:shadow-glow-lg transition-shadow flex items-center gap-2"
                >
                  Encontrar Profissional
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </motion.div>
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
                  const Icon = link.icon;
                  return link.type === 'route' ? (
                    <motion.div
                      key={link.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Link
                        to={link.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`px-4 py-3 text-lg font-medium rounded-lg flex items-center gap-3 ${
                          link.highlight
                            ? 'bg-primary/10 text-primary border border-primary/20'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        {Icon && <Icon className="w-5 h-5" />}
                        {link.name}
                        {link.highlight && (
                          <span className="w-2 h-2 bg-green-400 rounded-full ml-auto" />
                        )}
                      </Link>
                    </motion.div>
                  ) : (
                    <motion.a
                      key={link.name}
                      href={link.href}
                      onClick={(e) => {
                        e.preventDefault();
                        scrollToSection(link.href);
                      }}
                      className="px-4 py-3 text-lg font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      {link.name}
                    </motion.a>
                  );
                })}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="mt-4"
                >
                  <Link
                    to="/profissionais"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="w-full px-5 py-3 text-sm font-semibold text-primary-foreground bg-gradient-gold rounded-lg flex items-center justify-center gap-2"
                  >
                    <Users className="w-5 h-5" />
                    Encontrar Profissional
                  </Link>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
