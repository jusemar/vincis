import postgres from 'postgres'
import { aplicarMigrations } from './aplicar-migrations'
import { derrubarPostgres, subirPostgres } from './postgres-descartavel'

/**
 * Cobrança Pix apaga junto com a conta — **só no banco descartável**.
 *
 * Em produção `cobrancas_pix` aponta para `usuarios` sem cascata, de propósito:
 * dinheiro recebido não some porque uma conta saiu. A suíte, porém, desmonta
 * contas de teste em dezenas de arquivos, cada um com a própria ordem de
 * limpeza escrita antes de existir cobrança. Em vez de ensinar a cobrança a
 * cada um deles, o banco descartável troca estas três FKs por cascata/nulo.
 * Nenhuma regra de aplicação depende delas.
 */
async function afrouxarFksDeCobrancaParaLimpeza(url: string) {
  const sql = postgres(url, { max: 1 })
  try {
    await sql.unsafe(`
      alter table cobrancas_pix drop constraint cobrancas_pix_cliente_fk;
      alter table cobrancas_pix add constraint cobrancas_pix_cliente_fk
        foreign key (cliente_usuario_id) references usuarios(id) on delete cascade;
      alter table cobrancas_pix drop constraint cobrancas_pix_prestador_fk;
      alter table cobrancas_pix add constraint cobrancas_pix_prestador_fk
        foreign key (prestador_id) references usuarios(id) on delete cascade;
      alter table contratacoes_servico drop constraint contratacoes_servico_cobranca_id_cobrancas_pix_id_fk;
      alter table contratacoes_servico add constraint contratacoes_servico_cobranca_id_cobrancas_pix_id_fk
        foreign key (cobranca_id) references cobrancas_pix(id) on delete set null;
    `)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

/**
 * Comissão da Vincis nos serviços avulsos — **só no banco descartável**.
 *
 * Em produção não há padrão: sem configuração da Gestão a cobrança de serviço
 * avulso é recusada. A suíte inteira contrata serviços pagos, então o banco de
 * testes nasce com a plataforma "configurada" (15%). Os testes da comissão
 * apagam e restauram esta linha para cobrir o caso pendente.
 */
export const COMISSAO_DE_TESTE_MILESIMOS = 150

async function configurarComissaoDeTeste(url: string) {
  const sql = postgres(url, { max: 1 })
  try {
    await sql`
      insert into configuracoes_plataforma (chave, valor)
      values ('servicos_avulsos.comissao_vincis_milesimos', ${String(COMISSAO_DE_TESTE_MILESIMOS)})
      on conflict (chave) do update set valor = excluded.valor
    `
  } finally {
    await sql.end({ timeout: 5 })
  }
}

/**
 * `globalSetup` do Vitest: sobe o banco descartável e aplica as migrations uma
 * única vez para toda a suíte.
 */
export async function setup() {
  const url = await subirPostgres()
  await aplicarMigrations(url)
  await afrouxarFksDeCobrancaParaLimpeza(url)
  await configurarComissaoDeTeste(url)
}

export async function teardown() {
  await derrubarPostgres()
}
