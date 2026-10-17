# Arquitetura

## Estrutura e responsabilidades

- `src/routes/` contém as telas do catálogo, NFT, carrinho, pagamento, pedido/recibo, login/cadastro, perfil e carteiras; o TanStack Router divide telas por rota.
- `src/contracts/api.ts` define os contratos compartilhados por cliente e mocks.
- `src/api/client.ts` centraliza Axios, bearer token e tratamento de respostas 401; `resources.ts` implementa operações REST e `hooks.ts` integra recursos/mutations a TanStack Query.
- `src/api/query-client.ts`, `keys.ts` e `realtime-socket.ts` centralizam ciclo de vida do cache, isolamento por usuário e aplicação de eventos realtime.
- `src/api/session-store.ts`, `session-storage.ts`, `session-provider.tsx` e `session.tsx` controlam identidade, persistência, expiração e ações de sessão.
- `src/mocks/db/` é o banco único consumido por handlers REST e realtime. `auth.ts`, `handlers.ts`, `resourceHandlers.ts`, `eventBus.ts` e `socket-io.ts` implementam autenticação, recursos e eventos; `scenarios/` injeta latência/falhas controladas.
- `src/mocks/data.ts` e `src/assets/` fornecem fixtures do catálogo e imagens locais; `tests/` contém Vitest, Playwright e baselines visuais.
- `src/lib/money.ts` usa `decimal.js` (precisão interna de 80 dígitos); ETH trafega como strings decimais.

## Contratos REST e eventos

Os contratos REST, formatos de erro, autorização e endpoints estão em [docs/api-contracts.md](./docs/api-contracts.md). Em resumo: `/api/auth` trata sessão e contas; `/api/nfts` e `/api/favorites` atendem catálogo e favoritos; `/api/cart` e `/api/quotes` servem carrinho/cotação; `/api/orders` implementa criação idempotente e leitura do pedido; `/api/profile` e `/api/wallets` atualizam dados privados.

`nft.updated` transmite `eventId`, NFT/edição afetados, preço/disponibilidade e `version`. `order.updated` transmite `eventId`, pedido, status e versão. Contratos e exemplos estão em [docs/api-contracts.md](./docs/api-contracts.md); transporte mockado e limites em [docs/realtime.md](./docs/realtime.md).

## Sessão, expiração e isolamento

Login e cadastro guardam token/identidade (não senha) em armazenamento local para sobreviver ao refresh. A sessão é restaurada por `GET /api/auth/session`, expira no horário `expiresAt` e também é verificada pelos handlers. O provider agenda o fim da sessão; 401/logout invalidam a sessão. Logout, expiração e troca de usuário cancelam queries e limpam o QueryClient; o socket é desconectado e seus listeners removidos antes de mudar a identidade.

Toda chave de cache privado inclui `userId`. Handlers autenticados verificam propriedade de pedido, carteira, perfil e favoritos; dados privados não são reutilizados entre contas. A autenticação é demonstrativa: não é uma fronteira de segurança de servidor real.

## Carrinho, pedidos e UX

Visitantes usam um `visitorId` local e endpoints de carrinho de visitante; autenticar ou cadastrar mescla as linhas do visitante no carrinho da conta. Quantidades e disponibilidade são validadas pelo handler. Os dados mockados persistem no `localStorage` deste navegador.

A confirmação pede cotação atual e bloqueia alterações de preço/estoque até nova confirmação do resumo. `Idempotency-Key` permanece estável por tentativa: repetir a mesma chave e corpo recupera o mesmo pedido; corpo diferente conflita. Timeout recuperável consulta o pedido existente, sem criar outra compra. Recusa mantém carrinho e estoque; confirmação persiste snapshot imutável de recibo, baixa estoque e remove linhas compradas.

Decisões de UX incluem filtros refletidos na URL e histórico navegável, feedback de falhas próximo aos campos, rollback visual de favorito, aviso de preço/estoque alterados, confirmação explícita após mudança de cotação e recuperação de pedidos pendentes por REST/reconexão.

## Cache, retries e sincronização

As query keys do catálogo incluem parâmetros completos; detalhes usam ID. Listagem/detalhe têm frescor de 30 s, recursos privados/curta validade são revalidados imediatamente conforme a consulta. `AbortSignal` chega ao Axios. Queries repetem somente falhas de rede, 429 e 5xx (até duas tentativas com backoff); mutations não repetem automaticamente.

