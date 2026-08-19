'use client'

import { useEffect, useState, useTransition } from 'react'
import { Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  alternarServicoAtivo,
  excluirServico,
  listarMeusServicos,
} from '../actions/catalogo'
import { LIMITE_SERVICOS_CATALOGO } from '../schemas/servico'
import { rotuloPreco } from '../lib/formatar-preco'
import type { ModeloPreco } from '../schemas/servico'
import { ModalNovoServico, type ServicoEditavel } from './ModalNovoServico'

type ServicoLista = {
  id: string
  nome: string
  descricaoCurta: string
  descricaoDetalhada: string | null
  categoria: string
  itensIncluidos: string[]
  checklistModelo: string[]
  modeloPreco: string
  valorCentavos: number | null
  prazoEstimadoDias: number | null
  ativo: boolean
  publico: boolean
  ordem: number
}

const ROTULO_MODELO: Record<string, string> = {
  fixo: 'Valor fixo',
  a_partir_de: 'A partir de',
  por_hora: 'Por hora',
  sob_orcamento: 'Sob orçamento',
}

const ROTULO_CATEGORIA: Record<string, string> = {
  contabil: 'Contábil',
  juridico: 'Jurídico',
  consultoria: 'Consultoria',
}

/**
 * Catálogo público do prestador — o que ele vende.
 *
 * Vive em Meu Perfil porque descreve a oferta, não a operação: o que os
 * clientes já contrataram fica em Admin → Serviços. Usa os mesmos Card, Badge e
 * Button das demais abas, sem estilo novo.
 */
export function CatalogoServicos() {
  const [servicos, setServicos] = useState<ServicoLista[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<ServicoEditavel | null>(null)
  const [versao, setVersao] = useState(0)
  const [processando, iniciarTransicao] = useTransition()

  const atingiuLimite = servicos.length >= LIMITE_SERVICOS_CATALOGO

  useEffect(() => {
    let ativo = true
    void (async () => {
      setCarregando(true)
      const resultado = await listarMeusServicos()
      if (!ativo) return
      if (resultado.sucesso && resultado.dados) {
        setServicos(resultado.dados as ServicoLista[])
      }
      setCarregando(false)
    })()
    return () => {
      ativo = false
    }
  }, [versao])

  function alternar(servico: ServicoLista) {
    iniciarTransicao(async () => {
      const resultado = await alternarServicoAtivo({
        servicoId: servico.id,
        ativo: !servico.ativo,
      })
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      setVersao((atual) => atual + 1)
    })
  }

  function excluir(servico: ServicoLista) {
    iniciarTransicao(async () => {
      const resultado = await excluirServico(servico.id)
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      // Serviço já contratado é arquivado, não apagado: a mensagem explica.
      toast.success(resultado.mensagem)
      setVersao((atual) => atual + 1)
    })
  }

  function abrirEdicao(servico: ServicoLista) {
    setEmEdicao({
      id: servico.id,
      nome: servico.nome,
      descricaoCurta: servico.descricaoCurta,
      descricaoDetalhada: servico.descricaoDetalhada ?? '',
      categoria: servico.categoria,
      itensIncluidos: servico.itensIncluidos,
      checklistModelo: servico.checklistModelo ?? [],
      modeloPreco: servico.modeloPreco as ModeloPreco,
      valorCentavos: servico.valorCentavos,
      prazoEstimadoDias: servico.prazoEstimadoDias,
      ativo: servico.ativo,
      publico: servico.publico,
      ordem: servico.ordem,
    })
    setModalAberto(true)
  }

  return (
    <div className="space-y-4">
      <Card className="border-amber-500/15 shadow-card">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base">Meus serviços</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {/* Contador discreto, na mesma linha de apoio que já existia. */}
              {atingiuLimite
                ? `Você atingiu o limite de ${LIMITE_SERVICOS_CATALOGO} serviços.`
                : `${servicos.length} de ${LIMITE_SERVICOS_CATALOGO} serviços. Estes serviços aparecem no seu perfil público.`}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            // Serviço inativo continua ocupando vaga: o limite é de cadastro.
            disabled={atingiuLimite || processando}
            title={
              atingiuLimite
                ? `Exclua um serviço para cadastrar outro.`
                : undefined
            }
            onClick={() => {
              setEmEdicao(null)
              setModalAberto(true)
            }}
          >
            <Plus className="size-4" />
            Novo Serviço
          </Button>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Carregando seus serviços...
            </p>
          ) : servicos.length === 0 ? (
            <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center">
              <p className="font-medium">Você ainda não cadastrou serviços.</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Cadastre os serviços que você oferece para que os clientes
                possam contratá-los pelo seu perfil.
              </p>
            </div>
          ) : (
            <ul className="divide-y rounded-xl border">
              {servicos.map((servico) => (
                <li key={servico.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{servico.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {servico.descricaoCurta}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold text-primary">
                      {rotuloPreco(
                        servico.modeloPreco as ModeloPreco,
                        servico.valorCentavos,
                      )}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {ROTULO_MODELO[servico.modeloPreco] ?? servico.modeloPreco}
                    </Badge>
                    <Badge variant="secondary">
                      {ROTULO_CATEGORIA[servico.categoria] ?? servico.categoria}
                    </Badge>
                    <Badge variant={servico.ativo ? 'default' : 'secondary'}>
                      {servico.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <Badge variant={servico.publico ? 'default' : 'secondary'}>
                      {servico.publico ? 'Público' : 'Não público'}
                    </Badge>
                    {servico.prazoEstimadoDias ? (
                      <Badge variant="secondary">
                        {servico.prazoEstimadoDias} dias
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={processando}
                      onClick={() => abrirEdicao(servico)}
                    >
                      <Pencil className="size-4" />
                      Editar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={processando}
                      onClick={() => alternar(servico)}
                    >
                      <Power className="size-4" />
                      {servico.ativo ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={processando}
                      onClick={() => excluir(servico)}
                    >
                      <Trash2 className="size-4" />
                      Excluir
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ModalNovoServico
        // Remonta ao trocar de alvo: garante o formulário sempre coerente.
        key={emEdicao?.id ?? 'novo'}
        aberto={modalAberto}
        servico={emEdicao}
        onFechar={() => {
          setModalAberto(false)
          setEmEdicao(null)
        }}
        onSalvo={() => {
          setModalAberto(false)
          setEmEdicao(null)
          setVersao((atual) => atual + 1)
        }}
      />
    </div>
  )
}
