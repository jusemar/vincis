# 📐 Regras do Projeto — Plataforma SaaS de Contabilidade e Advocacia

> Documento vivo. Toda IA deve seguir estas regras sem exceção.

---

# 🤖 Regras de Comportamento da IA

1. Antes de alterar algo grande, explique rapidamente o plano. Depois execute sem ficar pedindo aprovação a cada comando.

2. Após aprovação:

   * passo a passo;
   * caminho completo do arquivo;
   * código comentado explicando o motivo das decisões.

3. Aplicar práticas de engenharia sênior:

   * código limpo;
   * separação de responsabilidades;
   * escalabilidade;
   * segurança;
   * observabilidade.

4. Interfaces sempre responsivas.

5. Prioridade máxima para experiência mobile.

6. Toda implementação deve considerar:

   * múltiplas empresas (multiempresa);
   * múltiplos usuários;
   * crescimento futuro da plataforma.

7. Autonomia da IA / Codex

* Não parar para pedir permissão em tarefas técnicas comuns.
* Pode executar comandos de validação, testes, build, lint, typecheck e abrir/recarregar navegador headless.
* Pode investigar erros, consultar logs e ajustar arquivos do projeto sem perguntar antes.
* Só deve perguntar ao usuário quando:

  * envolver apagar dados reais;
  * mexer em produção;
  * alterar credenciais;
  * alterar cobrança;
  * houver mais de uma decisão de negócio possível.
* Ao final sempre validar com:

  * npm run typecheck ou npx tsc --noEmit
  * npm run lint (se existir)
  * npm run build (se aplicável)
  * testes manuais necessários
* Não considerar tarefa concluída sem informar:

  * o que foi alterado;
  * o que foi testado;
  * resultado dos testes.

---

# 🧠 Arquitetura do Projeto

* Modelo: Feature-Based (modular por domínio)
* Next.js App Router
* Arquitetura preparada para SaaS Multiempresa
* Backend orientado a domínios

---

# 🧩 REGRA PRINCIPAL (CRÍTICA)

👉 Cada domínio vive em um único lugar.

👉 Painel Administrativo, Portal do Cliente e Painel Operacional são apenas variações de interface dentro do mesmo domínio.

---

## 📁 Estrutura de Feature (PADRÃO)

```bash
src/features/<dominio>/
├── components/
│   ├── admin/
│   ├── cliente/
│   └── operacional/
│
├── actions/
├── queries/
│   └── subpasta/
│
├── hooks/
├── schemas/
├── lib/
├── types/
├── constants/
└── index.ts
```

Regra prática:

👉 Até 3 arquivos → pode ficar direto

👉 Passou disso → criar subpastas por assunto

---

## 🧠 Domínios da Plataforma

Exemplos:

```bash
usuarios
empresas
clientes

contadores
advogados

documentos
contratos
processos

tributos
guias
notas-fiscais

atendimentos
mensagens
notificacoes

pagamentos
assinaturas

auditoria
permissoes
```

---

## Regras de Domínio

Cada domínio possui responsabilidade única.

Exemplos:

* documentos → gestão documental
* contratos → contratos jurídicos
* processos → processos jurídicos
* tributos → cálculos tributários
* guias → emissão de guias
* atendimentos → relacionamento com cliente

❌ Nunca duplicar domínio

❌ Nunca misturar regras entre domínios

---

# 📁 Estrutura Global

```bash
src/
├── app/
├── features/
├── db/
├── integracoes/
├── components/
│   ├── ui/
│   └── shared/
├── lib/
├── hooks/
├── types/
├── constants/
```

---

# 🗄️ Banco de Dados (Drizzle ORM)

```bash
src/db/
├── connection.ts
├── schema.ts
└── tables/
    ├── <dominio>/
    │   ├── tabela.ts
    │   └── relacoes.ts
```

---

## Convenções de Nomenclatura

Usar nomes claros e descritivos.

Priorizar português.

Exemplos:

```txt
emitirGuiaTributaria
buscarDocumentosCliente
calcularImposto
gerarContrato
```

Evitar:

```txt
calculateTax
documentsService
taxManager
```

Exceções:

* bibliotecas;
* APIs externas;
* nomes obrigatórios do framework;
* nomes oficiais de terceiros.

---

# 🏢 Multiempresa (OBRIGATÓRIO)

A plataforma é SaaS.

Toda entidade de negócio deve possuir:

```txt
empresaId
```

Exceto:

* usuários globais;
* permissões globais;
* configurações globais.

Toda query deve respeitar isolamento por empresa.

Nenhuma empresa pode visualizar dados de outra empresa.

---

# 👥 Perfis e Permissões

Utilizar RBAC.

Perfis iniciais:

```txt
administrador
contador
advogado
cliente
operador
```

Toda action deve validar permissões.

