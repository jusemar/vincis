# Redesenho da home pública — Vincis

Implementação local em 16/10/2026. Sem deploy, migrations ou mudanças de regras de negócio.

## Auditoria anterior às alterações

- Entrada: `src/app/page.tsx`; composição anterior: `ChatDemo`, `SimpleSteps`, `Banners`, `ServicesHub`.
- Chrome compartilhado: `AppChrome`, `NavigationNext`, `Footer`.
- Navegação preservada: Início, Profissionais, Parceiros, Serviços, Como Funciona, Preços, suporte, tema, login, cadastro e menu autenticado.
- Tema anterior: bege/âmbar, dourado saturado, gradientes, sombras luminosas; dark mode por `data-theme`.
- Tipografia: Inter declarada no Tailwind, sem arquivo/carregamento localizado. Fallback de sistema existente.
- Breakpoints Tailwind: 640, 768, 1024, 1280 e 1536 px.
- Animação disponível: Framer Motion 12, CSS/Tailwind Animate; sem necessidade de adicionar GSAP/Rive.
- Design system disponível: Radix, Lucide, CVA e componentes de botões, cards, diálogos, abas e formulários.
- Assets: `src/assets/passo1.webp`, `passo2.webp`, `passo3.webp`, `profile-ricardo.jpg`; logo anterior era um V tipográfico em fundo dourado. Sem mapa/logo SVG dedicado.
- Preservados: marca, descoberta de especialistas, serviços contábeis/jurídicos, fluxo de autenticação e páginas de destino.
- Substituídos: notebook 3D com chat, passos em screenshots, banners com CTAs sem destino e métricas sem fonte, diagrama multicolorido de tamanho fixo, links vazios do rodapé da home.

## Composição final

1. Hero editorial com proposta de valor, monograma e duas ações.
2. Faixa de contexto: profissionais independentes, pessoas/empresas e decisão do cliente.
3. Rede interativa sobre mapa esquemático do Brasil, seguida de opções de especialistas.
4. Dois pilares: contabilidade e advocacia.
5. Explicação do relacionamento entre cliente, plataforma e profissionais independentes.
6. Chamada final para explorar profissionais ou conhecer o programa de parceiros.
7. Rodapé com destinos existentes.

Tipografia sans do projeto, com um acento editorial em Georgia no hero. Nenhum download de fontes, imagens ou biblioteca adicional.

## Paleta fosca

| Cor | Código | Uso |
|---|---|---|
| Azul profundo | `#203D50` | Identidade e ações |
| Petróleo acinzentado | `#476878` | Conexões e destaques |
| Grafite | `#202C35` | Texto |
| Cinza frio | `#5F707B` | Texto secundário, ajustado para contraste |
| Off-white | `#F5F6F3` | Fundo |
| Champagne | `#B5A080` | Acentos discretos |
| Fundo escuro | `#111C24` | Dark mode |
| Superfície escura | `#192832` | Cards no dark mode |

Os tokens ficam limitados a `.home-publica`, sem recolorir os painéis autenticados. A sobriedade vem de superfícies opacas, divisórias, espaço em branco e poucas cores.

## Arquivos

Todos relativos a `/home/junior/vincis2/`:

- `src/app/page.tsx`: entrada Server Component e metadados.
- `src/components/shared/AppChrome.tsx`: escopo visual e escolha do rodapé da home.
- `src/components/shared/NavigationNext.tsx`: correção da âncora Serviços fora da home e do indicador de navegação ativo.
- `src/features/home/index.ts`: exportações atuais.
- `src/features/home/components/HomePublica.tsx`: composição editorial.
- `src/features/home/components/RodapeHome.tsx`: rodapé específico.
- `src/features/home/components/rede/RedeVincis.tsx`: interação e composição da demonstração.
- `src/features/home/components/rede/MapaBrasil.tsx`: mapa SVG esquemático.
- `src/features/home/components/rede/Personagem.tsx`: personagens e ambiente de equipe.
- `src/features/home/components/rede/Conexoes.tsx`: conexões e documentos em trânsito.
- `src/features/home/components/rede/EspecialistasDemo.tsx`: opções e confirmação de escolha.
- `src/features/home/constants/demonstracao.ts`: conteúdo fictício e tempos.
- `src/features/home/hooks/useDemonstracao.ts`: relógio e preferências de movimento.
- `src/features/home/lib/fluxo-demonstracao.ts`: estados e trajetórias Bézier.
- `src/features/home/styles/home-publica.css`: estilos responsivos e temas.
- `scripts/desenvolvimento/fluxo-home.test.ts`: regressão dos estados e trajetórias.
- `scripts/desenvolvimento/testes-home-publica.mjs`: testes de navegador e capturas.

