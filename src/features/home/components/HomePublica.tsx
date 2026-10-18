import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Calculator,
  Check,
  Scale,
  ShieldCheck,
  Users,
} from "lucide-react";
import { RedeVincis } from "./rede/RedeVincis";

export function HomePublica() {
  return (
    <div className="home-conteudo">
      <RedeVincis />
      <section className="home-hero home-container">
        <div className="home-hero-texto">
          <span className="home-sobretitulo">
            <span className="home-linha" /> CONTABILIDADE & ADVOCACIA,
            CONECTADAS
          </span>
          <h1>
            Seu negócio avança.
            <br />
            Com as pessoas
            <br />
            <em>certas ao lado.</em>
          </h1>
          <p>
            Encontre contadores, advogados e especialistas. Escolha com
            confiança e conecte cada necessidade a uma solução profissional.
          </p>
          <div className="home-acoes">
            <Link href="/profissionais" className="home-botao">
              Encontrar um especialista <ArrowUpRight size={18} />
            </Link>
            <a href="#demonstracao" className="home-link">
              Veja a Vincis em ação <ArrowDown size={17} />
            </a>
          </div>
          <div className="home-hero-nota">
            <ShieldCheck size={17} />
            <span>
              Profissionais independentes. Uma plataforma para conectar.
            </span>
          </div>
        </div>
        <div className="home-hero-editorial" aria-hidden="true">
          <div className="home-editorial-topo">
            <span>CONHECIMENTO QUE CONECTA.</span>
            <span>01 / V</span>
          </div>
          <div className="home-monograma">
            V<span>.</span>
          </div>
          <div className="home-editorial-base">
            <div>
              <Calculator size={22} />
              <span>Precisão contábil.</span>
            </div>
            <div>
              <Scale size={22} />
              <span>Visão jurídica.</span>
            </div>
          </div>
          <div className="home-editorial-rodape">
            Duas especialidades. Novas possibilidades.
            <ArrowUpRight size={20} />
          </div>
        </div>
      </section>
      <div className="home-faixa">
        <div className="home-container">
          <span>
            MENOS DISTÂNCIA.
            <br />
            <strong>MAIS POSSIBILIDADES.</strong>
          </span>
          <p>
            <Users size={20} /> Especialistas independentes
          </p>
          <p>
            <BriefcaseBusiness size={20} /> Para pessoas e empresas
          </p>
          <p>
            <ShieldCheck size={20} /> Você no centro das decisões
          </p>
        </div>
      </div>
      <section
        id="models"
        className="home-servicos home-container"
        aria-labelledby="titulo-servicos"
      >
        <div className="home-section-heading">
          <div>
            <span className="home-sobretitulo">
              ESPECIALIDADES QUE SE COMPLEMENTAM
            </span>
            <h2 id="titulo-servicos">
              Uma visão completa.
              <br />
              <span>Para cada próximo passo.</span>
            </h2>
          </div>
          <p>
            Da rotina da sua empresa às decisões que pedem orientação
            especializada.
          </p>
        </div>
        <div className="home-pilares">
          <article>
            <div className="home-pilar-topo">
              <Calculator size={29} />
              <span>01 — CONTABILIDADE</span>
            </div>
            <h3>
              Clareza para os números.
              <br />
              Espaço para crescer.
            </h3>
            <p>
              Conecte-se a profissionais para orientar sua rotina contábil,
              fiscal e tributária.
            </p>
            <ul>
              <li>Contabilidade e obrigações fiscais</li>
              <li>Imposto de Renda e planejamento tributário</li>
              <li>Abertura de empresas e departamento pessoal</li>
            </ul>
            <Link href="/precos">
              Conhecer planos contábeis <ArrowUpRight size={18} />
            </Link>
          </article>
          <article>
            <div className="home-pilar-topo">
              <Scale size={29} />
              <span>02 — ADVOCACIA</span>
            </div>
            <h3>
              Orientação para decidir.
              <br />
              Confiança para seguir.
            </h3>
            <p>
              Encontre especialistas para entender suas possibilidades e
              conduzir questões jurídicas.
            </p>
            <ul>
              <li>Consultoria e contratos</li>
              <li>Direito empresarial e societário</li>
              <li>Questões trabalhistas e tributárias</li>
            </ul>
            <Link href="/profissionais">
              Encontrar profissionais <ArrowUpRight size={18} />
            </Link>
          </article>
        </div>
      </section>
      <section className="home-relacao">
        <div className="home-container home-relacao-grid">
          <div>
            <span className="home-sobretitulo">
              TECNOLOGIA APROXIMA. PESSOAS RESOLVEM.
            </span>
            <h2>
              Uma rede de talentos.
              <br />
              Uma escolha sua.
            </h2>
            <p>
              A Vincis conecta você a profissionais e escritórios independentes.
              Você conhece as opções, avalia o que faz sentido e escolhe com
              quem trabalhar.
            </p>
            <Link href="/como-funciona" className="home-link">
              Conheça a jornada completa <ArrowRight size={18} />
            </Link>
          </div>
          <ol>
            {[
              {
                titulo: "Conte o que você precisa",
                texto:
                  "Comece pela sua necessidade, seja ela pontual ou recorrente.",
              },
              {
                titulo: "Encontre e escolha um profissional",
                texto:
                  "Conheça especialidades e perfis antes de dar o próximo passo.",
              },
              {
                titulo: "Siga com orientação especializada",
                texto:
                  "Combine o escopo com o profissional e acompanhe seu atendimento.",
              },
            ].map((passo, indice) => (
              <li key={passo.titulo}>
                <span>0{indice + 1}</span>
                <div>
                  <h3>{passo.titulo}</h3>
                  <p>{passo.texto}</p>
                </div>
                <Check size={16} />
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="home-fechamento home-container">
        <span className="home-sobretitulo">
          SEU PRÓXIMO PASSO COMEÇA COM UMA CONEXÃO
        </span>
        <h2>
          Vamos encontrar quem
          <br />
          pode ajudar você?
        </h2>
        <div className="home-acoes">
          <Link href="/profissionais" className="home-botao">
            Explorar profissionais <ArrowUpRight size={18} />
          </Link>
          <Link href="/parceiros" className="home-link">
            Conhecer o programa de parceiros <ArrowRight size={17} />
          </Link>
        </div>
      </section>
    </div>
  );
}
