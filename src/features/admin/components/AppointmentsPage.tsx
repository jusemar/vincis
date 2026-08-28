import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Video,
  User,
  Hash,
} from 'lucide-react';
import Link from 'next/link';
import { rotaDoAtendimentoNoPainel } from '@/features/consultorias/constants/contratacao';
import {
  duracaoPorExtenso,
  formatarPreco,
} from '@/features/consultorias/lib/formato';
import type { ConsultoriaDoPrestadorDTO2 } from '@/features/consultorias/types/agendamento';

/**
 * Agenda do Profissional — agora com as consultorias reais.
 *
 * ## O que mudou, e o que não mudou
 *
 * O layout é o mesmo que estava aprovado: o calendário do mês à esquerda, o
 * painel do dia à direita, o modal de detalhe e as mesmas classes. O que mudou
 * é a origem do conteúdo — antes `mockAppointments`, cinco compromissos
 * escritos à mão com nomes inventados e links do Google Meet; agora as
 * Consultorias Agendadas que o Profissional realmente vendeu.
 *
 * ## Por que os links de reunião sumiram
 *
 * Porque eram falsos duas vezes: apontavam para salas que não existem e para um
 * provedor que não é o caminho da plataforma — a videochamada da Vincis será
 * dentro da Vincis, em etapa própria. Enquanto ela não existe, a tela diz que
 * não existe, em vez de oferecer um botão que leva a lugar nenhum.
 *
 * ## Por que não há "Novo Agendamento"
 *
 * O botão existia e não abria nada (o estado do modal nunca era lido). E não
 * havia o que abrir: quem marca horário é o Cliente, no perfil público, dentro
 * das faixas que o Profissional configurou. Um botão que promete criar
 * compromisso à mão descreveria um produto diferente deste.
 *
 * ## Fusos
 *
 * As horas vêm prontas do servidor, no fuso gravado **na consultoria** — não no
 * relógio de quem está olhando. O dia do calendário é comparado com a mesma
 * data local que veio de lá, e não com `Date` reconstruído no navegador, senão
 * uma consultoria das 23h apareceria no dia seguinte para metade do país.
 */

