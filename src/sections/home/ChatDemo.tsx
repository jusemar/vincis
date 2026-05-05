import { useRef, useState, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import { MessageCircle, Send, Sparkles, Bot, User, Clock, Check, CheckCheck, Pause, Play, ArrowRight, Shield, Users, Zap, Award } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'support';
  text: string;
  isTyping?: boolean;
  timestamp?: string;
}

const chatConversation: ChatMessage[] = [
  {
    id: '1',
    sender: 'user',
    text: 'Olá! Preciso de ajuda com a contabilidade da minha empresa.',
    timestamp: '09:41',
  },
  {
    id: '2',
    sender: 'support',
    text: 'Olá! Bem-vindo à Vincis! 😊',
    isTyping: true,
    timestamp: '09:41',
  },
  {
    id: '3',
    sender: 'support',
    text: 'Claro! Qual o regime tributário da sua empresa? MEI, Simples Nacional ou Lucro Presumido?',
    isTyping: true,
    timestamp: '09:42',
  },
  {
    id: '4',
    sender: 'user',
    text: 'É Simples Nacional. Quanto custa o plano mensal?',
    timestamp: '09:43',
  },
  {
    id: '5',
    sender: 'support',
    text: 'Perfeito! Para Simples Nacional temos o plano Business por R$ 399/mês.',
    isTyping: true,
    timestamp: '09:43',
  },
  {
    id: '6',
    sender: 'support',
    text: 'Inclui: folha de pagamento, obrigações acessórias, relatórios mensais e suporte 24/7! 📊',
    isTyping: true,
    timestamp: '09:44',
  },
  {
    id: '7',
    sender: 'user',
    text: 'E se eu precisar de um advogado também?',
    timestamp: '09:45',
  },
  {
    id: '8',
    sender: 'support',
    text: 'Temos o Pacote Empresarial Completo! 🎯',
    isTyping: true,
    timestamp: '09:45',
  },
  {
    id: '9',
    sender: 'support',
    text: 'Contabilidade + Assistência Jurídica por apenas R$ 298/mês (economia de R$ 200)!',
    isTyping: true,
    timestamp: '09:46',
  },
  {
    id: '10',
    sender: 'support',
    text: 'Quer que eu conecte você com um especialista agora? ⚡',
    isTyping: true,
    timestamp: '09:46',
  },
];

const TypingText = ({ text, onComplete, speed = 1000 }: { text: string; onComplete: () => void; speed?: number }) => {
  const words = text.split(', ');
  const [currentWord, setCurrentWord] = useState(0);
  const [displayedWords, setDisplayedWords] = useState<string[]>([]);

  useEffect(() => {
    if (currentWord < words.length) {
      const timer = setTimeout(() => {
        setDisplayedWords(prev => [...prev, words[currentWord]]);
        setCurrentWord(prev => prev + 1);
      }, speed);
      return () => clearTimeout(timer);
    } else {
      onComplete();
    }
  }, [currentWord, words, speed, onComplete]);

  return (
    <span className="text-primary font-medium">
      {displayedWords.join(', ')}
      {currentWord < words.length && <span className="animate-pulse">|</span>}
    </span>
  );
};