Favoritos atualizam otimisticamente com rollback em erro. Outras mutations invalidam dados dependentes ou os substituem com respostas do servidor mockado. O socket é o único módulo que aplica `nft.updated`/`order.updated` ao cache e à notificação da UI: descarta `eventId` já visto e versões menores/iguais à versão aplicada; estado terminal do pedido não regride. Ao reconectar invalida queries ativas afetadas e reconcilia catálogo, detalhe, carrinho, cotação e pedido pendente pela REST. Política detalhada em [docs/cache-policy.md](./docs/cache-policy.md).

## Mocks e limites do transporte

No desenvolvimento, `src/main.tsx` inicia o service worker MSW; `VITE_ENABLE_MOCKS=true` habilita o mesmo comportamento em build de demonstração (`.env.demo`, `npm run build:demo`). Build normal não importa chunks do mock. Banco, seed e `resetDb()` estão em `src/mocks/db/`; alterações REST/realtime usam o mesmo estado. O browser persiste a base em `localStorage`; `POST /__mocks/reset` restaura seed/cenário e `seed: "empty"` limpa catálogo. Cenários e exemplos reproduzíveis: [docs/mock-scenarios.md](./docs/mock-scenarios.md).

O client usa `socket.io-client`; `@mswjs/socket.io-binding` adapta conexões Socket.IO/WebSocket para o ambiente MSW. É um servidor de teste local, não substitui um backend Socket.IO: rooms/namespaces, heartbeat e garantias de produção não são implementados. O fluxo depende do estado local do browser e não compartilha banco entre visitantes ou dispositivos.

## Acessibilidade e integração visual

Foram associados labels a controles, acrescentados `aria-invalid`/`aria-describedby`, anúncios `aria-live`/status e foco no primeiro campo inválido. Diálogos mantêm/restauram foco; ações têm foco visível; skeleton respeita `prefers-reduced-motion`. Layouts de conta, carrinho e compra adaptam-se a viewport móvel. E2E inclui navegação por teclado e screenshots desktop/mobile.

O catálogo tem 27 fixtures. Quatro ilustrações PNG locais (`src/assets/nft-monkey-1.png` a `nft-monkey-4.png`) são mantidas como originais e servidas em WebP otimizado de `public/assets/` tanto nas imagens de NFT como no hero. O asset 1 é pré-carregado como imagem principal; dimensões intrínsecas e skeletons reservam espaço durante o carregamento. Os assets presentes não registram uma correspondência verificável com exports individuais do Figma; portanto são substituições ilustrativas locais, não uma declaração de paridade com o original. Hero permanece ilustrativo, não comprável. Conteúdo editorial/promocional ou controles sem suporte por dados/API foram omitidos em vez de simulados como funcionais.

## Revisão de segurança e limitações conhecidas

Não são persistidos passwords em claro; campos usam autocomplete apropriado e são limpos após envio; redirects só aceitam caminhos internos. Upload de avatar valida extensão, MIME e tamanho (1 MB), e não aceita SVG. Conteúdo remoto é renderizado como texto; links externos usam `noopener noreferrer`; handlers autorizam recursos privados. Vercel adiciona `nosniff`, `Referrer-Policy`, `X-Frame-Options` e `Permissions-Policy`. Variáveis `VITE_*` são públicas e não podem guardar segredos. Ver [README.md](./README.md) para o aviso de autenticação apenas demonstrativa.

`npm audit --omit=dev` não reporta vulnerabilidades. A árvore exclusivamente de desenvolvimento reporta 34 avisos (15 HIGH, 19 moderate), incluindo alertas transitivos no Lighthouse 12.8.2 e no glob usado por `shadcn`; Lighthouse 13.5 requer Node 22.19+, acima do runtime mínimo do projeto, então o runner permanece fixado na versão que roda no Node 20 suportado. Esses pacotes não entram no bundle publicado; audite novamente antes de atualizar o toolchain.

Não há blockchain, assinatura/transação real, gateway de pagamento ou backend de produção. Senhas/hash, tokens, sessão, relógio e dados persistentes são somente uma simulação client-side; não use dados reais. O resultado de Lighthouse depende de Chrome, throttling e hardware locais; detalhes e medições reproduzíveis são gravados em [lighthouse/SUMMARY.md](./lighthouse/SUMMARY.md).
