# Arquitetura

## Estrutura e responsabilidades

- `src/contracts/api.ts` contém os contratos TypeScript compartilhados por transporte e handlers MSW.
- `src/api/client.ts` é a única instância Axios; `src/api/resources.ts` implementa as funções REST tipadas e `src/api/hooks.ts` integra TanStack Query.
- `src/api/session-store.ts` e `src/api/session.tsx` armazenam somente o token/identidade (nunca senha), restauram a sessão pelo endpoint e expõem hooks de login/cadastro/logout.
- `src/api/keys.ts` centraliza query keys. Chaves privadas incluem sempre o `userId`; `clearQueryClient()` cancela queries em voo e limpa o cache.
- `src/api/query-client.ts` concentra tempos, retry/backoff e políticas globais; consulte [docs/cache-policy.md](./docs/cache-policy.md).
- `src/lib/money.ts` calcula valores de ETH com `decimal.js` (precisão interna de 80 dígitos); a API transporta strings decimais, não `number`.
- `src/mocks/db/` é o banco em memória único dos handlers, restaurado de `localStorage` pela chave versionada `kurio-marketplace-mock-db-v1`. `resetDb()` repõe o seed determinístico completo; `resetDb('empty')` mantém usuários e dados de conta, mas limpa o catálogo.
- `src/mocks/auth.ts`, `src/mocks/handlers.ts` e `src/mocks/resourceHandlers.ts` implementam autenticação e recursos REST sobre o banco comum.
- `src/mocks/scenarios/` aplica atrasos, indisponibilidade e respostas de erro antes dos handlers de negócio. Não há lógica fictícia no cliente Axios nem nos componentes para completar essas respostas.
- `docs/api-contracts.md` documenta endpoints e eventos; `docs/mock-scenarios.md` documenta seleção, reset, credenciais e reprodução dos cenários.

## Catálogo, busca e cache

O catálogo usa 27 fixtures, listadas por `GET /api/nfts` e detalhadas por `GET /api/nfts/:id`. A listagem aceita busca, coleção, rede, preço, ordenação, página e limite; filtra e pagina no handler REST. Os parâmetros da URL compõem a query key do TanStack Query no fluxo atual do catálogo.

O catálogo e detalhe NFT usam hooks compartilhados, query keys por parâmetros e `AbortSignal` repassado ao Axios. Consultas privadas incluem o `userId` e definem frescor zero; mutations invalidam os recursos dependentes ou atualizam cache. Favoritos são otimistas com rollback. Criação de pedido requer `OrderAttempt` com `Idempotency-Key` estável para permitir recuperação explícita de timeout. A política completa de retry, expiração e limpeza está em [docs/cache-policy.md](./docs/cache-policy.md).

## Persistência, identidade e sessão simulada

O banco MSW persiste sessões, contas, perfis, carteiras, favoritos, carrinhos, cotações e pedidos no `localStorage`, em esquema versionado. Dois usuários fictícios têm hashes SHA-256 com salt, nunca senhas em claro no estado; veja [docs/mock-scenarios.md](./docs/mock-scenarios.md) para credenciais. Tokens bearer expiram e podem ser invalidados pelo logout ou pelo cenário `session-expired`. `POST /__mocks/reset` restaura um seed conhecido.

Favoritos, carrinho autenticado, perfil, carteiras, cotação e pedido verificam autenticação. Carrinhos de visitante têm rotas próprias e podem ser mesclados no cadastro/login. O pedido valida cotação, estoque, carteira e rede; a chave `Idempotency-Key` é escopada ao usuário, recupera a mesma resposta em retries e conflita se o corpo mudar. Só pedidos confirmados baixam estoque e removem quantidades compradas; o recibo preserva o snapshot criado. O cenário de recusa mantém o carrinho e estoque.

## Rede e cenários

Todas as rotas de negócio são interceptadas por MSW. Axios permanece cliente HTTP; as respostas, o banco e as falhas ficam no limite MSW. `VITE_ENABLE_MOCKS=true` ativa o worker no build demo (`.env.demo`); o desenvolvimento também ativa o worker. Rotas não mockadas usam `onUnhandledRequest: 'bypass'` para permitir assets e recursos de desenvolvimento servidos pelo Vite.

`VITE_MOCK_SCENARIO`, query string `scenario` e `setMockScenario()` selecionam cenários repetíveis. Respostas de latência variável percorrem tempos fixos, não `Math.random()`. A lista completa e instruções estão em [docs/mock-scenarios.md](./docs/mock-scenarios.md).

## Integração visual, escopo e acessibilidade

As telas de catálogo, detalhe, carrinho, pagamento, pedido, login, cadastro, perfil e carteiras consomem os hooks de dados. O conteúdo de catálogo, preço, estoque, usuário, carteira e recibo vem das respostas da API simulada; opções de coleção/rede são derivadas do catálogo carregado e contagens sem suporte no contrato não são inventadas. O destaque lateral do catálogo usa um NFT retornado pela API. Avaliações não são exibidas como pontuação porque o recurso não fornece esses dados.

As áreas editoriais e promocionais que estavam fora do escopo foram removidas da página inicial, evitando apresentar artigos, ofertas e quantidades fixas como recursos funcionais. O hero ilustrativo permanece como conteúdo visual, sem representar um item comprável. O único frame de edição disponível é apresentado sem opções de edição fictícias.

Os ajustes de acessibilidade acrescentam rótulos associados aos campos, `aria-invalid`/`aria-describedby` para erros, foco no primeiro campo inválido, estados de mutation anunciados por `aria-live`, foco visível em ações e animações de skeleton desativadas com `prefers-reduced-motion`. Formulários evitam submissão duplicada e exibem erros de validação retornados pela API. Perfil, carteiras e recibo usam layouts fluidos em telas estreitas.

## Limites desta entrega

Esta entrega integra os fluxos de conta e compra às telas e hooks REST simulados, incluindo testes de compra, recuperação de timeout, expiração de sessão, perfil e carteiras. O envio de eventos em tempo real por `socket.io-client` e um transporte MSW compatível com Socket.IO ainda não foram implementados; alterações no carrinho são atualizadas pelos refetches disponíveis, sem subscrição `nft.updated`/`order.updated`. Auditoria Lighthouse e deploy público permanecem fora desta implementação.

Também não há conexão com blockchain, extensões de carteira ou gateway de pagamento; os estados e recibos são apenas simulações locais. A implementação não garante um backend compartilhado entre navegadores, pois o estado persistente é local ao browser.
