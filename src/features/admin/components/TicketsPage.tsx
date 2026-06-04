import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Clock,
  CheckCircle,
  AlertCircle,
  Video,
  Phone,
  Mail,
  MessageSquare,
  User,
  SendHorizontal,
} from 'lucide-react';

interface Message {
  id: number;
  from: 'client' | 'professional';
  text: string;
  time: string;
  read: boolean;
}

interface TicketData {
  id: string;
  client: string;
  clientId: number;
  subject: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'waiting' | 'answered' | 'closed';
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  unreadMessages: number;
}

const mockTickets: TicketData[] = [
  {
    id: '#1023',
    client: 'João Silva',
    clientId: 1,
    subject: 'Dúvida sobre cálculo do IRPF 2023',
    category: 'Contabilidade',
    priority: 'high',
    status: 'waiting',
    createdAt: '14/04/2024 10:30',
    updatedAt: '14/04/2024 10:30',
    unreadMessages: 1,
    messages: [
      { id: 1, from: 'client', text: 'Olá, tenho uma dúvida sobre o cálculo do imposto de renda desse ano. Minha situação mudou e gostaria de entender como isso afeta minha declaração.', time: '14/04 10:30', read: false },
    ],
  },
  {
    id: '#1022',
    client: 'Maria Santos',
    clientId: 2,
    subject: 'Envio da guia de pagamento de maio',
    category: 'Contabilidade',
    priority: 'medium',
    status: 'answered',
    createdAt: '13/04/2024 09:00',
    updatedAt: '13/04/2024 14:20',
    unreadMessages: 0,
    messages: [
      { id: 1, from: 'client', text: 'Preciso da guia de pagamento de maio para o meu departamento financeiro.', time: '13/04 09:00', read: true },
      { id: 2, from: 'professional', text: 'Olá Maria! A guia está anexa. Qualquer dúvida, estou à disposição.', time: '13/04 14:20', read: true },
    ],
  },
  {
    id: '#1021',
    client: 'Carlos Oliveira',
    clientId: 3,
    subject: 'Solicitação de reunião para revisão contratual',
    category: 'Jurídico',
    priority: 'medium',
    status: 'open',
    createdAt: '12/04/2024 16:45',
    updatedAt: '12/04/2024 16:45',
    unreadMessages: 1,
    messages: [
      { id: 1, from: 'client', text: 'Bom dia! Preciso agendar uma reunião para revisar alguns pontos do contrato social da empresa. Quando podemos conversar?', time: '12/04 16:45', read: false },
    ],
  },
  {
    id: '#1020',
    client: 'Ana Souza',
    clientId: 4,
    subject: 'Confirmação de entrega da declaração',
    category: 'Contabilidade',
    priority: 'low',
    status: 'closed',
    createdAt: '10/04/2024 11:00',
    updatedAt: '11/04/2024 09:30',
    unreadMessages: 0,
    messages: [
      { id: 1, from: 'client', text: 'Bom dia, gostaria de saber se minha declaração já foi enviada.', time: '10/04 11:00', read: true },
      { id: 2, from: 'professional', text: 'Olá Ana! Sim, sua declaração foi enviada com sucesso ontem. O protocolo é 123456789.', time: '10/04 14:30', read: true },
      { id: 3, from: 'client', text: 'Perfeito, muito obrigada!', time: '11/04 09:30', read: true },
    ],
  },
];

