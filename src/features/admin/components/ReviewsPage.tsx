import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Star,
  Share,
  ThumbsUp,
  MessageSquare,
  Crown,
  TrendingUp,
} from 'lucide-react';

import type { PainelDeAvaliacoesDTO } from '@/features/avaliacoes/queries/painel-de-avaliacoes';

interface Review {
  id: string;
  client: string;
  avatar: string;
  stars: number;
  text: string;
  date: string;
  service: string;
  /**
   * Contador de "Útil".
   *
   * Curtida de avaliação não existe nesta etapa e não deve ser implementada
   * aqui. O botão continua no lugar, inerte como sempre esteve, e o contador
   * fica em zero — que é a verdade: ninguém marcou nada, porque não há como.
   */
  helpful: number;
}

/** Iniciais do nome do Cliente para o círculo dourado do card. */
function iniciais(nome: string) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0] ?? '')
    .join('')
    .toUpperCase();
}

const formatarData = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR').format(new Date(iso));

const recentAchievements = [
  { title: 'Resposta Rápida', icon: '⚡', description: '100 tickets respondidos em 24h' },
  { title: 'Super Pro', icon: '🏆', description: '50 serviços 5 estrelas' },
  { title: 'Cliente Satisfeito', icon: '😊', description: '10 clientes satisfeitos consecutivos' },
];

/**
 * Avaliações recebidas pelo prestador.
 *
 * Mesmo desenho aprovado — nota grande, barras por estrela, cards de comentário
 * — agora alimentado pelas avaliações reais. `mockReviews` e `reviewStats`
 * saíram daqui: a média, a quantidade, a distribuição e os comentários vêm de
 * `obterPainelDeAvaliacoes`, a mesma fonte do card público e do perfil público.
 *
 * Ranking e Conquistas continuam como estavam. Não são reputação deste
 * prestador e ranking é explicitamente uma etapa futura — conectá-los agora
 * seria implementar coisa que esta etapa não deve implementar.
 */