Removidos por não terem mais consumidores: `ChatDemo.tsx`, `SimpleSteps.tsx`, `Banners.tsx` e `ServicesHub.tsx` do domínio home. O rodapé compartilhado anterior continua disponível nas outras páginas.

## Sequência da demonstração

Cada cliente percorre um ciclo de 44 segundos. Os três começam em 0, 7 e 14 segundos.

| Intervalo local | Estado |
|---|---|
| 0–4 s | Digitação da necessidade |
| 4–7 s | Documento do cliente até a Vincis |
| 7–10 s | Organização da solicitação |
| 10–16 s | Três opções, sem seleção inicial |
| 16–19 s | Escolha confirmada |
| 19–23 s | Documento da Vincis ao profissional |
| 23–30 s | Profissional trabalhando |
| 30–34 s | Resultado do profissional à central |
| 34–38 s | Retorno da central ao cliente |
| 38–44 s | Conclusão |

O visitante pode pausar, reiniciar, avançar etapas, focar clientes e selecionar um especialista. Hover realça conexões; a escolha manual adianta a confirmação. Sem interação, a primeira opção é escolhida na simulação. O nome escolhido acompanha o encaminhamento.

Desktop usa SVG com nós HTML na mesma proporção. Mobile usa composição vertical própria, documentos em deslocamento e troca de atendimento. A sequência e os dados são compartilhados.

## Acessibilidade e performance

- Botões semânticos, foco visível, `aria-pressed`, controles nomeados e anúncio moderado de etapas manuais.
- Movimento reduzido: sem trajetórias/autoplay; mensagem completa e avanço manual preservam informações e estados.
- `useSyncExternalStore` mantém a preferência de movimento compatível com SSR/hidratação.
- Um relógio de 100 ms para todos os fluxos, suspenso fora da tela ou com aba oculta.
- Ilustrações SVG; sem vídeo, GIF, canvas ou chamadas a serviços de IA.
- Conteúdo editorial renderizado no servidor; estado client-side restrito à demonstração.
- Nenhuma consulta a dados de clientes/empresas ou mutação é executada pela simulação.

## Validação

- `npm run typecheck`: aprovado.
- `npm run build`: aprovado também na conferência final, com 47 páginas geradas e home estática. O sandbox exigiu execução autorizada para a comunicação interna do compilador CSS/Turbopack.
- ESLint de todos os arquivos alterados/criados: aprovado.
- `node --import tsx --test scripts/desenvolvimento/fluxo-home.test.ts`: aprovado.
- `node scripts/desenvolvimento/testes-home-publica.mjs`: cobre desktop 1440, tablet 820, mobile 390 e 320; claro/escuro; movimento reduzido; escolha/entrega/reinício; login; menu mobile; documentos no desktop/mobile, pausa, retomada, escalonamento, cabeçalho opaco após rolagem e suspensão do relógio fora da tela.
- Capturas locais: `/tmp/vincis-home/`.
- `git diff --check`: aprovado.

O lint global ainda aponta cinco erros preexistentes fora da mudança:

- `src/components/ui/sidebar.tsx:611`: `Math.random` durante render.
- `src/contexts/ThemeContext.tsx:19`: atualização de estado em efeito.
- `src/features/suporte/components/SupportPage.tsx:118`: variável não utilizada.
- `tests/oportunidade-simulacao-preco.test.ts:8`: import não utilizado.
- `tests/redefinicao-senha.test.ts:106`: variável não utilizada.

## Limitações e evolução

- Mapa e posições ilustrativos, sem precisão geográfica. Personagens vetoriais estilizados.
- Nomes, experiência, avaliações e compatibilidade são fictícios e identificados como demonstração.
- A simulação não implementa recomendação real, contratação ou entrega de documentos.
- A central representa a plataforma; escritórios e profissionais são identificados como independentes.
- Nenhuma certificação, garantia ou métrica comercial nova foi inventada.
- Futuro Rive: substituir `Personagem` por atores com estados de digitação, recebimento, trabalho e conclusão; conservar o relógio, a máquina de estados e o fallback SVG/reduced-motion.
- Não houve validação em aparelho físico ou leitores de tela; validação responsiva foi feita em Chromium headless.