export default function TicketsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'waiting' | 'answered' | 'closed'>('all');
  const [selectedTicket, setSelectedTicket] = useState<TicketData | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [expandedTickets, setExpandedTickets] = useState<string[]>([]);

  const filteredTickets = mockTickets.filter((ticket) => {
    const matchesSearch =
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || ticket.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const toggleTicket = (ticketId: string) => {
    setExpandedTickets(prev =>
      prev.includes(ticketId)
        ? prev.filter(id => id !== ticketId)
        : [...prev, ticketId]
    );
  };

  const getPriorityBadge = (priority: TicketData['priority']) => {
    switch (priority) {
      case 'high':
        return <span className="px-2 py-0.5 rounded text-xs bg-red-500/10 text-red-600 dark:text-red-400">Alta</span>;
      case 'medium':
        return <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">Média</span>;
      case 'low':
        return <span className="px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400">Baixa</span>;
    }
  };

  const getStatusBadge = (status: TicketData['status']) => {
    switch (status) {
      case 'open':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400"><AlertCircle className="w-3 h-3" /> Aberto</span>;
      case 'waiting':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400"><Clock className="w-3 h-3" /> Aguardando</span>;
      case 'answered':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400"><CheckCircle className="w-3 h-3" /> Respondido</span>;
      case 'closed':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground"><CheckCircle className="w-3 h-3" /> Fechado</span>;
    }
  };

  const handleSendMessage = () => {
    if (newMessage.trim() && selectedTicket) {
      setSelectedTicket({
        ...selectedTicket,
        messages: [
          ...selectedTicket.messages,
          { id: selectedTicket.messages.length + 1, from: 'professional', text: newMessage, time: new Date().toLocaleString('pt-BR'), read: true },
        ],
        status: 'answered',
      });
      setNewMessage('');
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-4"
      >
        <div>
          <h2 className="text-2xl font-bold">Mensagens</h2>
          <p className="text-muted-foreground">Gerencie suas conversas com clientes.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{mockTickets.filter(t => t.status === 'waiting').length} aguardando resposta</span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-4 flex-wrap"
      >
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por assunto, cliente ou ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 p-1 bg-muted rounded-lg">
          {(['all', 'open', 'waiting', 'answered', 'closed'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 text-sm rounded-md transition-all ${
                filterStatus === status
                  ? 'bg-background shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {status === 'all' ? 'Todos' : status === 'open' ? 'Abertos' : status === 'waiting' ? 'Aguardando' : status === 'answered' ? 'Respondidos' : 'Fechados'}
            </button>
          ))}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-card border rounded-xl overflow-hidden"
        >
          <div className="p-4 border-b">
            <h3 className="font-semibold">Tickets</h3>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            {filteredTickets.map((ticket, index) => (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + index * 0.05 }}
              >
                <div
                  className={`p-4 border-b hover:bg-muted/50 transition-colors cursor-pointer ${
                    selectedTicket?.id === ticket.id ? 'bg-primary/5' : ''
                  } ${ticket.unreadMessages > 0 ? 'border-l-4 border-l-primary' : ''}`}
                  onClick={() => {
                    setSelectedTicket(ticket);
                    toggleTicket(ticket.id);
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{ticket.id}</span>
                        {getPriorityBadge(ticket.priority)}
                      </div>
                      <h4 className="font-medium mt-1">{ticket.subject}</h4>
                      <p className="text-sm text-muted-foreground">{ticket.client}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {getStatusBadge(ticket.status)}
                      <span className="text-xs text-muted-foreground">{ticket.updatedAt}</span>
                    </div>
                  </div>
                  {ticket.unreadMessages > 0 && (
                    <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs">
                      {ticket.unreadMessages} nova(s) mensagem(ns)
                    </span>
                  )}
                </div>

                <AnimatePresence>
                  {expandedTickets.includes(ticket.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="bg-muted/30 overflow-hidden"
                    >
                      <div className="p-4 space-y-3">
                        {ticket.messages.slice(-2).map((msg) => (
                          <div
                            key={msg.id}
                            className={`p-3 rounded-lg ${
                              msg.from === 'client'
                                ? 'bg-background'
                                : 'bg-primary/10 ml-8'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span className="text-xs font-medium">
                                {msg.from === 'client' ? ticket.client : 'Você'}
                              </span>
                              <span className="text-xs text-muted-foreground">{msg.time}</span>
                            </div>
                            <p className="text-sm">{msg.text}</p>
                          </div>
                        ))}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTicket(ticket);
                          }}
                          className="w-full py-2 text-sm text-primary hover:underline"
                        >
                          Ver conversa completa
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-card border rounded-xl flex flex-col"
        >
          {selectedTicket ? (
            <>
              <div className="p-4 border-b">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{selectedTicket.id}</span>
                      {getPriorityBadge(selectedTicket.priority)}
                    </div>
                    <h3 className="font-semibold mt-1">{selectedTicket.subject}</h3>
                    <p className="text-sm text-muted-foreground">{selectedTicket.client}</p>
                  </div>
                  {getStatusBadge(selectedTicket.status)}
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors text-sm">
                    <Video className="w-4 h-4" />
                    Video
                  </button>
                  <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors text-sm">
                    <Phone className="w-4 h-4" />
                    Ligar
                  </button>
                  <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-accent transition-colors text-sm">
                    <Mail className="w-4 h-4" />
                    E-mail
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]">
                {selectedTicket.messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.from === 'professional' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] p-4 rounded-2xl ${
                        msg.from === 'client'
                          ? 'bg-background border'
                          : 'bg-gradient-gold text-on-gradient'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium">
                          {msg.from === 'client' ? selectedTicket.client : 'Você'}
                        </span>
                        <span className={`text-xs ${msg.from === 'client' ? 'text-muted-foreground' : 'text-navy-700'}`}>
                          {msg.time}
                        </span>
                      </div>
                      <p className="text-sm">{msg.text}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {selectedTicket.status !== 'closed' && (
                <div className="p-4 border-t">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Digite sua mensagem..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      className="flex-1 h-11 px-4 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    />
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleSendMessage}
                      className="h-11 w-11 rounded-lg bg-gradient-gold text-on-gradient flex items-center justify-center shadow-glow"
                    >
                      <SendHorizontal className="w-5 h-5" />
                    </motion.button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Selecione um ticket para ver a conversa</p>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}