// 3D Notebook Component com tela maior
const Notebook3D = ({ children }: { children: React.ReactNode }) => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
    const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
    setMousePosition({ x: x * 15, y: y * -10 });
  };

  const handleMouseLeave = () => {
    setMousePosition({ x: 0, y: 0 });
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full max-w-4xl mx-auto perspective-1500"
      style={{ perspective: '1500px' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        className="relative"
        animate={{
          rotateX: mousePosition.y,
          rotateY: mousePosition.x,
        }}
        transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Notebook Base - Tamanho aumentado */}
        <div className="relative bg-gradient-to-b from-slate-800 to-slate-900 rounded-3xl p-3 shadow-2xl">
          {/* Screen Bezel */}
          <div className="bg-slate-950 rounded-2xl p-4 overflow-hidden">
            {/* Screen Content - Altura aumentada para 650px */}
            <div className="bg-background rounded-xl overflow-hidden h-[550px] flex flex-col">
              {children}
            </div>
          </div>
          
          {/* Webcam */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-slate-700 border border-slate-600">
            <div className="absolute inset-0.5 rounded-full bg-green-500/50 animate-pulse" />
          </div>
          
          {/* Logo */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
            <span className="text-slate-600 text-xs font-medium tracking-wider">VINCIS</span>
          </div>
        </div>

        {/* Keyboard Deck */}
        <div 
          className="absolute -bottom-10 left-0 right-0 h-10 bg-gradient-to-b from-slate-800 to-slate-900 rounded-b-3xl"
          style={{ 
            transform: 'rotateX(60deg) translateZ(-20px)',
            transformOrigin: 'top center'
          }}
        >
          {/* Trackpad */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-5 bg-slate-700/50 rounded-lg" />
        </div>

        {/* Glow Effect */}
        <div className="absolute -inset-4 bg-primary/20 rounded-[2rem] blur-3xl -z-10 opacity-50" />
      </motion.div>
    </div>
  );
};

// Chat Interface
const ChatInterface = ({ 
  messages, 
  currentMessageIndex, 
  onTypingComplete,
  isPaused,
  onTogglePause,
  onRestart
}: { 
  messages: ChatMessage[]; 
  currentMessageIndex: number;
  onTypingComplete: () => void;
  isPaused: boolean;
  onTogglePause: () => void;
  onRestart: () => void;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [userName] = useState('Ana Souza');
  const [companyName] = useState('Vincis');
  const [typingStates, setTypingStates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentMessageIndex, typingStates]);

  const visibleMessages = messages.slice(0, currentMessageIndex + 1);
  const currentMessage = messages[currentMessageIndex];
  
  // Verifica se a mensagem atual está em modo de digitação
  const isCurrentTyping = currentMessage?.isTyping && typingStates[currentMessage.id] !== false;

  // Quando uma mensagem com isTyping começa, ativa o estado
  useEffect(() => {
    if (currentMessage?.isTyping && !typingStates[currentMessage.id]) {
      setTypingStates(prev => ({ ...prev, [currentMessage.id]: true }));
    }
  }, [currentMessage, typingStates]);

  const handleTypingCompleteForMessage = (messageId: string) => {
    setTypingStates(prev => ({ ...prev, [messageId]: false }));
    onTypingComplete();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
          </div>
          <div>
            <h4 className="font-semibold text-base text-foreground">{companyName}</h4>
            <p className="text-xs text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              Online
            </p>
          </div>
        </div>
        
        {/* Control Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onTogglePause}
            className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
            title={isPaused ? "Continuar" : "Pausar"}
          >
            {isPaused ? (
              <Play className="w-4 h-4 text-foreground" />
            ) : (
              <Pause className="w-4 h-4 text-foreground" />
            )}
          </button>
          <button
            onClick={onRestart}
            className="p-2 rounded-lg bg-primary/20 hover:bg-primary/30 transition-colors"
            title="Reproduzir novamente"
          >
            <MessageCircle className="w-4 h-4 text-primary" />
          </button>
        </div>
      </div>

      {/* Chat Messages - Scrollable Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ scrollBehavior: 'smooth' }}
      >
        {visibleMessages.map((msg, index) => {
          const isMessageTyping = typingStates[msg.id] && msg.isTyping;
          // Velocidade de digitação: cliente mais rápido (20ms), empresa mais lento (40ms)
          const typingSpeed = msg.sender === 'user' ? 20 : 45;
          
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3 }}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-3 max-w-[80%] ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${
                  msg.sender === 'user' 
                    ? 'bg-primary/20' 
                    : 'bg-gradient-gold'
                }`}>
                  {msg.sender === 'user' ? (
                    <User className="w-4 h-4 text-primary" />
                  ) : (
                    <Bot className="w-4 h-4 text-primary-foreground" />
                  )}
                </div>

{/* Message Bubble */}
<div className={`relative px-4 py-2.5 rounded-2xl ${
  msg.sender === 'user'
    ? 'bg-primary text-primary-foreground dark:bg-[#1E3A8A] dark:text-white rounded-br-md'
    : 'bg-muted text-foreground rounded-bl-md'
}`}>
                  {/* Sender Name */}
                  <p className="text-[11px] font-semibold mb-1 opacity-70">
                    {msg.sender === 'user' ? userName : companyName}
                  </p>
                  <p className="text-sm leading-relaxed">
                    {index === currentMessageIndex && isMessageTyping ? (
                      <TypingText 
                        text={msg.text} 
                        onComplete={() => handleTypingCompleteForMessage(msg.id)}
                        speed={typingSpeed}
                      />
                    ) : (
                      msg.text
                    )}
                  </p>
                  <div className={`flex items-center gap-1 mt-1 text-[10px] ${
                    msg.sender === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                  }`}>
                    <span>{msg.timestamp}</span>
                    {msg.sender === 'support' && index < currentMessageIndex && (
                      <CheckCheck className="w-3 h-3" />
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}

        {/* Typing Indicator */}
        {currentMessage?.isTyping && typingStates[currentMessage.id] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-gold flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="bg-muted px-4 py-2.5 rounded-2xl rounded-bl-md flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{companyName} está digitando</span>
                <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Chat Input */}
      <div className="p-4 border-t border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Digite sua mensagem..."
              className="w-full px-4 py-2.5 pr-10 rounded-lg bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              readOnly
            />
            <button className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Send className="w-3.5 h-3.5 text-primary-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function ChatDemo() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isTypingActive, setIsTypingActive] = useState(false);

  // Start animation when in view
  useEffect(() => {
    if (isInView && !hasStarted) {
      setHasStarted(true);
    }
  }, [isInView, hasStarted]);

  // Auto-advance conversation
  useEffect(() => {
    if (!hasStarted || isPaused) return;

    const currentMessage = chatConversation[currentMessageIndex];
    
    if (!currentMessage) {
      return;
    }

    // Se está em modo de digitação, não avança até completar
    if (isTypingActive) return;

    // Se a mensagem tem isTyping, ativa o modo digitação
    if (currentMessage.isTyping) {
      setIsTypingActive(true);
      // O tempo de digitação será gerenciado pelo TypingText
      return;
    }

    // Para mensagens sem digitação (usuário), avança após delay
    if (!currentMessage.isTyping) {
      const timeout = setTimeout(() => {
        setCurrentMessageIndex(prev => prev + 1);
      }, 1200);
      return () => clearTimeout(timeout);
    }
  }, [currentMessageIndex, hasStarted, isPaused, isTypingActive]);

  const handleTypingComplete = () => {
    setIsTypingActive(false);
    setCurrentMessageIndex(prev => prev + 1);
  };

  const restartConversation = () => {
    setCurrentMessageIndex(0);
    setIsPaused(false);
    setIsTypingActive(false);
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  return (
    <section 
      ref={sectionRef}
      className="relative py-24 overflow-hidden"
    >
      {/* Background */}
      <div className="absolute inset-0 bg-background" />
      <div className="absolute inset-0 bg-grid opacity-30" />
      
      {/* Decorative Elements */}
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="h-8 mb-6"></div>
         
<motion.h2
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            Orientação <span className="text-primary">contábil</span> e <span className="text-primary">jurídica</span> online
          </motion.h2>

          <motion.p
            className="text-xl text-muted-foreground max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            Única plataforma que conecta você a <span className="text-primary font-medium">contadores</span>
             , <span className="text-primary font-medium">advogados </span>e 
              <span className="text-primary font-medium"> profissionais da área</span>
          </motion.p>
        </div>

        {/* 3D Notebook with Chat */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <Notebook3D>
            <ChatInterface 
              messages={chatConversation}
              currentMessageIndex={currentMessageIndex}
              onTypingComplete={handleTypingComplete}
              isPaused={isPaused}
              onTogglePause={togglePause}
              onRestart={restartConversation}
            />
          </Notebook3D>
        </motion.div>

        {/* Features */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 1 }}
        >
          {[
            {
              icon: Clock,
              title: 'Resposta em 2 min',
              description: 'Nosso time responde em média em menos de 2 minutos',
            },
            {
              icon: Check,
              title: 'Especialistas reais',
              description: 'Contadores e advogados qualificados à sua disposição',
            },
            {
              icon: Sparkles,
              title: 'Disponível 24/7',
              description: 'Atendimento todos os dias, inclusive feriados',
            },
          ].map((feature, index) => (
            <motion.div
              key={index}
              className="glass-card rounded-2xl p-6 text-center"
              whileHover={{ y: -5, scale: 1.02 }}
              transition={{ duration: 0.3 }}
            >
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h4 className="font-semibold text-foreground mb-2">{feature.title}</h4>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}