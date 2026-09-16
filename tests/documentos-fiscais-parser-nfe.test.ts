import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PARSER_FISCAL } from '@/features/documentos-fiscais/constants/nfe'
import { interpretarNfe } from '@/features/documentos-fiscais/lib/parser-fiscal/interpretar-nfe'
import { validarXmlFiscal } from '@/features/documentos-fiscais/lib/validar-xml-fiscal'
import { DocumentoFiscalInterpretadoSchema } from '@/features/documentos-fiscais/schemas/documento-interpretado'
import type { DocumentoFiscalInterpretado } from '@/features/documentos-fiscais/schemas/documento-interpretado'

/*
  Fase 1.3 — interpretação fiscal da NF-e.

  Testes puros: sem banco, sem HTTP, sem storage. As fixtures são sintéticas
  (`tests/fixtures/documentos-fiscais`) e não contêm dado de contribuinte real.
*/

const PASTA = path.resolve(process.cwd(), 'tests/fixtures/documentos-fiscais')
const ler = (nome: string) => readFileSync(path.join(PASTA, nome), 'utf8')

const interpretado = (nome: string): DocumentoFiscalInterpretado => {
  const resultado = interpretarNfe(ler(nome))
  if (!resultado.sucesso) throw new Error(`esperava sucesso em ${nome}, veio ${resultado.codigo}`)
  return resultado.documento
}

const recusa = (xml: string) => {
  const resultado = interpretarNfe(xml)
  if (resultado.sucesso) throw new Error('esperava recusa')
  return resultado
}

const tributo = (tributos: DocumentoFiscalInterpretado['tributos'], codigo: string) =>
  tributos.find((linha) => linha.tributo === codigo)

