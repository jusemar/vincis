import Link from "next/link";
export function RodapeHome() {
  return (
    <footer className="home-rodape">
      <div className="home-container">
        <div className="home-rodape-topo">
          <Link href="/" className="home-marca">
            vincis<span>.</span>
          </Link>
          <p>
            Contabilidade e advocacia.
            <br />
            Conexões para ir além.
          </p>
          <nav aria-label="Navegação do rodapé">
            <Link href="/profissionais">Profissionais</Link>
            <Link href="/precos">Planos e preços</Link>
            <Link href="/parceiros">Parceiros</Link>
            <Link href="/suporte">Fale com a Vincis</Link>
          </nav>
        </div>
        <div className="home-rodape-base">
          <span>
            © {new Date().getFullYear()} Vincis. Todos os direitos reservados.
          </span>
          <span>Profissionais independentes. Possibilidades conectadas.</span>
        </div>
      </div>
    </footer>
  );
}
