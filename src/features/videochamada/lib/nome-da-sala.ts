import { randomBytes } from 'node:crypto'

/**
 * O nome da sala Daily — opaco, sorteado, sem nada de ninguém dentro.
 *
 * ## Por que não o protocolo
 *
 * Porque `#2026-0029` é adivinhável por construção: quem tem um protocolo sabe
 * como são os vizinhos. Nome de pessoa, e-mail e CPF são piores ainda — além de
 * adivinháveis, vazam quem está na consulta para qualquer um que veja a URL.
 * A sala é privada e só entra quem tem token, mas um nome previsível transforma
 * "descobrir a sala" num exercício de contagem, e o nome da sala não deveria
 * ser um dado sobre as pessoas.
 *
 * ## O formato
 *
 * A Daily aceita apenas `[A-Za-z0-9_-]`, no máximo 128 caracteres. `base64url`
 * usa exatamente esse alfabeto, então 24 bytes viram 32 caracteres sem
 * transformação nenhuma — e 192 bits sorteados por `randomBytes` não se
 * adivinham nem se colidem na prática.
 *
 * O prefixo `vincis-c-` não é segurança: é para quem abre o painel da Daily
 * saber de onde a sala veio, e para a limpeza de teste conseguir se reconhecer.
 */

const PREFIXO = 'vincis-c-'
const BYTES_DE_ENTROPIA = 24

/** O que a Daily aceita como nome de sala. */
export const NOME_DE_SALA_VALIDO = /^[A-Za-z0-9_-]{1,128}$/

export function gerarNomeDeSala(): string {
  return `${PREFIXO}${randomBytes(BYTES_DE_ENTROPIA).toString('base64url')}`
}

/** Reconhece uma sala criada por esta plataforma. Usado pela limpeza de demo. */
export function ehSalaDaVincis(nome: string): boolean {
  return nome.startsWith(PREFIXO)
}