describe('nfeProc completo, namespace padrão', () => {
  const documento = interpretado('nfe-proc-completa.xml')

  it('origem, identificação e versão do leiaute', () => {
    expect(documento.origem).toEqual({
      raiz: 'nfeProc',
      namespace: 'http://www.portalfiscal.inf.br/nfe',
      versaoLeiaute: '4.00',
      tipo: 'nfe',
      parser: { provedor: PARSER_FISCAL.provedor, versao: PARSER_FISCAL.versao },
    })
    expect(documento.identificacao).toMatchObject({
      chaveAcesso: '35260912345678000195550010000000011000000017',
      modelo: '55',
      serie: '1',
      numero: '1',
      // Entidade predefinida decodificada e acento preservado.
      naturezaOperacao: 'Venda de mercadoria & serviço',
      emitidoEm: '2026-09-15T10:20:30-03:00',
      dataEmissao: '2026-09-15',
      codigoTipoOperacao: '1',
      tipoOperacao: 'saida',
      codigoFinalidade: '1',
      finalidade: 'normal',
      codigoAmbiente: '1',
      ambiente: 'producao',
    })
    // O que ainda não tem campo próprio continua disponível.
    expect(documento.identificacao.dadosEspecificos).toMatchObject({ cUF: '35', cMunFG: '3550308', indPres: '9' })
  })

  it('emitente e destinatário com endereço, inscrições e o que sobrou do grupo', () => {
    expect(documento.emitente).toMatchObject({
      papel: 'emitente',
      tipoIdentificacao: 'cnpj',
      identificacao: '12345678000195',
      nome: 'Comércio Sintético & Cia Ltda',
      nomeFantasia: 'Sintético',
      inscricaoEstadual: '111111111111',
      inscricaoMunicipal: '98765',
      regimeTributario: '3',
      logradouro: 'Rua das Provas',
      numero: '100',
      complemento: 'Sala 2',
      bairro: 'Centro',
      codigoMunicipio: '3550308',
      municipio: 'São Paulo',
      uf: 'SP',
      cep: '01001000',
      codigoPais: '1058',
      pais: 'BRASIL',
      telefone: '1140028922',
      dadosEspecificos: { IEST: '222222222222' },
    })
    expect(documento.destinatario).toMatchObject({
      papel: 'destinatario',
      tipoIdentificacao: 'cnpj',
      identificacao: '98765432000198',
      nome: 'Distribuidora Fictícia S.A.',
      uf: 'RJ',
      email: 'contato@exemplo.invalid',
      dadosEspecificos: { indIEDest: '1' },
    })
  })

  it('itens: todos os det, com valores monetários preservados como texto', () => {
    expect(documento.itens).toHaveLength(2)
    const [primeiro, segundo] = documento.itens
    expect(primeiro).toMatchObject({
      numeroItem: 1,
      codigoProduto: 'PROD-001',
      descricao: 'Café torrado 500g',
      gtin: '7891234567895',
      ncm: '09012100',
      cest: '1700100',
      cfop: '5102',
      unidade: 'CX',
      quantidade: '10.0000',
      valorUnitario: '25.5000000000',
      valorBruto: '255.00',
      valorDesconto: '5.00',
      valorFrete: '10.00',
      valorSeguro: '2.00',
      valorOutrasDespesas: '1.00',
      gtinTributavel: '7891234567895',
      unidadeTributavel: 'CX',
      quantidadeTributavel: '10.0000',
      valorUnitarioTributavel: '25.5000000000',
      indicadorComposicaoTotal: true,
      dadosEspecificos: { xPed: 'PEDIDO-9', infAdProd: 'Lote de teste' },
    })
    expect(segundo).toMatchObject({ numeroItem: 2, gtin: 'SEM GTIN', indicadorComposicaoTotal: false, cest: null })
    // Nenhum valor vira `number`: sem arredondamento silencioso.
    for (const item of documento.itens) {
      for (const valor of [item.quantidade, item.valorUnitario, item.valorBruto]) {
        expect(valor === null || typeof valor === 'string').toBe(true)
      }
    }
  })

  it('tributos do item vêm por linha, sem cálculo', () => {
    const doItem = documento.itens[0].tributos
    expect(tributo(doItem, 'icms')).toMatchObject({
      grupo: 'ICMS00',
      codigoSituacao: '00',
      baseCalculo: '263.00',
      aliquotaPercentual: '18.0000',
      valor: '47.34',
      retido: false,
      dadosEspecificos: { orig: '0', modBC: '3' },
    })
    expect(tributo(doItem, 'fcp')).toMatchObject({ aliquotaPercentual: '2.0000', valor: '5.26' })
    // O `cEnq` fica ao lado do subgrupo `IPITrib` e não se perde.
    expect(tributo(doItem, 'ipi')).toMatchObject({
      grupo: 'IPITrib',
      codigoSituacao: '50',
      aliquotaPercentual: '5.0000',
      valor: '12.75',
      dadosEspecificos: { cEnq: '999' },
    })
    expect(tributo(doItem, 'pis')).toMatchObject({ codigoSituacao: '01', valor: '4.21' })
    expect(tributo(doItem, 'cofins')).toMatchObject({ codigoSituacao: '01', valor: '19.38' })

    // Simples Nacional: CSOSN entra no mesmo campo de situação.
    expect(tributo(documento.itens[1].tributos, 'icms')).toMatchObject({ grupo: 'ICMSSN102', codigoSituacao: '102' })
  })

  it('totais nomeados, grupos preservados inteiros e tributos do documento', () => {
    expect(documento.totais).toMatchObject({
      valorTotal: '376.01',
      valorProdutos: '355.00',
      valorFrete: '10.00',
      valorSeguro: '2.00',
      valorDesconto: '5.00',
      valorOutrasDespesas: '1.00',
      valorServicos: null,
    })
    // `ICMSTot` é um grupo entre outros, não o modelo dos totais.
    expect(documento.totais.grupos.map((grupo) => grupo.nome)).toEqual(['ICMSTot', 'retTrib'])
    expect(documento.totais.grupos[0].campos).toMatchObject({ vICMSDeson: '0.00', vIPI: '12.75', vNF: '376.01' })

    expect(tributo(documento.tributos, 'icms')).toMatchObject({ baseCalculo: '263.00', valor: '47.34' })
    expect(tributo(documento.tributos, 'ipi')).toMatchObject({ valor: '12.75' })
    expect(tributo(documento.tributos, 'csll')).toMatchObject({ valor: '3.00', retido: true })
    expect(tributo(documento.tributos, 'irrf')).toMatchObject({ baseCalculo: '255.00', valor: '4.00', retido: true })
  })

  it('protocolo é lido como registro do arquivo, sem afirmar situação', () => {
    expect(documento.protocolo).toEqual({
      numero: '135260000000001',
      chaveAcesso: '35260912345678000195550010000000011000000017',
      recebidoEm: '2026-09-15T10:25:00-03:00',
      digestValue: 'abcDEF123456789=',
      codigoStatus: '100',
      motivo: 'Autorizado o uso da NF-e',
      ambiente: 'producao',
      versaoAplicacao: 'SP_TESTE_1',
    })
    // O parser não conclui situação fiscal a partir do protocolo.
    expect(JSON.stringify(documento)).not.toContain('autorizada')
  })
})

