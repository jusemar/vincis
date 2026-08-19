import { BriefcaseBusiness, FileText, MapPin, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export type DadosResumoPerfilProfissional = {
  usuarioId: string
  nome: string
  email: string
  whatsapp?: string | null
  tipoProfissional?: string
  numeroRegistro?: string | null
  estadoRegistro?: string | null
  areasAtuacao?: string | string[]
  apresentacao?: string
  nomeAtuacao?: string
  modalidadeAtuacao?: string
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string
  estado?: string
  tempoExperiencia?: number | null
  regimesAtendidos?: string[]
  telefoneContato?: string
  emailProfissional?: string
  comprovanteRegistroNomeOriginal?: string | null
  statusAnalise?: string
  observacaoAnalise?: string | null
}

const CATEGORIAS: Record<string, string> = {
  contabilidade: 'Contabilidade - Contador',
  especialista_fiscal: 'Contabilidade - Especialista Fiscal',
  advocacia: 'Jurídico - Advogado',
}
const REGIMES: Record<string, string> = { mei: 'MEI', simples_nacional: 'Simples Nacional', lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real' }

function Linha({ rotulo, valor }: { rotulo: string; valor?: string | number | null }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</dt><dd className="mt-1 break-words text-sm font-medium">{valor || 'Não informado'}</dd></div>
}

export function ResumoPerfilProfissional({ dados }: { dados: DadosResumoPerfilProfissional }) {
  const areas = Array.isArray(dados.areasAtuacao) ? dados.areasAtuacao.join(', ') : dados.areasAtuacao
  const regimes = dados.regimesAtendidos?.map((item) => REGIMES[item] ?? item).join(', ')
  const endereco = [dados.logradouro, dados.numero, dados.complemento].filter(Boolean).join(', ')
  return <div className="grid gap-5 md:grid-cols-2">
    <Card><CardContent className="space-y-5 p-6"><h2 className="flex items-center gap-2 font-serif text-xl font-semibold"><UserRound className="size-5 text-primary"/>Identificação</h2><dl className="grid gap-4 sm:grid-cols-2"><Linha rotulo="Nome" valor={dados.nome}/><Linha rotulo="E-mail da conta" valor={dados.email}/><Linha rotulo="Categoria" valor={dados.tipoProfissional ? CATEGORIAS[dados.tipoProfissional] ?? dados.tipoProfissional : undefined}/><Linha rotulo="Situação" valor={dados.statusAnalise?.replaceAll('_', ' ')}/><Linha rotulo="Registro" valor={dados.numeroRegistro || 'Não aplicável'}/><Linha rotulo="Experiência" valor={dados.tempoExperiencia !== undefined ? `${dados.tempoExperiencia ?? 0} anos` : undefined}/></dl></CardContent></Card>
    <Card><CardContent className="space-y-5 p-6"><h2 className="flex items-center gap-2 font-serif text-xl font-semibold"><BriefcaseBusiness className="size-5 text-primary"/>Atuação e contato</h2><dl className="grid gap-4 sm:grid-cols-2"><Linha rotulo="Nome de atuação" valor={dados.nomeAtuacao || dados.nome}/><Linha rotulo="Modalidade" valor={dados.modalidadeAtuacao === 'escritorio' ? 'Escritório' : 'Atuação individual'}/><Linha rotulo="Áreas" valor={areas}/><Linha rotulo="Regimes atendidos" valor={regimes || 'Não aplicável'}/><Linha rotulo="Telefone profissional" valor={dados.telefoneContato || dados.whatsapp}/><Linha rotulo="E-mail profissional" valor={dados.emailProfissional}/></dl></CardContent></Card>
    <Card><CardContent className="space-y-5 p-6"><h2 className="flex items-center gap-2 font-serif text-xl font-semibold"><MapPin className="size-5 text-primary"/>Endereço profissional</h2><dl className="grid gap-4 sm:grid-cols-2"><Linha rotulo="Endereço" valor={endereco}/><Linha rotulo="Bairro" valor={dados.bairro}/><Linha rotulo="Cidade/UF" valor={dados.cidade && dados.estado ? `${dados.cidade}/${dados.estado}` : undefined}/><Linha rotulo="CEP" valor={dados.cep}/></dl></CardContent></Card>
    <Card><CardContent className="space-y-5 p-6"><h2 className="font-serif text-xl font-semibold">Apresentação</h2><p className="whitespace-pre-wrap text-sm leading-relaxed">{dados.apresentacao || 'Não informada'}</p>{dados.comprovanteRegistroNomeOriginal && <div><p className="mb-2 text-xs text-muted-foreground">{dados.comprovanteRegistroNomeOriginal}</p><Button asChild variant="outline"><a target="_blank" rel="noreferrer" href={`/api/perfis-profissionais/${dados.usuarioId}/comprovante`}><FileText/>Visualizar comprovante</a></Button></div>}</CardContent></Card>
  </div>
}
