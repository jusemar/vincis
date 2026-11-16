"use client";
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { ContatoProtegido } from '@/features/institucional/components/ContatoProtegido';
import { GRUPOS_RODAPE, ROTAS_INSTITUCIONAIS, type GrupoRodape } from '@/features/institucional/constants/rotas';

/**
 * Rodapé público da Vincis.
 *
 * Quatro grupos fixos, definidos em `features/institucional/constants/rotas.ts`
 * e iguais em todos os ambientes — antes a produção desenhava colunas do CMS e o
 * localhost outras, e havia links `#`, telefone e endereço fictícios, redes
 * sociais sem perfil e um selo "LGPD Compliant" sem verificação. Tudo isso saiu.
 *
 * Os contatos usam `ContatoProtegido`: o endereço só é montado no navegador e o
 * link só nasce no clique, o que dificulta a coleta automática por robôs simples.
 */

function ColunaLinks({ grupo }: { grupo: GrupoRodape }) {
  return (
    <nav aria-label={grupo.titulo} className="min-w-0">
      <h4 className="mb-4 font-semibold text-foreground">{grupo.titulo}</h4>
      <ul className="space-y-3">
        {grupo.links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="alvo-toque-h group flex items-center gap-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="break-words">{link.texto}</span>
              <ArrowUpRight className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function Footer() {
  return (
    <footer className="relative border-t border-border/50 bg-background">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-6 lg:gap-12">
          {/* Marca e contatos */}
          <div className="col-span-2 md:col-span-4 lg:col-span-2">
            <Link href="/" className="group mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-gold shadow-glow">
                <span className="text-2xl font-bold text-navy-900">V</span>
              </div>
              <div>
                <span className="text-2xl font-bold text-foreground transition-colors group-hover:text-primary">
                  Vincis
                </span>
                <p className="text-xs text-muted-foreground">Plataforma de Profissionais</p>
              </div>
            </Link>

            <p className="mb-6 max-w-sm leading-relaxed text-muted-foreground">
              Plataforma digital que conecta clientes a profissionais independentes das áreas contábil e jurídica.
            </p>

            <div className="space-y-3">
              <ContatoProtegido canal="email" />
              <ContatoProtegido canal="whatsapp" />
            </div>
          </div>

          {GRUPOS_RODAPE.map((grupo) => (
            <ColunaLinks key={grupo.titulo} grupo={grupo} />
          ))}
        </div>
      </div>

      <div className="border-t border-border/50">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <p className="text-center text-sm text-muted-foreground md:text-left">
              © {new Date().getFullYear()} Vincis. Todos os direitos reservados.
            </p>
            <div className="flex items-center gap-6 text-sm">
              <Link
                href={ROTAS_INSTITUCIONAIS.termosDeUso}
                className="alvo-toque-h inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Termos de Uso
              </Link>
              <Link
                href={ROTAS_INSTITUCIONAIS.politicaDePrivacidade}
                className="alvo-toque-h inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Privacidade
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