describe('NFe sem protocolo, destinatário pessoa física', () => {
  const documento = interpretado('nfe-sem-proc-cpf.xml')

  it('raiz NFe, CPF, ambiente de homologação e opcionais ausentes viram null', () => {
    expect(documento.origem.raiz).toBe('NFe')
    expect(documento.protocolo).toBeNull()
    expect(documento.identificacao.ambiente).toBe('homologacao')
    expect(documento.destinatario).toMatchObject({ tipoIdentificacao: 'cpf', identificacao: '12345678909', email: null })
    expect(documento.emitente.nomeFantasia).toBeNull()
    expect(documento.itens[0]).toMatchObject({ cest: null, valorFrete: null, gtin: null, valorUnitario: '12.3456789000' })
  })

  it('grupo tributário ainda sem mapa é preservado, não descartado', () => {
    const doItem = documento.itens[0].tributos
    // ICMS60 traz só o ST retido: a linha do ICMS fica com o CST, a do ST com os valores.
    expect(tributo(doItem, 'icms')).toMatchObject({ grupo: 'ICMS60', codigoSituacao: '60', baseCalculo: null })
    expect(tributo(doItem, 'icms_st')).toMatchObject({ baseCalculo: '37.04', valor: '6.67' })
    expect(tributo(doItem, 'ibscbs')).toMatchObject({
      codigoSituacao: '000',
      classificacaoTributaria: '000001',
      dadosEspecificos: { 'gIBSCBS.vBC': '37.04', 'gIBSCBS.gIBSUF.vIBSUF': '0.04' },
    })
  })
})

describe('namespace com prefixo diferente', () => {
  const documento = interpretado('nfe-proc-prefixo.xml')

  it('o prefixo não importa: o que identifica é a URI do namespace', () => {
    expect(documento.origem).toMatchObject({ raiz: 'nfeProc', namespace: 'http://www.portalfiscal.inf.br/nfe' })
    expect(documento.identificacao).toMatchObject({ tipoOperacao: 'entrada', finalidade: 'devolucao', serie: '2' })
    expect(documento.protocolo?.numero).toBe('135260000000003')
  })

  it('elemento homônimo de outro namespace não vira item nem assinatura vira dado fiscal', () => {
    expect(documento.itens).toHaveLength(1)
    expect(documento.itens[0].codigoProduto).toBe('PROD-004')
    expect(JSON.stringify(documento)).not.toContain('Ruído')
    expect(JSON.stringify(documento)).not.toContain('ZmFrZQ==')
  })

  it('CNPJ alfanumérico é lido como está, sem regra de "14 dígitos"', () => {
    expect(documento.emitente.identificacao).toBe('12ABC34501DE35')
    expect(documento.emitente.inscricaoEstadual).toBe('ISENTO')
  })
})

describe('erros controlados', () => {
  it('XML seguro que não é NF-e', () => {
    expect(recusa(ler('nao-e-nfe.xml')).codigo).toBe('DOCUMENTO_NAO_RECONHECIDO')
    expect(recusa('<foo/>').codigo).toBe('DOCUMENTO_NAO_RECONHECIDO')
    // Raiz com nome de NF-e, mas em outro namespace.
    expect(recusa('<nfeProc xmlns="urn:outro"/>').codigo).toBe('DOCUMENTO_NAO_RECONHECIDO')
  })

  it('versão de leiaute não suportada não é lida como se fosse outra', () => {
    const erro = recusa(ler('nfe-versao-nao-suportada.xml'))
    expect(erro).toMatchObject({ codigo: 'LAYOUT_NAO_SUPORTADO', caminho: 'infNFe@versao', versaoEncontrada: '3.10' })
  })

  it('estrutura essencial ausente aponta o caminho, não o conteúdo', () => {
    expect(recusa(ler('nfe-sem-ide.xml'))).toMatchObject({ codigo: 'ESTRUTURA_ESSENCIAL_AUSENTE', caminho: 'infNFe/ide' })
    expect(recusa('<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"/>')).toMatchObject({
      codigo: 'ESTRUTURA_ESSENCIAL_AUSENTE',
      caminho: 'nfeProc/NFe',
    })
    expect(recusa(ler('nfe-proc-completa.xml').replace(/ versao="4.00">\n *<ide>/, '>\n<ide>')).codigo).toBe(
      'ESTRUTURA_ESSENCIAL_AUSENTE',
    )
  })

  it('inconsistência estrutural: chave malformada ou protocolo de outra nota', () => {
    const completo = ler('nfe-proc-completa.xml')
    expect(recusa(completo.replace('Id="NFe35260912345678000195550010000000011000000017"', 'Id="NFe123"'))).toMatchObject({
      codigo: 'ESTRUTURA_INCONSISTENTE',
      caminho: 'infNFe@Id',
    })
    expect(
      recusa(completo.replace('<chNFe>35260912345678000195550010000000011000000017</chNFe>', '<chNFe>35260912345678000195550010000000099000000099</chNFe>')),
    ).toMatchObject({ codigo: 'ESTRUTURA_INCONSISTENTE', caminho: 'protNFe/infProt/chNFe' })
  })

  it('XML ilegível e valor fora do contrato', () => {
    expect(recusa('<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe>').codigo).toBe('XML_ILEGIVEL')
    const invalido = ler('nfe-proc-completa.xml').replace('<vProd>255.00</vProd>', '<vProd>duzentos</vProd>')
    expect(recusa(invalido)).toMatchObject({ codigo: 'CONTRATO_INVALIDO', caminho: 'itens/0/valorBruto' })
  })

  it('nenhum erro carrega conteúdo do XML', () => {
    const casos = [
      ler('nao-e-nfe.xml'),
      ler('nfe-versao-nao-suportada.xml'),
      ler('nfe-sem-ide.xml'),
      ler('nfe-proc-completa.xml').replace('<vProd>255.00</vProd>', '<vProd>duzentos</vProd>'),
      '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe>',
    ]
    for (const xml of casos) {
      const erro = recusa(xml)
      const serializado = JSON.stringify(erro)
      for (const proibido of ['<', 'CNPJ', '12345678000195', 'Comércio', 'Café']) {
        expect(serializado).not.toContain(proibido)
      }
    }
  })
})

