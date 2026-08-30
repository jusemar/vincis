import { startTransition, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Search,
  User,
  Settings,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import ThemeToggle from '@/components/shared/ThemeToggle';
import { useAuth } from '@/features/usuarios';
import {
  carregarNotificacoes,
  marcarNotificacaoLida,
  marcarTodasNotificacoesLidas,
} from '@/features/notificacoes/actions/notificacoes';
import { iconeDaNotificacao } from '@/features/notificacoes/constants/notificacao';
import { rotaDoDestino } from '@/features/notificacoes/lib/rota-do-destino';
import { useEventoRealtime } from '@/features/tempo-real/components/TempoRealProvider';
import type { NotificacaoDTO } from '@/features/notificacoes/queries/listar-notificacoes';

function obterIniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return 'US';

  return `${partes[0][0]}${partes.length > 1 ? partes.at(-1)?.[0] ?? '' : ''}`.toUpperCase();
}

interface Notification {
  id: number;
  title: string;
  message: string;
  time: string;
  type: 'ticket' | 'payment' | 'appointment' | 'review';
  read: boolean;
}

/**
 * Notificações de demonstração.
 *
 * Mantidas de propósito nesta fase: elas ficam lado a lado com as reais no
 * mesmo dropdown, para comparação visual. Removê-las depois é apagar esta
 * constante e o `MOCKS` de `linhasDoSino` — nada mais.
 */
const mockNotifications: Notification[] = [
  { id: 1, title: 'Novo ticket', message: 'João Silva enviou uma mensagem', time: '2 min', type: 'ticket', read: false },
  { id: 2, title: 'Pagamento confirmado', message: 'Maria Santos efetuou o pagamento', time: '1h', type: 'payment', read: false },
  { id: 3, title: 'Agendamento', message: 'Reunião amanhã às 10h', time: '3h', type: 'appointment', read: true },
  { id: 4, title: 'Nova avaliação', message: 'Você recebeu 5 estrelas!', time: '1 dia', type: 'review', read: true },
];

/**
 * Uma linha do sino, venha ela de onde vier.
 *
 * Mock e real desembocam nesta mesma forma, e por isso o dropdown desenha os
 * dois com exatamente o mesmo bloco de JSX — nenhuma variação visual entre
 * origens, que é justamente o ponto da comparação nesta fase.
 */
type LinhaDoSino = {
  chave: string;
  icone: string;
  titulo: string;
  mensagem: string;
  tempo: string;
  lida: boolean;
  /** Ausente nos mocks: eles não navegam para lugar nenhum. */
  real?: NotificacaoDTO;
};

const ICONE_MOCK: Record<Notification['type'], string> = {
  ticket: '💬',
  payment: '💰',
  appointment: '📅',
  review: '⭐',
};

