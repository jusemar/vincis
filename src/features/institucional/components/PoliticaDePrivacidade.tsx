import { ContatoProtegido } from './ContatoProtegido'
import { LinkInterno, Lista, PaginaInstitucional, SecaoDocumento } from './PaginaInstitucional'
import { ROTAS_INSTITUCIONAIS } from '../constants/rotas'

/**
 * Política de Privacidade da Vincis.
 *
 * Descreve o que o sistema realmente coleta e usa (conferido no código em
 * 16/11/2026): cadastro, perfil profissional, atendimentos, cobranças Pix pela
 * Efí, sessões e trilha de auditoria, e os cookies que existem de fato. Não
 * afirma certificação, encarregado nomeado nem medida técnica não confirmada;
 * dados societários entram quando o proprietário os fornecer.
 */
export function PoliticaDePrivacidade() {
  return (
    <PaginaInstitucional
      titulo="Política de Privacidade"
      atualizadoEm="16 de novembro de 2026"
      introducao="Esta política explica quais dados pessoais a Vincis trata, para quê, com quem eles são compartilhados e como você pode exercer seus direitos, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD)."
    >
      <SecaoDocumento id="identificacao" titulo="1. Quem somos e como falar conosco">
        <p>
          A Vincis é uma plataforma digital, disponível em vincis.com.br, que conecta clientes a profissionais
          independentes das áreas contábil e jurídica. Para assuntos de privacidade e dados pessoais, use os canais
          oficiais:
        </p>
        <div className="space-y-3 text-base">
          <ContatoProtegido canal="email" />
          <ContatoProtegido canal="whatsapp" />
        </div>
      </SecaoDocumento>

      <SecaoDocumento id="dados-de-cadastro" titulo="2. Dados coletados no cadastro">
        <p>
          <strong>Todos os usuários:</strong> nome, e-mail, número de WhatsApp e senha. A senha não é guardada em texto:
          ela é armazenada apenas em formato protegido por função de hash. Também registramos a confirmação da conta.
        </p>
        <p>
          <strong>Profissionais:</strong> além dos dados acima, as informações do perfil profissional, como área de
          atuação, número e estado do registro profissional (por exemplo, CRC ou OAB), comprovante de registro,
          formação, experiência, especialidades, apresentação, foto, cidade, endereço e contatos profissionais. Parte
          dessas informações aparece no perfil público, para que clientes possam conhecer o profissional.
        </p>
        <p>
          <strong>Clientes:</strong> quando necessário para a contratação ou para o trabalho do profissional, dados
          como CPF ou CNPJ, telefone e informações da empresa.
        </p>
        <p>
          <strong>Parceiros do programa de indicação:</strong> os dados necessários para identificar indicações e pagar
          comissões, como CPF e dados para recebimento.
        </p>
      </SecaoDocumento>

      <SecaoDocumento id="servicos-e-atendimentos" titulo="3. Informações da prestação de serviços">
        <p>Para que a contratação e o atendimento aconteçam, a Vincis trata:</p>
        <Lista>
          <li>pedidos de orçamento, com a descrição da necessidade, e as propostas recebidas;</li>
          <li>contratações, planos, agendamentos e o andamento de cada atendimento;</li>
          <li>mensagens trocadas entre cliente e profissional na plataforma;</li>
          <li>arquivos e documentos enviados, inclusive documentos fiscais;</li>
          <li>avaliações dos atendimentos.</li>
        </Lista>
      </SecaoDocumento>

      <SecaoDocumento id="pagamentos" titulo="4. Pagamentos">
        <p>
          Nos serviços pagos pela Vincis, o pagamento é feito por Pix, processado pela instituição de pagamento Efí. A
          Vincis registra os dados da cobrança e da confirmação — valor, data, identificador da cobrança e da transação
          Pix e situação do pagamento — e consulta a Efí para confirmar cada pagamento.
        </p>
        <p>
          A Vincis não solicita nem armazena senhas bancárias ou dados de cartão. Os dados do pagador são tratados pela
          Efí e pela instituição financeira de quem paga, conforme as políticas delas.
        </p>
      </SecaoDocumento>

      <SecaoDocumento id="registros-tecnicos" titulo="5. Registros técnicos, autenticação e segurança">
        <Lista>
          <li>
            <strong>Sessões de acesso:</strong> ao entrar na conta, registramos a sessão com data, endereço IP e
            identificação do navegador.
          </li>
          <li>
            <strong>Registros de auditoria:</strong> ações importantes — como alterações de cadastro, contratações,
            pagamentos e repasses — são registradas com a data, o autor e, quando disponível, o endereço IP.
          </li>
          <li>
            <strong>Confirmação e recuperação:</strong> links de confirmação de conta e de redefinição de senha são de
            uso único e expiram.
          </li>
        </Lista>
        <p>Esses registros servem para manter a conta segura, investigar uso indevido e cumprir obrigações legais.</p>
      </SecaoDocumento>

      <SecaoDocumento id="finalidades" titulo="6. Para que usamos os dados">
        <Lista>
          <li>criar e manter sua conta e permitir o acesso com segurança;</li>
          <li>exibir os perfis profissionais e permitir a busca por profissionais;</li>
          <li>viabilizar orçamentos, contratações, agendamentos e atendimentos;</li>
          <li>processar e confirmar pagamentos e realizar os repasses aos profissionais;</li>
          <li>enviar comunicações necessárias ao serviço, como confirmação de conta e recuperação de senha;</li>
          <li>prevenir fraudes e proteger a plataforma e os usuários;</li>
          <li>cumprir obrigações legais e regulatórias e exercer direitos em processos.</li>
        </Lista>
      </SecaoDocumento>

      <SecaoDocumento id="compartilhamento" titulo="7. Com quem compartilhamos">
        <Lista>
          <li>
            <strong>Entre cliente e profissional:</strong> cada um vê as informações necessárias para a contratação e o
            atendimento — por exemplo, o profissional recebe a descrição da necessidade, os documentos enviados e os
            dados de contato do cliente que contratou.
          </li>
          <li>
            <strong>Prestadores de tecnologia:</strong> empresas que operam a infraestrutura da Vincis, como hospedagem
            e armazenamento de arquivos (Vercel), banco de dados (Neon), envio de e-mails (Resend), pagamentos por Pix
            (Efí) e consulta de endereço pelo CEP (ViaCEP, que recebe apenas o CEP). Alguns desses prestadores podem
            processar dados fora do Brasil.
          </li>
          <li>
            <strong>Autoridades:</strong> quando houver obrigação legal ou ordem de autoridade competente.
          </li>
        </Lista>
        <p>A Vincis não vende dados pessoais.</p>
      </SecaoDocumento>

      <SecaoDocumento id="armazenamento" titulo="8. Armazenamento, segurança e retenção">
        <p>
          Os dados ficam armazenados nos serviços dos prestadores de tecnologia acima. O acesso é restrito por conta e
          por perfil: cada usuário acessa apenas o que lhe diz respeito, e o tráfego entre o seu navegador e a Vincis é
          protegido por conexão segura (HTTPS). Nenhum sistema é totalmente imune a falhas; se ocorrer um incidente
          relevante, a Vincis adotará as medidas cabíveis previstas na LGPD.
        </p>
        <p>
          Os dados são mantidos enquanto a conta estiver ativa e pelo tempo necessário para cumprir as finalidades
          desta política, obrigações legais (por exemplo, fiscais) e o exercício de direitos. Depois disso, são
          eliminados ou anonimizados.
        </p>
      </SecaoDocumento>

      <SecaoDocumento id="direitos" titulo="9. Seus direitos">
        <p>Nos termos da LGPD, você pode solicitar:</p>
        <Lista>
          <li>confirmação de que tratamos seus dados e acesso a eles;</li>
          <li>correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade;</li>
          <li>portabilidade dos dados, nos termos da regulamentação;</li>
          <li>eliminação dos dados tratados com base no consentimento, ressalvadas as hipóteses legais de guarda;</li>
          <li>informação sobre com quem seus dados são compartilhados;</li>
          <li>informação sobre a possibilidade de não consentir e suas consequências, e revogação do consentimento;</li>
          <li>revisão de decisões tomadas unicamente com base em tratamento automatizado.</li>
        </Lista>
        <p>
          Para exercer esses direitos, entre em contato pelos canais indicados no item 1. Podemos pedir informações para
          confirmar sua identidade antes de atender à solicitação. Você também pode apresentar reclamação à Autoridade
          Nacional de Proteção de Dados (ANPD).
        </p>
      </SecaoDocumento>

      <SecaoDocumento id="cookies" titulo="10. Cookies e armazenamento no navegador">
        <p>A Vincis usa apenas cookies necessários ao funcionamento da plataforma:</p>
        <Lista>
          <li>
            <strong>vincis_sessao</strong> — mantém você conectado depois de entrar na conta; deixa de valer ao sair ou
            quando a sessão expira.
          </li>
          <li>
            <strong>vincis_empresa_ativa</strong> — lembra qual empresa está selecionada no painel, para quem trabalha
            com mais de uma.
          </li>
          <li>
            <strong>vincis_indicacao</strong> — guarda por até 90 dias o código de quem indicou a Vincis, quando você
            chega por um link de indicação do programa de parceiros.
          </li>
          <li>
            <strong>sidebar_state</strong> — lembra se o menu lateral do painel fica aberto ou fechado.
          </li>
        </Lista>
        <p>
          A preferência de tema (claro ou escuro) é guardada no armazenamento local do navegador. A Vincis não usa
          cookies de publicidade nem ferramentas de rastreamento de terceiros. Você pode apagar cookies nas
          configurações do navegador; sem o cookie de sessão, porém, não é possível permanecer conectado.
        </p>
      </SecaoDocumento>

      <SecaoDocumento id="atualizacoes" titulo="11. Atualizações desta política">
        <p>
          Esta política pode ser atualizada para refletir mudanças na plataforma ou na legislação. A data da última
          atualização fica no início desta página. Veja também os{' '}
          <LinkInterno href={ROTAS_INSTITUCIONAIS.termosDeUso}>Termos de Uso</LinkInterno>.
        </p>
      </SecaoDocumento>
    </PaginaInstitucional>
  )
}