❌ Nunca confiar apenas na interface.

❌ Nunca esconder botão como única proteção.

---

# 📋 Auditoria (OBRIGATÓRIO)

Toda alteração crítica deve gerar log.

Exemplos:

* emissão de guia;
* alteração contratual;
* alteração tributária;
* upload de documento;
* assinatura digital;
* exclusão lógica.

Registrar:

```txt
usuarioId
empresaId
data
acao
entidade
registroAfetado
ip
```

---

# 📂 Gestão de Documentos

Todo documento deve possuir:

```txt
empresaId
usuarioId
categoria
status
versao
dataUpload
```

Preferir:

* versionamento;
* arquivamento lógico.

Evitar exclusão física.

---

# ✍️ Assinaturas Digitais

Toda assinatura deve registrar:

```txt
documentoId
usuarioId
data
ip
hash
```

Assinaturas devem ser auditáveis.

Nunca confiar apenas em validações do frontend.

---

# 🔄 Integrações Externas

Toda integração deve ficar em:

```bash
src/integracoes/
```

Exemplos:

* Receita Federal
* Simples Nacional
* Junta Comercial
* NF-e
* NFS-e
* Certificado Digital
* OCR
* Assinatura Digital
* Gateways de Pagamento

Toda integração deve possuir:

* logs;
* timeout;
* retry;
* tratamento de erro;
* tipagem forte.

---

# 🤖 Inteligência Artificial

IA nunca toma decisões finais.

IA pode:

* sugerir documentos;
* sugerir contratos;
* sugerir petições;
* sugerir cálculos;
* sugerir classificações fiscais;
* sugerir enquadramentos tributários;
* auxiliar atendimento.

Toda decisão final deve ser validada por usuário autorizado.

---

# ⚠️ Separação de Responsabilidades

actions/

* create
* update
* delete

queries/

* get
* list
* search

lib/

* regras de negócio

hooks/

* client side

❌ Nunca colocar regra de negócio dentro de componentes.

---

# ⚙️ Next.js (App Router)

app/ contém apenas:

```txt
page.tsx
layout.tsx
loading.tsx
error.tsx
route.ts
```

---

## Regras

* Mutações → Server Actions

* API Routes apenas para:

  * webhooks
  * integrações externas

* Server Components por padrão

* use client apenas quando necessário

---

# 🔐 Segurança (PRIORIDADE MÁXIMA)

Obrigatório:

* validação com Zod;
* validação de sessão;
* validação de permissões;
* sanitização de entrada;
* rate limiting quando necessário;
* logs de auditoria.

Nunca:

* confiar no frontend;
* expor dados de outras empresas;
* expor segredos;
* usar NEXT_PUBLIC_ para dados sensíveis.

---

# 📑 Formulários

Utilizar:

* react-hook-form
* zod

Validação dupla:

* client
* server

❌ Nunca usar useState para formulários complexos.

---

# 🔄 TanStack Query

* não usar fetch manual em client;
* usar query keys padronizadas;
* invalidar queries após mutações.

---

# 🧠 Drizzle ORM

* relations obrigatórias;
* queries fora dos componentes;
* migrations automáticas;
* nunca editar migrations manualmente.

---

# 🎨 Tailwind CSS

Obrigatório:

* prettier-plugin-tailwindcss
* classes organizadas
* dark mode preparado

Evitar:

```txt
w-[123px]
h-[341px]
```

Sem justificativa técnica.

---

# 🎯 Design System

```bash
src/components/ui/
├── Button.tsx
├── Input.tsx
├── Card.tsx
├── Modal.tsx
├── Select.tsx
├── Tabela.tsx
```

Utilizar:

* CVA
* variantes
* reutilização

---

# 📈 Performance

Obrigatório:

* paginação;
* lazy loading;
* cache quando aplicável;
* evitar consultas desnecessárias;
* otimização para mobile.

---

# 🚀 Escalabilidade

Todo desenvolvimento deve considerar:

* múltiplas empresas;
* múltiplos usuários;
* milhares de documentos;
* milhares de contratos;
* milhares de processos;
* crescimento sem refatoração estrutural.

Seguir ordem:

```txt
Banco
→ Types
→ Schemas
→ Queries
→ Actions
→ UI
```

---

# ❌ Proibições Absolutas

* lógica dentro de app/
* páginas dentro de features/
* duplicação de domínio
* services genéricos
* uso de any
* upload direto sem validação
* confiar no frontend
* validação apenas visual
* consultas sem isolamento por empresa

---

# 🧭 Regra Final

Todo código deve ser:

* escalável;
* seguro;
* auditável;
* reutilizável;
* organizado;
* tipado;
* fácil de manter;
* preparado para SaaS multiempresa;
* preparado para contabilidade;
* preparado para advocacia.