/** "2 min", "3h", "1 dia" — mesma escala curta que os mocks já usavam. */
function tempoRelativo(iso: string, agora = Date.now()) {
  const minutos = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `${horas}h`;
  const dias = Math.round(horas / 24);
  return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

/**
 * Monta a fila do sino: as reais na frente, as mockadas atrás.
 *
 * A ordem é deliberada — o que a plataforma realmente registrou vem primeiro, e
 * a demonstração fica logo abaixo para efeito de comparação.
 */
function linhasDoSino(reais: NotificacaoDTO[]): LinhaDoSino[] {
  return [
    ...reais.map((real) => ({
      chave: `real-${real.id}`,
      icone: iconeDaNotificacao(real.tipo),
      titulo: real.titulo,
      mensagem: real.resumo,
      tempo: tempoRelativo(real.criadoEm),
      lida: real.lida,
      real,
    })),
    ...mockNotifications.map((mock) => ({
      chave: `mock-${mock.id}`,
      icone: ICONE_MOCK[mock.type],
      titulo: mock.title,
      mensagem: mock.message,
      tempo: mock.time,
      lida: mock.read,
    })),
  ];
}

export default function AdminHeader({
  /**
   * "Meu Perfil" é destino do prestador (`/admin?pagina=profile`). Nas telas
   * incorporadas da Gestão esse destino não existe, então o item sai do menu —
   * o logout e o resto do cabeçalho seguem iguais.
   */
  ocultarPerfil = false,
}: {
  ocultarPerfil?: boolean
} = {}) {
  const router = useRouter();
  const { usuario, logout } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [saindo, setSaindo] = useState(false);
  const [notificacoesReais, setNotificacoesReais] = useState<NotificacaoDTO[]>([]);
  const [naoLidasReais, setNaoLidasReais] = useState(0);

  const buscarNotificacoes = useCallback(async () => {
    const resultado = await carregarNotificacoes();
    if (!resultado.sucesso || !resultado.dados) return;
    setNotificacoesReais(resultado.dados.lista);
    setNaoLidasReais(resultado.dados.naoLidas);
  }, []);

  useEffect(() => {
    startTransition(async () => {
      await buscarNotificacoes();
    });
  }, [buscarNotificacoes]);

  /**
   * O sino acompanha o tempo real.
   *
   * A fila é carregada por Server Action no navegador, fora do que o
   * `router.refresh()` renova. Sem isto o número no sino só mudaria no próximo
   * F5 — justamente o que esta etapa veio corrigir.
   */
  useEventoRealtime(() => {
    startTransition(async () => {
      await buscarNotificacoes();
    });
  });

  const linhas = linhasDoSino(notificacoesReais);
  // O número do sino é o das notificações **reais** não lidas somado ao dos
  // mocks que continuam na tela. Enquanto as duas origens convivem, o contador
  // precisa bater com o que a pessoa vê ao abrir — do contrário pareceria bug.
  const unreadCount =
    naoLidasReais + mockNotifications.filter(n => !n.read).length;

  /**
   * Clique numa notificação real.
   *
   * Marca como lida e navega para o contexto que a originou: o Atendimento na
   * aba certa, ou a negociação daquele convite. O destino é só uma rota — a
   * tela de chegada continua autorizando o acesso por conta própria, então um
   * link nunca contorna permissão.
   */
  async function abrirNotificacao(notificacao: NotificacaoDTO) {
    setShowNotifications(false);
    await marcarNotificacaoLida({ notificacaoId: notificacao.id });
    await buscarNotificacoes();

    // Mesma montagem que o toast do tempo real usa: um formato só de URL.
    router.push(rotaDoDestino(notificacao.destino));
  }

  async function lerTodas() {
    await marcarTodasNotificacoesLidas();
    await buscarNotificacoes();
  }
  const nomeUsuario = usuario?.nome ?? 'Usuário';
  const iniciaisUsuario = obterIniciais(nomeUsuario);

  async function handleLogout() {
    if (saindo) return;

    setSaindo(true);
    setShowProfile(false);
    await logout();
    router.replace('/');
    router.refresh();
  }

  return (
    <header className="relative z-50 flex h-16 items-center justify-between overflow-visible border-b bg-card/95 px-3 backdrop-blur-md sm:px-6">
      <div className="hidden items-center gap-4 sm:flex">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar clientes, serviços..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 h-10 pl-10 pr-4 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />

        <div className="relative">
          <motion.button
            onClick={() => setShowNotifications(!showNotifications)}
            className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-accent transition-colors relative"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 min-w-[20px] flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1">
                {unreadCount}
              </span>
            )}
          </motion.button>

          <AnimatePresence>
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-[90]" onClick={() => setShowNotifications(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="fixed right-3 top-16 z-[100] flex max-h-[calc(100dvh-5.5rem)] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-xl sm:absolute sm:right-0 sm:top-12 sm:max-h-[min(30rem,calc(100dvh-8rem))]"
                >
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b p-4">
                    <h3 className="font-semibold">Notificações</h3>
                    {/* Já existia visualmente um rodapé de ação; o que faltava
                        era ele fazer alguma coisa. "Marcar todas" atua só nas
                        reais — mock não tem estado para gravar. */}
                    {naoLidasReais > 0 && (
                      <button
                        onClick={() => void lerTodas()}
                        className="text-xs text-primary hover:underline"
                      >
                        Marcar todas como lidas
                      </button>
                    )}
                  </div>
                  <div className="rolagem-contida min-h-0 flex-1 overflow-y-auto">
                    {linhas.map((linha) => (
                      <motion.div
                        key={linha.chave}
                        onClick={() =>
                          linha.real ? void abrirNotificacao(linha.real) : undefined
                        }
                        className={`p-4 border-b hover:bg-accent/50 cursor-pointer transition-colors ${
                          !linha.lida ? 'bg-primary/5' : ''
                        }`}
                        whileHover={{ x: 4 }}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-xl">{linha.icone}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{linha.titulo}</p>
                            <p className="text-xs text-muted-foreground truncate">{linha.mensagem}</p>
                            <p className="text-xs text-muted-foreground mt-1">{linha.tempo}</p>
                          </div>
                          {!linha.lida && (
                            <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <div className="shrink-0 border-t p-3">
                    <button
                      onClick={() => {
                        setShowNotifications(false);
                        router.push('/admin?pagina=atendimentos');
                      }}
                      className="w-full text-sm text-primary hover:underline"
                    >
                      Ver todas as notificações
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <motion.button
            onClick={() => setShowProfile(!showProfile)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-gold flex items-center justify-center">
              <span className="font-bold text-sm text-on-gradient">{iniciaisUsuario}</span>
            </div>
            <div className="text-left hidden md:block">
              <p className="max-w-40 truncate text-sm font-medium">{nomeUsuario}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </motion.button>

          <AnimatePresence>
            {showProfile && (
              <>
                <div className="fixed inset-0 z-[90]" onClick={() => setShowProfile(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="fixed top-16 right-3 z-[100] w-[min(14rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border bg-card shadow-xl sm:absolute sm:top-12 sm:right-0 sm:w-56"
                >
                  <div className="p-4 border-b">
                    <p className="truncate text-sm font-medium">{nomeUsuario}</p>
                  </div>
                  <div className="p-2">
                    {!ocultarPerfil && (
                      <Link
                        href="/admin?pagina=profile"
                        onClick={() => setShowProfile(false)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors"
                      >
                        <User className="w-4 h-4" />
                        Meu Perfil
                      </Link>
                    )}
                    <button
                      type="button"
                      disabled
                      title="Configurações ainda não disponíveis"
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm opacity-50 cursor-not-allowed"
                    >
                      <Settings className="w-4 h-4" />
                      Configurações
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      disabled={saindo}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors text-destructive disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <LogOut className="w-4 h-4" />
                      {saindo ? 'Saindo...' : 'Sair'}
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
