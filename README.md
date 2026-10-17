# Kurio NFT Marketplace

Marketplace demonstrativo de NFTs construído com React, TypeScript, Vite, TanStack Router/Query, Axios, MSW e Socket.IO. Explore o catálogo, detalhe de NFT, favoritos, carrinho, checkout, pedidos, perfil e carteiras. Os dados e transações são simulados; não há conexão com blockchain, carteira real ou serviço de pagamento.

## Pré-requisitos e instalação

- Node.js 20.19+ (ou 22.12+) e npm.
- Chrome instalado para Lighthouse; use `LIGHTHOUSE_CHROME_PATH` se não estiver no caminho padrão.
- Chromium Playwright para executar E2E e atualizar screenshots: `npx playwright install chromium`.

```sh
git clone <url-do-repositorio>
cd jungle-nft-marketplace
npm install
npm run dev
```

O Vite inicia MSW automaticamente em desenvolvimento. Para configuração local opcional, copie `.env.example` para `.env.local` (PowerShell: `Copy-Item .env.example .env.local`). Nunca coloque segredos em variáveis `VITE_*`: são públicas no bundle do navegador.

## Variáveis de ambiente

| Arquivo/variável | Valor/exemplo | Uso |
| --- | --- | --- |
| `.env.example` | referência versionada, sem segredos | Modelo para `.env.local`. |
| `.env.demo` | `VITE_ENABLE_MOCKS=true` | Ativa os mocks no `build:demo` e no Lighthouse local. |
| `VITE_ENABLE_MOCKS` | `true` ou `false` | Ativa MSW em builds; no Vite dev, os mocks já iniciam. |
| `VITE_MOCK_SCENARIO` | nome de cenário, por exemplo `slow` | Seleciona o cenário padrão em runtime. Sem valor, usa `success`. |
| `VITE_API_BASE_URL` | URL compatível ou vazio | Prefixo REST; o padrão é `/api`. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | caminho para Chrome/Chromium | Opcional: navegador alternativo do Playwright. |
| `LIGHTHOUSE_CHROME_PATH` / `CHROME_PATH` | caminho para Chrome | Opcional: navegador do Lighthouse. |
| `LIGHTHOUSE_PUBLIC_URL` | URL HTTPS publicada | Executa a rodada pública Lighthouse; não modifica o deploy. |

## Contas fictícias e mocks

| Usuário | E-mail | Senha |
| --- | --- | --- |
| Ada Colecionadora | `ada@kurio.test` | `AdaDemo123!` |
| Bruno Artista | `bruno@kurio.test` | `BrunoDemo123!` |

O banco MSW compartilhado entre handlers REST e Socket.IO contém catálogo determinístico, contas, sessões, favoritos, carrinhos, cotações e pedidos. No browser, o estado persiste em `localStorage`. Desenvolvimento ativa mocks automaticamente; `npm run build:demo` usa `.env.demo`. Builds de produção normais mantêm mocks desativados.

Para escolher cenários:

- No build/dev: `VITE_MOCK_SCENARIO=slow`.
- Em uma chamada específica: acrescente `?scenario=slow` à URL do endpoint REST.
- Em teste/código: `setMockScenario('http-5xx', '/api/nfts')`.
- Resetar banco e cenário: `POST /__mocks/reset` com `{"scenario":"success"}`; `{"seed":"empty"}` seleciona catálogo vazio. O reset apaga também o estado local persistido no contexto de mocks.
- Alterar cenário de uma rota sem resetar banco: `POST /__mocks/scenario` com `{"scenario":"session-expired","endpoint":"/api/quotes"}`.
- Alterar listagem ou resolver pedido pendente e observar atualizações: endpoints `PATCH /__mocks/realtime/...`, descritos em [docs/realtime.md](./docs/realtime.md).

Para reproduzir os fluxos de falha (selecione o cenário e endpoint da tabela em [docs/mock-scenarios.md](./docs/mock-scenarios.md)):

- `slow`, `variable-latency`, `network-error`, `http-4xx`, `http-5xx`, `unauthorized` e `session-expired`: aplique a rota REST que deseja exercitar.
- `signup-conflict`, `validation-error`, `coupon-invalid` e `coupon-expired`: envie a operação de cadastro, perfil/carteira ou cotação correspondente.
- `price-changed`, `sold-out`, `order-timeout-after-create`, `order-pending`, `payment-confirmed` e `payment-rejected`: autentique-se e execute o checkout; o timeout recupera o pedido usando a mesma `Idempotency-Key`.
- Para alteração de anúncio, recusa/confirmação de pedido pendente, evento duplicado/antigo e conexão interrompida, use os endpoints determinísticos `/__mocks/realtime/...` e os passos detalhados em [docs/realtime.md](./docs/realtime.md).