export default function ReviewsPage({ painel }: { painel?: PainelDeAvaliacoesDTO }) {
  const [filterStars, setFilterStars] = useState<number | null>(null);
  const [expandedReviews, setExpandedReviews] = useState<string[]>([]);

  const reviewStats = {
    // Sem avaliação nenhuma não existe média: o traço ocupa o mesmo lugar do
    // número sem afirmar uma reputação que ninguém deu. "0.0" ali seria a pior
    // nota possível, atribuída pela ausência de notas.
    average: painel?.reputacao.media ?? null,
    total: painel?.reputacao.total ?? 0,
    distribution: (painel?.distribuicao ?? [5, 4, 3, 2, 1].map((nota) => ({
      nota,
      total: 0,
      percentual: 0,
    }))).map((faixa) => ({
      stars: faixa.nota,
      count: faixa.total,
      percentage: faixa.percentual,
    })),
  };

  const reviews: Review[] = (painel?.recebidas ?? []).map((avaliacao) => ({
    id: avaliacao.id,
    client: avaliacao.autor,
    avatar: iniciais(avaliacao.autor),
    stars: avaliacao.nota,
    text: avaliacao.comentario ?? '',
    date: formatarData(avaliacao.criadoEm),
    // O contexto da nota é o protocolo do Atendimento avaliado — é ele que
    // transforma "4 estrelas" em algo sobre o que agir.
    service: `${avaliacao.protocolo} · ${avaliacao.atendimentoTitulo}`,
    helpful: 0,
  }));

  const filteredReviews = filterStars
    ? reviews.filter(r => r.stars === filterStars)
    : reviews;

  const toggleExpand = (id: string) => {
    setExpandedReviews(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const renderStars = (stars: number, size: 'sm' | 'lg' = 'sm') => {
    const sizeClass = size === 'lg' ? 'w-6 h-6' : 'w-4 h-4';
    return (
      <div className="flex items-center gap-0.5">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`${sizeClass} ${i < stars ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/30'}`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-4"
      >
        <div>
          <h2 className="text-2xl font-bold">Avaliações</h2>
          <p className="text-muted-foreground">Gerencie suas avaliações e feedback dos clientes.</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-gold text-on-gradient rounded-lg font-semibold shadow-glow hover:shadow-glow-lg transition-all"
        >
          <Share className="w-5 h-5" />
          Compartilhar Link
        </motion.button>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 space-y-6"
        >
          <div className="bg-card border rounded-xl p-6">
            <div className="flex items-center gap-6 flex-wrap">
              <div className="text-center">
                <div className="text-5xl font-bold text-primary">
                  {reviewStats.average === null
                    ? '—'
                    : reviewStats.average.toFixed(1)}
                </div>
                {renderStars(Math.round(reviewStats.average ?? 0), 'lg')}
                <p className="text-sm text-muted-foreground mt-2">{reviewStats.total} avaliações</p>
              </div>
              <div className="flex-1 space-y-2 min-w-[200px]">
                {reviewStats.distribution.map((dist) => (
                  <div key={dist.stars} className="flex items-center gap-2">
                    <span className="text-sm w-8">{dist.stars}★</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${dist.percentage}%` }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="h-full bg-primary rounded-full"
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-12">{dist.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-1 bg-muted rounded-lg w-fit">
            <button
              onClick={() => setFilterStars(null)}
              className={`px-4 py-2 text-sm rounded-md transition-all ${
                filterStars === null ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'
              }`}
            >
              Todas
            </button>
            {[5, 4, 3, 2, 1].map((stars) => (
              <button
                key={stars}
                onClick={() => setFilterStars(stars)}
                className={`px-4 py-2 text-sm rounded-md transition-all ${
                  filterStars === stars ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'
                }`}
              >
                {stars}★
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {/* Sem avaliação, uma linha discreta no lugar dos cards — o painel
                não inventa comentário para preencher espaço. */}
            {filteredReviews.length === 0 && (
              <div className="bg-card border rounded-xl p-5">
                <p className="text-sm text-muted-foreground">
                  {reviewStats.total === 0
                    ? 'Você ainda não recebeu avaliações. Elas aparecem aqui assim que um cliente avaliar um atendimento concluído.'
                    : 'Nenhuma avaliação com essa nota.'}
                </p>
              </div>
            )}
            {filteredReviews.map((review, index) => (
              <motion.div
                key={review.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.05 }}
                className="bg-card border rounded-xl p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-gold flex items-center justify-center">
                      <span className="font-bold text-on-gradient">{review.avatar}</span>
                    </div>
                    <div>
                      <h4 className="font-semibold">{review.client}</h4>
                      <p className="text-sm text-muted-foreground">{review.service}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {renderStars(review.stars)}
                    <p className="text-xs text-muted-foreground mt-1">{review.date}</p>
                  </div>
                </div>

                <p className={`text-sm text-muted-foreground ${!expandedReviews.includes(review.id) && review.text.length > 150 ? 'line-clamp-2' : ''}`}>
                  {review.text}
                </p>
                {review.text.length > 150 && (
                  <button
                    onClick={() => toggleExpand(review.id)}
                    className="text-sm text-primary hover:underline mt-2"
                  >
                    {expandedReviews.includes(review.id) ? 'Ver menos' : 'Ver mais'}
                  </button>
                )}

                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="flex items-center gap-4">
                    <button className="alvo-toque-h flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                      <ThumbsUp className="w-4 h-4" />
                      Útil ({review.helpful})
                    </button>
                    <button className="alvo-toque-h flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                      <MessageSquare className="w-4 h-4" />
                      Responder
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          <div className="bg-card border rounded-xl">
            <div className="p-5 border-b">
              <h3 className="font-semibold flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-500" />
                Ranking
              </h3>
            </div>
            <div className="p-5">
              <div className="text-center mb-6">
                <div className="text-6xl mb-2">🏆</div>
                <h4 className="text-xl font-bold">Top 5</h4>
                <p className="text-sm text-muted-foreground">Profissional mais bem avaliado</p>
              </div>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((position) => (
                  <div
                    key={position}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      position === 1 ? 'bg-gradient-to-r from-green-500/20 to-green-500/5 border border-green-500/30' : 'bg-muted/50'
                    }`}
                  >
                    <span className="text-2xl font-bold w-8">{position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : position}</span>
                    <div className="flex-1">
                      <p className={`font-medium ${position === 1 ? 'text-green-500' : ''}`}>
                        {position === 1 ? 'Ana Silva (Você)' : `Profissional ${position}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{position === 1 ? '4.8 ★' : `${(4.8 - position * 0.1).toFixed(1)} ★`}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-primary/10 to-amber-500/10 border border-primary/20 rounded-xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Suas Conquistas
            </h3>
            <div className="space-y-4">
              {recentAchievements.map((achievement, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <span className="text-2xl">{achievement.icon}</span>
                  <div>
                    <p className="font-medium text-sm">{achievement.title}</p>
                    <p className="text-xs text-muted-foreground">{achievement.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}