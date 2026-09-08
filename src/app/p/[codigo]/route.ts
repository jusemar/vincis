import { NextResponse, type NextRequest } from 'next/server'
import {
  COOKIE_INDICACAO,
  DIAS_COOKIE_INDICACAO,
} from '@/features/parceiros/constants/indicacao'
import {
  PARAMETRO_DESTINO,
  resolverDestinoInterno,
} from '@/features/parceiros/constants/destino'
import { registrarAcessoPeloLink } from '@/features/parceiros/lib/registrar-acesso'
import {
  dadosTecnicosDoAcesso,
  gerarTokenDeVisitante,
  tokenDeVisitanteValido,
} from '@/features/parceiros/lib/visitante'

/**
 * O destino do link de indicação: `/p/<codigo>`.
 *
 * Um link geral por parceiro. Ele identifica **quem indicou**, e não o que foi
 * indicado — a pessoa que chega ainda pode se interessar por qualquer coisa da
 * Vincis, e amarrar o link a um serviço decidiria por ela.
 *
 * ## O que acontece aqui
 *
 * Confere o código, garante um identificador de navegador, grava o acesso e
 * manda a pessoa para o destino. Quem chega não vê nada disso: nenhuma tela de
 * espera, nenhum parâmetro de indicação na URL final, nenhum aviso. Um link de
 * indicação que anuncia que é um link de indicação atrapalha as duas pontas.
 *
 * ## O destino
 *
 * `?d=` diz em que página a pessoa cai — a home, por padrão, ou o perfil do
 * profissional que o parceiro estava divulgando. É **um** código e **um**
 * mecanismo de atribuição para todos eles: o destino muda a chegada, nunca a
 * regra de captação. O valor passa por `resolverDestinoInterno`, que só aceita
 * caminho de uma lista fechada — endereço externo, `//outro-dominio` e
 * parâmetro não declarado viram a home, sem erro e sem redirecionar ninguém
 * para fora da Vincis.
 *
 * ## O que ela **não** faz
 *
 * Não cria lead, não atribui, não abre prazo e não calcula comissão. Também não
 * tenta descobrir quem é a pessoa: sem cadastro, o visitante é anônimo e
 * continua anônimo. Nada de IP, nada de impressão digital do aparelho — o único
 * elo é um número sorteado que o próprio navegador guarda.
 *
 * ## Por que Route Handler
 *
 * Escrever cookie exige uma resposta HTTP sob controle, e componente de
 * servidor não tem uma. Aqui a resposta é montada à mão: o `Set-Cookie` e o
 * redirecionamento saem juntos, na mesma volta.
 *
 * ## Código inválido
 *
 * Termina na mesma home que um válido, sem gravar nada. Responder diferente
 * transformaria a rota num oráculo: bastaria varrer códigos e comparar as
 * respostas para descobrir quais existem.
 *
 * `/p/` e não a raiz do site: um curinga em `/[codigo]` interceptaria todo
 * endereço desconhecido da plataforma, e qualquer página pública futura
 * passaria a disputar espaço com os códigos dos parceiros.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const { codigo } = await params

  // O mesmo identificador do navegador atravessa parceiros diferentes: é ele
  // que permite dizer, mais tarde, que foi **a mesma pessoa** que chegou por
  // João e depois por Maria.
  const doNavegador = request.cookies.get(COOKIE_INDICACAO)?.value
  const jaTinha = tokenDeVisitanteValido(doNavegador)
  const visitanteToken = jaTinha ? doNavegador : gerarTokenDeVisitante()

  const tecnicos = dadosTecnicosDoAcesso({
    userAgent: request.headers.get('user-agent'),
    referer: request.headers.get('referer'),
  })

  let registrado = false
  try {
    const resultado = await registrarAcessoPeloLink({
      codigo,
      visitanteToken,
      ...tecnicos,
    })
    registrado = resultado.registrado
  } catch (erro) {
    // Falha ao registrar não pode virar erro na cara de quem clicou: a pessoa
    // segue para a Vincis, e o problema fica no log do servidor.
    console.error('[PARCEIROS] falha ao registrar acesso', {
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
      mensagem: erro instanceof Error ? erro.message : undefined,
    })
  }

  const destino = resolverDestinoInterno(
    request.nextUrl.searchParams.get(PARAMETRO_DESTINO),
  )
  const resposta = NextResponse.redirect(new URL(destino, request.url))

  // O cookie só é escrito quando há indicação de verdade — código inexistente
  // não deixa rastro no navegador de ninguém. Reescrever quando já existia
  // renova a validade: quem volta pelo link continua sendo o mesmo navegador.
  if (registrado) {
    resposta.cookies.set({
      name: COOKIE_INDICACAO,
      value: visitanteToken,
      httpOnly: true,
      // `lax` porque a chegada é sempre navegação de topo vinda de fora —
      // Instagram, WhatsApp, e-mail. `strict` recusaria justamente esse caso,
      // que é o único que existe aqui.
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: DIAS_COOKIE_INDICACAO * 24 * 60 * 60,
    })
  }

  return resposta
}
