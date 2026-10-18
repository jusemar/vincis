# Demonstração viva da Vincis

Implementação local de 16/10/2026. Substitui somente a demonstração anterior e move sua chamada para antes do hero de `src/features/home/components/HomePublica.tsx`. Não modifica rotas, autenticação, banco, navegação ou demais seções da home.

## Organização

- `components/rede/RedeVincis.tsx`: composição desktop e narrativa mobile, foco e escolhas limitadas a três registros.
- `TimelineDemo.tsx`: seis botões acessíveis com `aria-current="step"`.
- `EspecialistasDemo.tsx`: três opções independentes, seleção champagne e confirmação.
- `Personagem.tsx`: contrato dos atores visuais, candidato à substituição por Rive.
- `CentralVincis.tsx`: central e robô como assets separados.
- `MapaBrasil.tsx`: relevo independente em SVG; mapa ilustrativo, não cartografia oficial.
- `Conexoes.tsx`: curvas e documentos percorrendo a mesma Bézier.
- `constants/demonstracao.ts`: dados fictícios e duração das etapas.
- `lib/fluxo-demonstracao.ts`: cálculo dos estados, digitação e trajetos.
- `hooks/useDemonstracao.ts`: relógio existente, pausa por visibilidade, aba e preferência de movimento.
- `styles/demonstracao-viva.css`: estilos restritos à nova seção.

## Sequência

Cada cliente tem um ciclo de 44 segundos. Inícios defasados em 10 segundos.

| Tempo local | Estado |
| --- | --- |
| 0–4 s | Necessidade digitada |
| 4–7 s | Documento do cliente até a Vincis |
| 7–13 s | Especialistas apresentados sem seleção |
| 13–18 s | Escolha; confirmação automática após 1,8 s ou escolha manual |
| 18–22,5 s | Rede nacional e parceiros independentes |
| 22,5–26 s | Documento da Vincis ao profissional escolhido |
| 26–32 s | Trabalho do profissional e organização pelo assistente |
| 32–35,5 s | Resultado do profissional à Vincis |
| 35,5–39 s | Resultado da Vincis ao cliente |
| 39–44 s | Confirmação integrada ao balão do cliente |

A escolha manual altera o ator e a identificação do parceiro receptor. A navegação pelas etapas pausa o relógio; continuar retoma do mesmo instante. Reiniciar limpa as escolhas. Movimento reduzido desativa reprodução automática e trajetórias; a última etapa mostra o resultado recebido. Os dois painéis secundários são omitidos no tablet para preservar legibilidade. No mobile, a sequência vertical compartilha o mesmo relógio e seleção do desktop.

## Assets e prompts

Ferramenta utilizada: `image_gen` integrada, sem API/CLI externo. Arquivos finais em `public/images/rede-vincis/`, WebP com transparência. Os PNG originais permanecem no diretório de imagens geradas; a aplicação depende somente dos WebP versionáveis do projeto.

Direção comum: miniaturas 3D profissionais, luz difusa quente, materiais suaves, marfim, verde esmeralda e champagne, objetos inteiros isolados em fundo transparente; seguir a referência enviada, sem clipart nem emojis.

Prompts por asset (briefs utilizados):

- `cliente.webp`: jovem adulto brasileiro, cabelo castanho, suéter verde, sentado digitando em notebook sobre mesa marfim e pequena base; vista três quartos para a direita.
- `cliente2.webp`: mulher adulta brasileira, cabelo castanho até os ombros, blusa mostarda, mesa marfim e notebook, voltada para a direita.
- `cliente3.webp`: editar somente suéter verde e borda da base do primeiro cliente para azul, preservando pele, rosto, pose, luz e demais objetos.
- `profissional.webp`: profissional brasileiro adulto com óculos e terno escuro, mesa marfim, trabalhando no notebook, voltado para a esquerda.
- `escritorio.webp`: escritório contábil em diorama aberto, três adultos trabalhando, computadores, divisória de vidro e planta; equipe independente.
- `central.webp`: central de vidro esmeralda com base circular marfim e metal champagne, texto Vincis e monograma V; edição posterior removeu o robô para permitir uma camada independente.
- `robo.webp`: pequeno robô branco e verde, olhos ciano no visor preto, segurando documento azul, corpo inteiro isolado, olhando à esquerda.
- `mapa.webp`: mapa brasileiro em relevo verde com limites estaduais claros e laterais marfim, vista superior levemente isométrica, contorno orgânico, sem rótulos ou outros elementos.

