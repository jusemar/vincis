import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Footer from '@/components/shared/Footer'
import { ROTAS_RESERVADAS_VINCIS } from '@/features/cms/integracao/rotas-reservadas'
import { PaginaContato } from '@/features/institucional/components/PaginaContato'
import { PoliticaDePrivacidade } from '@/features/institucional/components/PoliticaDePrivacidade'
import { TermosDeUso } from '@/features/institucional/components/TermosDeUso'
import {
  linkEmailVincis,
  linkWhatsappVincis,
  montarEmailVincis,
  montarWhatsappVincisExibicao,
} from '@/features/institucional/constants/contatos'
import { GRUPOS_RODAPE } from '@/features/institucional/constants/rotas'
import { lerAbrirOrcamento, lerAreaBusca, profissaoDaArea } from '@/features/profissionais/constants/busca-url'

/**
 * Rodapé e páginas institucionais.
 *
 * Roda em Node, sem DOM: o HTML gerado aqui é o mesmo que o servidor entrega
 * antes da hidratação — exatamente o que um robô simples lê.
 */

const raiz = process.cwd()
const htmlDoServidor = (componente: () => React.ReactElement) => renderToStaticMarkup(createElement(componente))

describe('contatos oficiais', () => {
  it('montados no navegador dão o e-mail e o WhatsApp corretos', () => {
    expect(montarEmailVincis()).toBe('contato@vincis.com.br')
    expect(linkEmailVincis()).toBe('mailto:contato@vincis.com.br')
    expect(montarWhatsappVincisExibicao()).toBe('(31) 99252-5777')
    expect(linkWhatsappVincis()).toBe('https://wa.me/5531992525777')
  })

  it('nenhum arquivo enviado ao navegador traz o e-mail montado ou link de contato pronto', () => {
    const arquivos = [
      'src/components/shared/Footer.tsx',
      'src/features/institucional/constants/contatos.ts',
      'src/features/institucional/components/ContatoProtegido.tsx',
      'src/features/institucional/components/PaginaContato.tsx',
      'src/features/institucional/components/TermosDeUso.tsx',
      'src/features/institucional/components/PoliticaDePrivacidade.tsx',
    ]
    for (const arquivo of arquivos) {
      const codigo = readFileSync(path.join(raiz, arquivo), 'utf8')
      expect(codigo, arquivo).not.toMatch(/contato@vincis\.com\.br/)
      expect(codigo, arquivo).not.toMatch(/mailto:[a-z]/)
      expect(codigo, arquivo).not.toMatch(/wa\.me\/\d/)
      expect(codigo, arquivo).not.toMatch(/99252-?5777/)
    }
  })

  it('o HTML do servidor não expõe e-mail, telefone, mailto nem wa.me', () => {
    for (const componente of [Footer, PaginaContato, TermosDeUso, PoliticaDePrivacidade]) {
      const html = htmlDoServidor(componente)
      expect(html).not.toContain('contato@vincis.com.br')
      expect(html).not.toContain('mailto:')
      expect(html).not.toContain('wa.me')
      expect(html).not.toContain('99252')
      // Botões nativos: teclado e leitor de tela funcionam sem nada a mais.
      expect(html).toContain('<button type="button"')
    }
  })
})

describe('rodapé', () => {
  it('tem os quatro grupos pedidos, na ordem', () => {
    expect(GRUPOS_RODAPE.map((g) => [g.titulo, g.links.map((l) => l.texto)])).toEqual([
      ['Serviços', ['Contabilidade', 'Assistência Jurídica', 'Serviços Avulsos']],
      ['Empresa', ['Sobre Nós', 'Contato']],
      ['Plataforma', ['Profissionais', 'Planos e Preços', 'Parceiros']],
      ['Suporte', ['Central de Ajuda', 'Termos de Uso', 'Política de Privacidade']],
    ])
  })

  it('todo link leva a uma rota real (página do código ou a "Sobre Nós" do CMS)', () => {
    for (const { links } of GRUPOS_RODAPE) {
      for (const { href } of links) {
        expect(href.startsWith('/')).toBe(true)
        const segmento = href.slice(1).split(/[/?#]/)[0]
        const existe = segmento === 'sobre-nos' || existsSync(path.join(raiz, 'src/app', segmento, 'page.tsx'))
        expect(existe, href).toBe(true)
      }
    }
  })

  it('saíram contatos fictícios, redes sociais, selo sem verificação e links "#"', () => {
    const html = htmlDoServidor(Footer)
    for (const proibido of ['4004', 'São Paulo, SP', 'LinkedIn', 'Instagram', 'Twitter', 'Facebook', 'LGPD Compliant', 'href="#"']) {
      expect(html, proibido).not.toContain(proibido)
    }
    expect(html).toContain('href="/termos-de-uso"')
    expect(html).toContain('href="/politica-de-privacidade"')
    expect(html).toContain('href="/contato"')
  })

  it('as rotas novas estão reservadas contra páginas do CMS; "sobre-nos" continua livre para o CMS', () => {
    for (const rota of ['contato', 'termos-de-uso', 'politica-de-privacidade']) {
      expect(ROTAS_RESERVADAS_VINCIS).toContain(rota)
    }
    expect(ROTAS_RESERVADAS_VINCIS).not.toContain('sobre-nos')
  })
})

describe('busca filtrada pela URL', () => {
  it('aceita só as áreas conhecidas e o pedido de orçamento', () => {
    expect(lerAreaBusca('contabilidade')).toBe('contabilidade')
    expect(lerAreaBusca('advocacia')).toBe('advocacia')
    expect(lerAreaBusca(['advocacia', 'x'])).toBe('advocacia')
    expect(lerAreaBusca('qualquer')).toBeUndefined()
    expect(lerAreaBusca(undefined)).toBeUndefined()
    expect(profissaoDaArea('contabilidade')).toBe('contador')
    expect(profissaoDaArea('advocacia')).toBe('advogado')
    expect(lerAbrirOrcamento('1')).toBe(true)
    expect(lerAbrirOrcamento('sim')).toBe(false)
  })
})

describe('textos institucionais', () => {
  it('não inventam dados societários, certificações nem prazos', () => {
    for (const componente of [PaginaContato, TermosDeUso, PoliticaDePrivacidade]) {
      const html = htmlDoServidor(componente)
      for (const proibido of ['CNPJ:', 'Razão social', 'ISO 27001', 'certificad', 'Encarregado:', 'horário de atendimento', 'em até 7 dias']) {
        expect(html, proibido).not.toContain(proibido)
      }
    }
  })

  it('Contato tem o título e a abertura pedidos', () => {
    const html = htmlDoServidor(PaginaContato)
    expect(html).toContain('Fale com a Vincis')
    expect(html).toContain(
      'Precisa de ajuda com seu cadastro, contratação, pagamento ou atendimento? Entre em contato com a Vincis pelos canais abaixo.',
    )
  })
})
