# Kurio NFT Marketplace

Marketplace de NFTs em React, TypeScript, Vite, TanStack Router, TanStack Query, Axios e Tailwind CSS. A API mockada usa MSW, com banco local persistente e cenários configuráveis. Não há conexão com blockchain, carteira ou serviço de pagamento real.

## Requisitos

- Node.js 20.19+ ou 22.12+
- npm

## Executar

```sh
npm ci
npm run dev
```

O servidor de mocks inicia automaticamente no desenvolvimento. Abra a URL exibida pelo Vite. Use `npm run test:unit` para os testes Vitest da camada MSW e `npm run typecheck` para a verificação de tipos.

Copie `.env.example` para `.env.local` quando precisar configurar variáveis locais. Variáveis `VITE_*` são incluídas no bundle do navegador e nunca devem conter segredos.

| Variável | Uso |
| --- | --- |
| `VITE_ENABLE_MOCKS` | Ativa MSW nos builds de demonstração; normalmente `false` |
| `VITE_MOCK_SCENARIO` | Cenário padrão opcional dos mocks |
| `VITE_API_BASE_URL` | URL base opcional de uma API compatível; padrão `/api` |

**Aviso de segurança:** autenticação, sessões, carteiras, pedidos e pagamentos deste projeto são simulações client-side para demonstração. O token e o banco mockado são armazenados no navegador; não oferecem autenticação segura nem devem ser usados com dados, credenciais ou transações reais.

## Comandos

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Desenvolvimento com MSW no navegador |
| `npm run build` | Verificação TypeScript e build normal |
| `npm run build:demo` | Build de demonstração com MSW habilitado |
| `npm run preview` | Preview do build gerado |
| `npm run lint` | ESLint |
| `npm run typecheck` | Verificação TypeScript |
| `npm run test:unit` | Testes unitários e integração MSW Node |
| `npm run test:e2e` | Testes E2E Playwright em Chromium |
| `npm run test:e2e:report` | Abre o último relatório HTML Playwright |

Para executar os testes pela primeira vez, instale o navegador: `npx playwright install chromium`. Se já houver Chrome instalado, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` pode apontar para o executável local. O Playwright inicia o Vite automaticamente e grava traces de falhas em `test-results/`.

## Mocks e dados

O catálogo contém 27 itens determinísticos. O banco MSW também inclui dois usuários de demonstração, sessões, favoritos, carrinhos, cupons, carteiras e pedidos; seus dados são persistidos em `localStorage` com a chave `kurio-marketplace-mock-db-v1`. O comando `npm run build:demo` carrega `.env.demo`, que define `VITE_ENABLE_MOCKS=true`, mantendo os mocks no build demo. Builds normais não ativam os mocks.

`GET /api/nfts` aceita `q`, `collection`, `network`, `minPrice`, `maxPrice`, `sort`, `page` e `limit`. Os preços dos limites são expressos em centésimos de ETH (por exemplo, `minPrice=125` representa `1.25 ETH`). A resposta usa `{ data, total, page, limit }`. `sort` aceita `recent`, `newest`, `trending`, `price-low` e `price-high`. `GET /api/nfts/:id` devolve um NFT ou HTTP 404.

Os estados de busca e filtros ficam nos search params do TanStack Router; os parâmetros completos compõem a query key do TanStack Query e são enviados ao endpoint por Axios. A query recebe o `AbortSignal` do TanStack Query para descartar/cancelar requisições obsoletas.

### Cenários

`VITE_MOCK_SCENARIO` seleciona um cenário padrão, ou use `?scenario=slow` em uma requisição específica ou `setMockScenario(name, endpoint?)` em testes. `POST /__mocks/reset` com `{ "scenario": "success" }` reinicia dados e seleção. Cenários existentes incluem lentidão, respostas fora de ordem, erro de rede/HTTP, sessão expirada, conflito/validação de cadastro, cupom inválido/expirado, preço alterado, esgotamento, timeout recuperável por idempotência e pagamento recusado. Consulte [docs/mock-scenarios.md](./docs/mock-scenarios.md) para reproduzir cada um e para credenciais fictícias.

Os contratos e métodos HTTP estão documentados em [docs/api-contracts.md](./docs/api-contracts.md). A aritmética de ETH usa `decimal.js` com precisão interna de 80 dígitos, arredondamento half-up e exibição configurável; valores de transporte continuam strings decimais.

O cliente REST usa a instância única Axios exportada por `src/api/client.ts`; `VITE_API_BASE_URL` pode substituir `/api` para um backend compatível. A camada `src/api/hooks.ts` fornece consultas e mutations TanStack Query; a política de frescor, isolamento por usuário e retries está em [docs/cache-policy.md](./docs/cache-policy.md). A sessão é restaurada por `GET /api/auth/session`; tokens ficam em armazenamento local para sobreviver ao refresh, e senhas não são persistidas.

## Estado da entrega

O catálogo, as contas, carrinho, checkout, pedidos, perfil e carteiras estão integrados aos hooks REST/MSW. Eventos Socket.IO são mockados para desenvolvimento/demonstração; fluxos E2E desktop/mobile e baselines visuais são executados por Playwright. Não há conexão com blockchain, carteira ou serviço de pagamento real.

Veja [ARCHITECTURE.md](./ARCHITECTURE.md) para responsabilidades, contrato implementado e limitações atuais.