## Diferenças e limites

Os assets recriam a linguagem da referência, mas não reproduzem os mesmos rostos, escritório ou iluminação pixel a pixel. O mapa gerado é ilustrativo. Personagens têm movimento discreto do ator e indicação de digitação, sem rig de mãos, braços ou expressões. O robô possui camada e movimento próprios. Rive pode substituir esses atores sem mudar relógio, estados, conexões ou decisões. A cena não executa contratação real, recomendação por IA nem tráfego de documentos reais.

## Validação

- `npm run build` (Turbopack precisa executar fora do sandbox para criar seu subprocesso local).
- `npm run typecheck`.
- ESLint dos componentes, constantes, lib e scripts alterados.
- `node --import tsx scripts/desenvolvimento/fluxo-home.test.ts` — quatro testes determinísticos.
- `node scripts/desenvolvimento/testes-home-publica.mjs` — Chromium local em localhost:5173; 1440, 820, 390 e 320 px; seis etapas, seleção, conclusão, reinício, reduced motion, tema, login, deslocamento de documentos, pausa, escalonamento, loop, suspensão fora da tela e console.
- Capturas em `/tmp/vincis-home/` para revisão visual.

Pendências anteriores fora do escopo: `favicon.ico` ausente (404); lint global com cinco erros em `src/components/ui/sidebar.tsx`, `src/contexts/ThemeContext.tsx`, `src/features/suporte/components/SupportPage.tsx`, `tests/oportunidade-simulacao-preco.test.ts` e `tests/redefinicao-senha.test.ts`. O teste de navegador distingue explicitamente o favicon dos erros da implementação.

Resultados: build completo com 47 páginas; typecheck sem erros; lint dos arquivos alterados sem erros; quatro testes determinísticos aprovados; navegador aprovado nas quatro larguras, incluindo documento animado e pausa no mobile. Nenhum erro de execução da demonstração ou falha de seus assets. O favicon ausente permanece identificado separadamente. Revisão visual feita nas capturas desktop, tablet e mobile; a largura de 320 px usa duas colunas na timeline para evitar texto apertado.

## Revisão visual — 17/10/2026

Substituídos os ambientes completos, seguindo o feedback de que trocar somente o personagem ou a camisa não diferenciava os cenários:

| Papel | Asset atual em `public/images/rede-vincis/` | Cenário |
| --- | --- | --- |
| Lucas, cliente | `cliente.webp` | Mesa clara curva e notebook; cenário inicial preservado |
| Marina, cliente | `cliente-marina-ambiente.webp` | Mesa redonda de carvalho, cadeira estofada verde, tapete e planta em vaso de terracota |
| André, cliente | `cliente-andre-ambiente.webp` | Pele morena escura, cabelo crespo curto, barba e porte próprio; mesa escura de madeira e metal, estante, luminária e piso de terracota |
| Camila, autônoma | `autonoma-camila-ambiente.webp` | Cabelo curto, blazer; bancada suspensa de madeira, monitor, cadeira verde e prateleiras |
| Rafael, técnico | `tecnico-rafael-ambiente.webp` | Estação grafite em L, dois monitores, cadeira azul, gaveteiro e quadro de vidro |
| Escritório | `escritorio-equipe.webp` | Ambiente arquitetônico com três pessoas, divisórias e estações individuais |
| Assistente | `robo-holografico.webp` + braço SVG | Robô branco/verde com V dourado; corpo e braço articulado se completam na cena |

A central anterior não é mais renderizada. `CentralVincis.tsx` compõe três telas translúcidas, base, corpo do assistente e braço independente. A articulação alcança um ponto na tela principal; a resposta luminosa está sincronizada com o toque. Os dois braços ficam visíveis na montagem final. A animação roda durante especialidade/operação, pausa junto com a demonstração e é desativada em movimento reduzido. Os IDs SVG usam `useId`, evitando conflito entre as versões desktop e mobile.

### Prompts da revisão

Ferramenta integrada `image_gen`; fundo transparente em todas as gerações/edições. Direção comum: dioramas 3D suaves, profissionais, rostos arredondados e expressivos, luz quente difusa, seguindo a referência original. Os novos arquivos WebP estão no projeto, sem dependência do diretório de geração.

