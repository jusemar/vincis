/** O resultado de cancelar ou remarcar, do jeito que a tela precisa ler. */
export type ResultadoDoCiclo =
  | {
      situacao: 'cancelada'
      protocolo: string | null
      /** Já formatado no fuso da consultoria, para a confirmação na tela. */
      quando: string
    }
  | {
      situacao: 'remarcada'
      protocolo: string | null
      /** O horário que valia antes — a tela mostra "de … para …". */
      antes: string
      depois: string
    }
  | {
      situacao: 'concluida'
      protocolo: string | null
      /** Quando foi concluída, no fuso da consultoria. */
      quando: string
    }
  | { situacao: 'ja_concluida'; mensagem: string }
  | { situacao: 'sem_acesso'; mensagem: string }
  | { situacao: 'precisa_entrar'; mensagem: string }
  | { situacao: 'fora_do_prazo'; mensagem: string }
  | { situacao: 'ja_cancelada'; mensagem: string }
  | { situacao: 'dados_invalidos'; mensagem: string }
  | { situacao: 'horario_indisponivel'; mensagem: string }
