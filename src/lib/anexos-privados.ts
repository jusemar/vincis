import { put } from '@vercel/blob'

/**
 * Política única dos anexos privados da plataforma.
 *
 * Estava escrita dentro de `features/atendimentos`, e passou a ser compartilhada
 * quando a solicitação de orçamento também precisou aceitar arquivos. Duplicar
 * a lista de tipos aceitos criaria duas políticas de segurança para o mesmo
 * risco — e a segunda seria esquecida na primeira revisão.
 *
 * O que a política diz, e por quê:
 *
 * - **tipo casado com a extensão**: aceitar o `content-type` que o navegador
 *   mandar transforma o anexo numa porta de entrada;
 * - **10 MB**: o mesmo teto que o comprovante de registro profissional e o
 *   anexo de Atendimento já usavam;
 * - **armazenamento privado**: `access: 'private'` no Vercel Blob. O conteúdo
 *   não ganha URL pública e só sai por rota que confere autorização.
 */

export const TAMANHO_MAXIMO_ANEXO = 10 * 1024 * 1024

const TIPOS_ACEITOS = new Map([
  ['text/plain', ['txt']],
  ['application/pdf', ['pdf']],
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/png', ['png']],
])

export function extensaoDoArquivo(nome: string) {
  return nome.split('.').pop()?.toLowerCase() ?? ''
}

export function validarAnexoPrivado(arquivo: File) {
  const extensoes = TIPOS_ACEITOS.get(arquivo.type)
  if (!extensoes?.includes(extensaoDoArquivo(arquivo.name))) {
    throw new Error('Envie um arquivo TXT, PDF, JPG, JPEG ou PNG válido.')
  }
  if (arquivo.size <= 0 || arquivo.size > TAMANHO_MAXIMO_ANEXO) {
    throw new Error('O arquivo deve ter no máximo 10 MB.')
  }
}

export type AnexoEnviado = {
  chave: string
  nome: string
  tipoMime: string
  tamanhoBytes: number
}

/**
 * Sobe um anexo para o armazenamento privado.
 *
 * `prefixo` é o caminho lógico do dono do arquivo (`atendimentos/<id>/arquivos`
 * ou `oportunidades/<id>/arquivos`). O nome final é sorteado: o nome original
 * fica no banco, nunca na chave — assim ele não vira parte de uma URL nem
 * colide com outro arquivo homônimo.
 */
export async function enviarAnexoPrivado(
  prefixo: string,
  arquivo: File,
  nomeUnico: string,
): Promise<AnexoEnviado> {
  validarAnexoPrivado(arquivo)
  const extensao = extensaoDoArquivo(arquivo.name)
  const blob = await put(`${prefixo}/${nomeUnico}.${extensao}`, arquivo, {
    access: 'private',
    addRandomSuffix: false,
    contentType: arquivo.type,
  })
  return {
    chave: blob.pathname,
    nome: arquivo.name.slice(0, 255),
    tipoMime: arquivo.type,
    tamanhoBytes: arquivo.size,
  }
}