## Comandos

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Desenvolvimento com MSW ativo. |
| `npm run build` | Verifica TypeScript e gera build normal sem ativar mocks. |
| `npm run build:demo` | Build otimizado de demonstração com MSW ativo. |
| `npm run preview` | Serve `dist/` localmente; rode antes `build` ou `build:demo`. |
| `npm run typecheck` | Verificação TypeScript. |
| `npm run lint` | ESLint. |
| `npm run test:unit` | Vitest e integração com MSW Node. |
| `npm run test:e2e` | Playwright em Chromium (desktop e mobile); relatório HTML e traces em falhas. |
| `npx playwright test tests/visual.spec.ts --update-snapshots` | Atualiza baselines desktop/mobile versionadas. |
| `npm run test:e2e:report` | Abre o último relatório HTML do Playwright. |
| `npx playwright show-trace test-results/<execução>/trace.zip` | Inspeciona trace de uma falha. |
| `npm run lighthouse` | Cria build demo, inicia `vite preview`, realiza 3 auditorias por página/perfil e salva HTML, JSON e medianas em `lighthouse/`. |

## Lighthouse

O runner gera 12 auditorias locais (início e `/nft/1`, mobile e desktop, 3 repetições), com perfil Chrome novo/sem cache em cada execução, no build demo com mocks e cenário padrão ativos. Configuração fixa de viewport e throttling em [`lighthouse/config/`](./lighthouse/config/); resultados e versão de browser/ambiente em [`lighthouse/SUMMARY.md`](./lighthouse/SUMMARY.md), relatórios individuais em `lighthouse/reports/`. Para repetir também as 12 medições contra o deploy (somente leitura), defina `LIGHTHOUSE_PUBLIC_URL` antes de executar; PowerShell: `$env:LIGHTHOUSE_PUBLIC_URL='https://nft-marketplace-eight-mu.vercel.app/'; npm run lighthouse`.

## Testes visuais

Baselines versionadas em `tests/visual.spec.ts-snapshots/` foram capturadas no Windows (ambiente atual). Mudanças de OS, navegador ou fonte podem exigir baselines próprias; regenere no ambiente desejado com `npx playwright test tests/visual.spec.ts --update-snapshots` e inspecione o diff antes de versionar.

## Deploy e demonstração pública

O deploy Vercel usa o rewrite SPA definido em `vercel.json`. Para a demo, execute `npm run build:demo` e publique a pasta `dist`; esse build mantém MSW ativo e não representa autenticação ou transação reais. Builds comuns com `npm run build` não habilitam mocks.

URL pública: https://nft-marketplace-eight-mu.vercel.app/

**Aviso de segurança:** autenticação, sessão, carteiras, pedidos e pagamentos são simulações client-side. Tokens e banco mockado usam armazenamento local do navegador; não constituem autenticação segura e nunca devem receber credenciais, dados pessoais ou transações reais.

## Contratos e arquitetura

Contratos REST e de eventos: [docs/api-contracts.md](./docs/api-contracts.md). Cenários: [docs/mock-scenarios.md](./docs/mock-scenarios.md). Política de cache: [docs/cache-policy.md](./docs/cache-policy.md). Transporte realtime: [docs/realtime.md](./docs/realtime.md). Visão das responsabilidades, decisões e limitações: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Limitações conhecidas

**Fidelidade visual.** O front-end segue o Figma na estrutura, nos fluxos e na identidade
visual, mas **não é uma reprodução pixel a pixel**. Alguns ajustes de front-end e,
principalmente, a versão mobile ficaram sem o refinamento necessário para acompanhar o
Figma com total fidelidade. Busquei seguir o layout da melhor forma possível dentro do
prazo, priorizando o comportamento (fluxos completos, API simulada, tempo real) e a
acessibilidade.

Diferenças conhecidas:

- **Mobile e tablet:** os frames mobile foram seguidos onde existiam, mas com menos
  refinamento que o desktop.
- **Espaçamentos e tipografia:** há pequenas diferenças de espaçamento, alinhamento e
  tamanho de fonte em algumas telas.
- **Estados não desenhados** (skeleton, vazio, erro, validação, avisos de tempo real)
  seguem o padrão visual existente, sem referência no Figma.
- **Conteúdo fora do escopo** (áreas promocionais/editoriais e avaliações sem dados) foi
  removido.

**Testes e possíveis erros.** Podem existir falhas não detectadas, principalmente em
combinações de fluxos, viewports intermediários e cenários de falha não cobertos. Os testes
automatizados (unitários, E2E e regressão visual) cobrem os fluxos principais, mas **mais
testes são necessários**, especialmente na versão mobile e em casos de borda de tempo real
e checkout.

Os desvios do Figma e os ajustes de acessibilidade estão detalhados em
[ARCHITECTURE.md](./ARCHITECTURE.md).