- Cliente André: adulto brasileiro de pele marrom escura, cabelo preto crespo curto, barba, porte mais robusto, polo azul; identidade inteiramente diferente do cliente de verde. Edição final: preservar a pessoa e substituir todo o cenário por mesa estreita de nogueira escura com cavaletes de metal preto, cadeira de tela grafite, pequena estante à esquerda, luminária preta e piso de terracota; sem mesa branca, base branca arredondada ou dourados.
- Cliente Marina: preservar identidade, blusa mostarda e cabelo castanho; substituir o ambiente inteiro por mesa redonda de carvalho com pé central, cadeira de jantar verde, planta alta em vaso de terracota, tapete trançado e xícara; sem mesa retangular de escritório ou cadeira com rodinhas.
- Autônoma Camila: mulher de cabelo preto curto, blazer grafite, blusa marfim e rosto distinto da cliente. Edição final: bancada flutuante de madeira em L, monitor grande, cadeira verde e painel de parede com duas prateleiras de pastas e planta pendente; uma pessoa, pequeno V no monitor, sem mesa marfim frontal ou base circular.
- Técnico Rafael: homem de óculos, rosto arredondado e terno grafite. Edição final: estação angular grafite em L com dois monitores em ângulos diferentes, luminária prateada, cadeira azul, gaveteiro com pastas e quadro de vidro com diagramas abstratos; sem móveis reaproveitados dos demais atores.
- Escritório: diorama aberto de escritório contábil com três adultos distintos, homem de óculos e camisa azul clara à frente, mulher em estação adjacente e colega ao fundo; divisórias de vidro, plantas e mobiliário marfim, aparência mais próxima do escritório da referência.
- Robô: corpo cerâmico branco, juntas verdes, olhos ciano no visor escuro, V dourado no peito, pés inteiros, vista frontal; encaixe do ombro esquerdo da imagem exposto para receber o braço SVG animado. O asset do corpo não é exibido isoladamente na aplicação.

Validação adicional: teste de não reutilização de assets de clientes em profissionais; teste de movimento efetivo do braço, pausa sincronizada e ausência de animação em `prefers-reduced-motion`. Revisão visual da central completa e das cenas desktop/mobile. Permanecem fora do escopo os cinco erros de lint global e o favicon ausente já registrados acima.

### Revisão da narrativa de atendimento — 17/10/2026

A cena preserva os personagens, ambientes e central holográfica. O estado visual agora é derivado em `src/features/home/lib/fluxo-demonstracao.ts`, compartilhado entre desktop e mobile. Os marcos ficam em `src/features/home/constants/demonstracao.ts`.

- 4–7 s: solicitação percorre cliente → Vincis.
- 7–9,5 s: o assistente confirma o recebimento em um balão.
- 9,5–13 s: três opções neutras; 13–17,5 s: escolha e destaque do selecionado.
- 17,5–18,5 s: os cards se recolhem em direção ao núcleo; opacidade e escala seguem o relógio da demonstração.
- 18,5–22,5 s: Vincis anuncia o encaminhamento; 22,5–26 s: documento segue ao parceiro.
- 26–32 s: profissional recebe, prepara e apresenta sua resposta.
- 32–35,5 s: resposta volta à central; 35,5–37,5 s: confirmação pela Vincis.
- 37,5–41 s: entrega ao cliente; após 41 s, o balão dele exibe a mesma resposta.

Atendimentos começam com 16 segundos de intervalo e permanecem concluídos até o ciclo global de 80 segundos. O foco automático acompanha o atendimento mais antigo ainda aberto; escolher um cliente ou navegar pelas etapas fixa o foco até reiniciar. Cenas e conexões secundárias têm menor contraste, e somente o atendimento em foco anima a digitação/trabalho dos personagens. A preferência por movimento reduzido mantém navegação manual.

Validação: testes de estado cobrem os quatro trajetos, recebimento antes da resposta, seleção por ciclo, recolhimento, foco e resposta entregue. O roteiro Playwright verifica larguras 1440/820/390/320, escolha manual, pausa, redução de movimento, retorno, reinício, tema e login. O lint geral tem cinco erros anteriores à revisão em sidebar, ThemeContext, SupportPage e dois testes de outros domínios; os arquivos desta alteração passam no ESLint.
