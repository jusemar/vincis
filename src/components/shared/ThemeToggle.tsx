import { motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Botão de tema.
 *
 * O tema salvo só é conhecido no navegador (localStorage), depois que o
 * provedor monta. Se o ícone visível viesse do estado React, o servidor
 * renderizaria o Sol e o cliente — hidratando o cabeçalho depois que o tema
 * salvo já foi aplicado — a Lua: divergência de hidratação.
 *
 * Por isso nada aqui depende do tema na marcação: os dois ícones são sempre
 * renderizados e qual aparece é decidido por CSS, pelo `data-theme` do `<html>`
 * (variante `dark:`, ligada a `[data-theme="dark"]` no Tailwind). Servidor e
 * cliente geram o mesmo HTML, a transição continua suave e o clique segue
 * trocando o tema pelo contexto, como antes. O rótulo acessível é fixo pelo
 * mesmo motivo.
 */
export default function ThemeToggle() {
  const { toggleTheme } = useTheme();

  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-card border border-border flex items-center justify-center overflow-hidden group"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label="Alternar entre tema claro e escuro"
      title="Alternar entre tema claro e escuro"
    >
      <span
        aria-hidden
        className="absolute opacity-100 scale-100 transition-[opacity,transform] duration-200 dark:opacity-0 dark:scale-0"
      >
        <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
      </span>
      <span
        aria-hidden
        className="absolute opacity-0 scale-0 transition-[opacity,transform] duration-200 dark:opacity-100 dark:scale-100"
      >
        <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
      </span>
    </motion.button>
  );
}