/** Só o que a grade precisa saber para posicionar um dia. */
function partesDaData(data: string) {
  const [ano, mes, dia] = data.split('-').map(Number);
  return { ano, mes, dia };
}

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function AppointmentsPage({
  consultorias = [],
}: {
  /**
   * As consultorias deste Profissional, carregadas no servidor.
   *
   * O padrão vazio existe para o dia em que a agenda ainda não vendeu nada — e
   * é ele que sustenta o estado vazio honesto, sem preencher a tela com
   * exemplos.
   */
  consultorias?: ConsultoriaDoPrestadorDTO2[];
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [selecionada, setSelecionada] = useState<ConsultoriaDoPrestadorDTO2 | null>(null);

  const month = currentDate.getMonth();
  const year = currentDate.getFullYear();

  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  /**
   * As consultorias de um dia da grade.
   *
   * A comparação é entre textos `AAAA-MM-DD` — o do calendário e o que o
   * servidor já resolveu no fuso da consultoria. Reconstruir um `Date` aqui
   * reinterpretaria o horário no fuso de quem está olhando.
   */
  const consultoriasDoDia = (day: number) => {
    const alvo = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return consultorias.filter((item) => item.data === alvo);
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  /**
   * O selo de estado.
   *
   * `agendada` é o único estado que a plataforma conhece hoje. Realizada,
   * cancelada e remarcada são etapas próprias — desenhar os selos delas agora
   * anunciaria comportamento que não existe.
   */
  const selo = (status: string) =>
    status === 'agendada' ? (
      <span className="px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-600 dark:text-green-400">Agendada</span>
    ) : (
      <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">{status}</span>
    );

  const diaExibido = selectedDate ?? today.getDate();
  const listaDoDia = consultoriasDoDia(diaExibido);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-4"
      >
        <div>
          <h2 className="text-2xl font-bold">Agenda</h2>
          <p className="text-muted-foreground">
            Suas consultorias agendadas pelos clientes.
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-card border rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold">{monthNames[month]} {year}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={nextMonth}
                className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2">
            {dayNames.map((day) => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[80px] rounded-lg" />
            ))}
            {Array.from({ length: daysInCurrentMonth }).map((_, i) => {
              const day = i + 1;
              const doDia = consultoriasDoDia(day);
              const isSelected = selectedDate === day;

              return (
                <motion.div
                  key={day}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => setSelectedDate(day)}
                  className={`min-h-[80px] rounded-lg p-2 cursor-pointer transition-all ${
                    isToday(day)
                      ? 'bg-primary/10 border-2 border-primary'
                      : isSelected
                      ? 'bg-primary/5 border border-primary'
                      : 'border border-transparent hover:bg-muted/50'
                  }`}
                >
                  <span className={`text-sm font-medium ${isToday(day) ? 'text-primary' : ''}`}>
                    {day}
                  </span>
                  <div className="mt-1 space-y-1">
                    {doDia.slice(0, 2).map((item) => (
                      <div
                        key={item.id}
                        className="text-xs p-1 rounded truncate bg-blue-500/10 text-blue-600"
                      >
                        {item.inicio} {item.clienteNome.split(' ')[0]}
                      </div>
                    ))}
                    {doDia.length > 2 && (
                      <div className="text-xs text-muted-foreground">
                        +{doDia.length - 2} mais
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-card border rounded-xl"
        >
          <div className="p-5 border-b">
            <h3 className="font-semibold">
              {selectedDate
                ? `${selectedDate} de ${monthNames[month]}`
                : `Hoje - ${today.getDate()} de ${monthNames[today.getMonth()]}`}
            </h3>
            <p className="text-sm text-muted-foreground">
              {listaDoDia.length}{' '}
              {listaDoDia.length === 1 ? 'consultoria' : 'consultorias'}
            </p>
          </div>
          <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
            {listaDoDia.length > 0 ? (
              listaDoDia.map((item, index) => (
                <motion.button
                  type="button"
                  key={item.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className="w-full text-left bg-muted/50 rounded-lg p-4 hover:bg-muted transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setSelecionada(item)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Video className="w-4 h-4 shrink-0" />
                      <span className="font-medium text-sm truncate">
                        {item.clienteNome}
                      </span>
                    </div>
                    {selo(item.status)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <Clock className="w-4 h-4 shrink-0" />
                    {item.inicio} às {item.fim} · {item.duracaoMinutos}min
                  </div>
                  {/*
                    O assunto aparece cortado aqui — o texto pode ter mil
                    caracteres, e o card do dia não é lugar para eles. O
                    completo está no detalhe e no Protocolo.
                  */}
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {item.descricao}
                  </p>
                </motion.button>
              ))
            ) : (
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">Nenhuma consultoria agendada.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {selecionada && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelecionada(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-y-auto overscroll-contain rounded-2xl bg-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-xl font-bold">Consultoria online</h3>
                  <p className="text-muted-foreground truncate">
                    {selecionada.clienteNome}
                  </p>
                </div>
                {selo(selecionada.status)}
              </div>

              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Data</p>
                    <p className="font-medium">
                      {(() => {
                        const { ano, mes, dia } = partesDaData(selecionada.data);
                        return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
                      })()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Horário</p>
                    <p className="font-medium">
                      {selecionada.inicio} às {selecionada.fim} ·{' '}
                      {duracaoPorExtenso(selecionada.duracaoMinutos)}
                    </p>
                    {/* O fuso é o da consultoria, e a tela diz qual é. */}
                    <p className="text-xs text-muted-foreground">
                      Fuso {selecionada.timezone}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Video className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Modalidade</p>
                    <p className="font-medium">Online</p>
                    {/*
                      Sem link de reunião: a videochamada da Vincis acontece
                      dentro da Vincis e é etapa própria. Um endereço externo
                      aqui seria informação falsa.
                    */}
                    <p className="text-xs text-muted-foreground">
                      Videochamada disponível em breve
                    </p>
                  </div>
                </div>

                {selecionada.protocolo && (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Hash className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">Protocolo</p>
                      <p className="font-mono font-medium break-all">
                        {selecionada.protocolo}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Valor contratado</p>
                    <p className="font-medium">
                      {formatarPreco(selecionada.valorCentavos)}
                      {selecionada.pagamentoStatus === 'aprovado' ? ' · pago' : ''}
                    </p>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">
                    O que o cliente deseja tratar
                  </p>
                  {/*
                    Aqui o texto vem inteiro: é o detalhe, e é para isso que ele
                    serve. `whitespace-pre-wrap` preserva os parágrafos que a
                    pessoa escreveu, e `break-words` impede que uma palavra
                    longa estoure o modal no celular.
                  */}
                  <p className="text-sm mt-1 whitespace-pre-wrap break-words">
                    {selecionada.descricao}
                  </p>
                </div>
              </div>

              <div className="p-6 border-t flex flex-wrap justify-end gap-3">
                <button
                  onClick={() => setSelecionada(null)}
                  className="px-5 py-2.5 rounded-lg border hover:bg-muted transition-colors"
                >
                  Fechar
                </button>
                {selecionada.protocolo && (
                  <Link
                    href={rotaDoAtendimentoNoPainel(selecionada.protocolo)}
                    className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Ver atendimento
                  </Link>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}