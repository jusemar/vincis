import { ContatoProtegido } from './ContatoProtegido'
import { LinkInterno, Lista, PaginaInstitucional, SecaoDocumento } from './PaginaInstitucional'
import { ROTAS_INSTITUCIONAIS } from '../constants/rotas'

/**
 * Termos de Uso da Vincis.
 *
 * Escritos a partir do que o sistema faz hoje: Pix pela Efí nos serviços
 * elegíveis, honorários jurídicos e contratos diretos pagos ao profissional,
 * repasse manual da parte do profissional e nenhum estorno automático. Não
 * citam razão social, CNPJ, sede, licença ou garantia que não estejam
 * confirmados — esses dados entram aqui quando o proprietário os fornecer.
 */
export function TermosDeUso() {
  return (
    <PaginaInstitucional
      titulo="Termos de Uso"
      atualizadoEm="16 de novembro de 2026"
      introducao="Estes termos explicam como a Vincis funciona e as regras para utilizá-la. Ao criar uma conta ou usar a plataforma, você concorda com eles."
    >
      <SecaoDocumento id="apresentacao" titulo="1. Apresentação da plataforma">
        <p>
          A Vincis é uma plataforma digital que conecta clientes a profissionais independentes das áreas contábil e
          jurídica. Na Vincis, o cliente pode encontrar profissionais, conhecer os serviços disponíveis, solicitar
          orçamentos, contratar serviços e acompanhar seus atendimentos.
        </p>
        <p>
          A Vincis não é um escritório de contabilidade nem de advocacia. Os profissionais cadastrados atuam de forma
          independente e não são empregados da Vincis. O papel da Vincis é facilitar a conexão e organizar o
          relacionamento entre clientes e profissionais.
        </p>
      </SecaoDocumento>

      <SecaoDocumento id="cadastro" titulo="2. Cadastro e acesso">
        <Lista>
          <li>Para contratar ou oferecer serviços, é necessário criar uma conta com informações verdadeiras, completas e atualizadas.</li>
          <li>A conta é pessoal. Você é responsável por manter sua senha em sigilo e por todas as ações realizadas com o seu acesso.</li>
          <li>A confirmação da conta pode ser exigida antes do primeiro acesso, pelo link enviado ao e-mail cadastrado ou por outro meio oferecido pela Vincis.</li>
          <li>Se perceber uso indevido da sua conta, altere sua senha e avise a Vincis pelos canais de contato.</li>
        </Lista>
      </SecaoDocumento>

      <SecaoDocumento id="profissionais" titulo="3. Profissionais e serviços">
        <p>
          Cada profissional apresenta em seu perfil a área de atuação, os serviços oferecidos e as condições de
          contratação, como valor, forma de cobrança e escopo. Essas condições são exibidas antes da contratação, para
          que o cliente decida com clareza.
        </p>
        <p>
          A execução do serviço e a responsabilidade técnica por ele cabem ao profissional contratado, que deve observar
          as normas da sua profissão, inclusive as regras do respectivo conselho profissional. A Vincis não presta os
          serviços contábeis ou jurídicos e não garante resultados de um trabalho profissional.
        </p>
        <p>
          O profissional é responsável pela veracidade das informações do seu perfil, incluindo formação e registro
          profissional, e por manter sua habilitação regular.
        </p>
      </SecaoDocumento>

      <SecaoDocumento id="contratacao-e-pagamento" titulo="4. Contratação e pagamento">
        <p>A forma de pagamento depende da modalidade apresentada antes da contratação:</p>
        <Lista>
          <li>
            <strong>Serviços pagos pela Vincis:</strong> nos serviços elegíveis, o cliente paga à Vincis por Pix,
            processado pela instituição de pagamento Efí. O valor exibido já inclui a remuneração da plataforma, e a
            parte do profissional é repassada a ele pela Vincis.
          </li>
          <li>
            <strong>Serviços pagos diretamente ao profissional:</strong> outros serviços — por exemplo, honorários
            advocatícios e contratos firmados diretamente com o profissional — são combinados e pagos diretamente a ele,
            sem intermediação financeira da Vincis.
          </li>
        </Lista>
        <p>
          Um pagamento por Pix só é considerado concluído depois de confirmado pela instituição de pagamento. Planos
          com pagamento mensal são pagos mês a mês, por um novo Pix em cada mensalidade.
        </p>
      </SecaoDocumento>

      <SecaoDocumento id="atendimentos" titulo="5. Atendimentos">
        <p>
          Depois da contratação, cliente e profissional utilizam os recursos disponíveis na plataforma — como mensagens,
          envio de documentos e acompanhamento do andamento — para conduzir e acompanhar o trabalho. Cada parte é
          responsável pelas informações e pelos documentos que compartilha.
        </p>
      </SecaoDocumento>

      <SecaoDocumento id="cancelamentos" titulo="6. Cancelamentos, divergências e reembolsos">
        <p>
          Cancelamentos, divergências sobre a execução de um serviço e pedidos de reembolso são tratados de acordo com as
          condições da contratação e com a legislação aplicável, incluindo o Código de Defesa do Consumidor quando
          cabível.
        </p>
        <p>
          Não há estorno automático. Nos serviços pagos pela Vincis, a solicitação deve ser feita pelos canais de
          contato; a Vincis analisa cada caso com as informações do cliente e do profissional e informa a decisão e,
          quando houver devolução, a forma de realizá-la. Nos serviços pagos diretamente ao profissional, a questão deve
          ser tratada com ele.
        </p>
      </SecaoDocumento>

      <SecaoDocumento id="uso-responsavel" titulo="7. Uso responsável da plataforma">
        <p>Não é permitido:</p>
        <Lista>
          <li>praticar fraude, inclusive em pagamentos, avaliações ou cadastros;</li>
          <li>usar identidade falsa, informar dados de terceiros sem autorização ou se apresentar com habilitação profissional que não possui;</li>
          <li>compartilhar, vender ou usar indevidamente contas e credenciais, próprias ou de terceiros;</li>
          <li>usar a plataforma para atividades ilegais, para enviar conteúdo ofensivo ou para prejudicar outros usuários;</li>
          <li>tentar acessar áreas, dados ou funções sem autorização, ou interferir no funcionamento da plataforma.</li>
        </Lista>
        <p>
          Em caso de descumprimento, a Vincis pode suspender ou bloquear a conta envolvida, sem prejuízo das medidas
          legais cabíveis.
        </p>
      </SecaoDocumento>

      <SecaoDocumento id="dados-pessoais" titulo="8. Dados pessoais">
        <p>
          O tratamento de dados pessoais na Vincis está descrito na{' '}
          <LinkInterno href={ROTAS_INSTITUCIONAIS.politicaDePrivacidade}>Política de Privacidade</LinkInterno>.
        </p>
      </SecaoDocumento>

      <SecaoDocumento id="alteracoes" titulo="9. Alterações destes termos">
        <p>
          Estes termos podem ser atualizados para acompanhar mudanças na plataforma ou na legislação. A data da última
          atualização fica no início desta página.
        </p>
      </SecaoDocumento>

      <SecaoDocumento id="contato" titulo="10. Contato">
        <p>Dúvidas sobre estes termos podem ser enviadas pelos canais oficiais da Vincis:</p>
        <div className="space-y-3 text-base">
          <ContatoProtegido canal="email" />
          <ContatoProtegido canal="whatsapp" />
        </div>
      </SecaoDocumento>
    </PaginaInstitucional>
  )
}