describe('contrato e imutabilidade', () => {
  it('o resultado obedece ao contrato tipado e não vaza a árvore da biblioteca', () => {
    const documento = interpretado('nfe-proc-completa.xml')
    expect(DocumentoFiscalInterpretadoSchema.safeParse(documento).success).toBe(true)
    // Nada de DOM: o objeto é serializável e estável.
    expect(JSON.parse(JSON.stringify(documento))).toEqual(documento)
    const serializado = JSON.stringify(documento)
    for (const vestigio of ['nodeType', 'ownerDocument', 'localName', 'namespaceURI', 'childNodes']) {
      expect(serializado).not.toContain(vestigio)
    }
  })

  it('interpretar não altera o XML recebido', () => {
    for (const nome of ['nfe-proc-completa.xml', 'nfe-sem-proc-cpf.xml', 'nfe-proc-prefixo.xml']) {
      const xml = ler(nome)
      const antes = createHash('sha256').update(xml).digest('hex')
      interpretarNfe(xml)
      expect(createHash('sha256').update(xml).digest('hex')).toBe(antes)
      expect(xml).toBe(ler(nome))
    }
  })

  it('interpretar duas vezes dá exatamente o mesmo documento', () => {
    const xml = ler('nfe-proc-completa.xml')
    expect(interpretarNfe(xml)).toEqual(interpretarNfe(xml))
  })
})

describe('fronteira com a barreira de segurança da Fase 1.2', () => {
  const bytes = (texto: string) => new TextEncoder().encode(texto)

  it('as fixtures de NF-e passam pela barreira antes de chegar ao parser', () => {
    for (const nome of ['nfe-proc-completa.xml', 'nfe-sem-proc-cpf.xml', 'nfe-proc-prefixo.xml']) {
      expect(validarXmlFiscal({ nome, tipoMime: 'application/xml', bytes: bytes(ler(nome)) }), nome).toMatchObject({
        valido: true,
      })
    }
  })

  it('a barreira continua barrando DTD e entidade, e o parser também não as resolve', () => {
    const xxe = '<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">&xxe;</nfeProc>'
    expect(validarXmlFiscal({ nome: 'x.xml', tipoMime: 'application/xml', bytes: bytes(xxe) })).toMatchObject({
      valido: false,
      codigo: 'XML_INSEGURO',
    })
    // Mesmo se algo escapasse da barreira, aqui nada é expandido.
    const erro = recusa(xxe)
    expect(erro.codigo).toBe('XML_ILEGIVEL')
    expect(JSON.stringify(erro)).not.toContain('root:')
  })

  it('a barreira aceita a raiz e o parser confirma o mesmo documento', () => {
    const naoNfe = ler('nao-e-nfe.xml')
    // A barreira já recusa raiz que não é NF-e; a interpretação recusa de novo,
    // por conta própria — as duas camadas não dependem uma da outra.
    expect(validarXmlFiscal({ nome: 'e.xml', tipoMime: 'application/xml', bytes: bytes(naoNfe) })).toMatchObject({
      valido: false,
      codigo: 'XML_NAO_SUPORTADO',
    })
    expect(recusa(naoNfe).codigo).toBe('DOCUMENTO_NAO_RECONHECIDO')
  })
})
