import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  type SQL,
} from 'drizzle-orm'
import { db } from '@/db/connection'
import { clientes, usuarios } from '@/db/schema'
import {
  colunaNivelAcesso,
  condicaoAcessoCliente,
  condicaoColaboracaoAtiva,
  listarEmpresasAdministradas,
  permissoesDoNivel,
} from '../lib/acesso-cliente'
import {
  FiltrosClientesSchema,
  type FiltrosClientesDTO,
} from '../schemas/cliente'

const CLIENTES_POR_PAGINA = 9

/** Abaixo disto o termo é texto que por acaso tem número, não um telefone. */
const MINIMO_DIGITOS_TELEFONE = 4

/**
 * O termo digitado, reduzido ao formato em que o telefone está guardado.
 *
 * `clientes.telefone` nasce do `TelefoneSchema`, que grava **só dígitos**.
 * Aplicar a mesma regra ao termo faz `(11) 99999-9999`, `11999999999` e
 * `+55 11 99999-9999` caírem todos na mesma comparação, sem uma segunda
 * regra de normalização e sem tocar na coluna.
 *
 * O DDI cai quando sobra um telefone brasileiro completo: quem digita o
 * número internacional procura o mesmo cliente que quem digita sem ele.
 *
 * Termo com poucos dígitos não vira critério. Sem esse piso, buscar
 * "Loja 1" passaria a varrer a coluna de telefone com `%1%` e devolveria a
 * carteira inteira — a busca por nome pioraria em vez de melhorar.
 */
function digitosDoTelefone(busca: string) {
  const digitos = busca.replace(/\D/g, '')
  const semDdi =
    digitos.length > 11 && digitos.startsWith('55') ? digitos.slice(2) : digitos

  return semDdi.length >= MINIMO_DIGITOS_TELEFONE ? semDdi : null
}

export async function listarClientesProfissional(
  profissionalId: string,
  filtrosRecebidos: FiltrosClientesDTO = {},
) {
  const filtros = FiltrosClientesSchema.parse(filtrosRecebidos)
  const empresasAdministradas = await listarEmpresasAdministradas(profissionalId)
  const condicoes: SQL[] = [
    condicaoAcessoCliente(profissionalId, empresasAdministradas),
  ]

  if (filtros.status === 'arquivados') {
    condicoes.push(isNotNull(clientes.arquivadoEm))
  } else {
    condicoes.push(isNull(clientes.arquivadoEm))
  }

  if (filtros.status === 'ativo' || filtros.status === 'pendente') {
    condicoes.push(eq(clientes.status, filtros.status))
  }

  if (filtros.busca) {
    const termo = `%${filtros.busca.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
    const telefone = digitosDoTelefone(filtros.busca)
    const busca = or(
      ilike(clientes.nome, termo),
      ilike(clientes.email, termo),
      ilike(clientes.empresaNome, termo),
      // Critério a mais, nunca no lugar dos outros: nome e e-mail continuam
      // encontrando o que sempre encontraram.
      ...(telefone ? [ilike(clientes.telefone, `%${telefone}%`)] : []),
    )
    if (busca) condicoes.push(busca)
  }

  const where = and(...condicoes)
  const offset = (filtros.pagina - 1) * CLIENTES_POR_PAGINA
  const [registros, [total]] = await Promise.all([
    db
      .select({
        id: clientes.id,
        codigo: clientes.codigo,
        nome: clientes.nome,
        email: clientes.email,
        telefone: clientes.telefone,
        empresaNome: clientes.empresaNome,
        area: clientes.area,
        status: clientes.status,
        tipoAtendimento: clientes.tipoAtendimento,
        valorReferenciaCentavos: clientes.valorReferenciaCentavos,
        responsavelNome: usuarios.nome,
        arquivadoEm: clientes.arquivadoEm,
        createdAt: clientes.createdAt,
        // Sinaliza na interface que o acesso veio de colaboração externa
        // (somente leitura), e não de propriedade ou atribuição interna.
        acessoColaboracao: condicaoColaboracaoAtiva(profissionalId).mapWith(
          Boolean,
        ),
        nivelAcesso: colunaNivelAcesso(profissionalId, empresasAdministradas),
      })
      .from(clientes)
      .innerJoin(usuarios, eq(usuarios.id, clientes.profissionalId))
      .where(where)
      .orderBy(desc(clientes.createdAt))
      .limit(CLIENTES_POR_PAGINA)
      .offset(offset),
    db.select({ valor: count() }).from(clientes).where(where),
  ])

  return {
    // Cada linha já sai do servidor com as permissões reais: a interface não
    // recalcula regra nenhuma, só obedece.
    clientes: registros.map((registro) => ({
      ...registro,
      permissoes: permissoesDoNivel(registro.nivelAcesso),
    })),
    total: total?.valor ?? 0,
    pagina: filtros.pagina,
    totalPaginas: Math.max(
      1,
      Math.ceil((total?.valor ?? 0) / CLIENTES_POR_PAGINA),
    ),
  }
}

export async function contarClientesAtivosProfissional(
  profissionalId: string,
) {
  const empresasAdministradas = await listarEmpresasAdministradas(profissionalId)
  const [resultado] = await db
    .select({ valor: count() })
    .from(clientes)
    .where(
      and(
        condicaoAcessoCliente(profissionalId, empresasAdministradas),
        eq(clientes.status, 'ativo'),
        isNull(clientes.arquivadoEm),
      ),
    )

  return resultado?.valor ?? 0
}
