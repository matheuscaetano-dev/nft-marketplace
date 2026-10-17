# Cenários dos mocks MSW

## Seleção e reset

O cenário padrão é `success`. Selecione outro cenário de uma destas formas:

- Build/demo ou desenvolvimento: defina `VITE_MOCK_SCENARIO=<nome>` (por exemplo, `VITE_MOCK_SCENARIO=slow`).
- Uma requisição: acrescente `?scenario=<nome>` à URL do endpoint chamado.
- Em testes ou código de demonstração: use `setMockScenario(nome, endpoint?)` de `src/mocks/scenarios`.
- Reset integral pelo navegador/teste: `POST /__mocks/reset` com `{ "scenario": "success" }`; `{ "seed": "empty" }` restaura catálogo vazio. O endpoint também limpa o estado local persistido.
- Alteração durante uma sessão de navegador: `POST /__mocks/scenario` com `{ "scenario": "session-expired", "endpoint": "/api/quotes" }` configura uma falha para um endpoint sem resetar o banco.
- Conferência da seleção ativa: `GET /__mocks/scenario` retorna o cenário e endpoint runtime configurados.

A seleção em runtime pode ser limitada a um endpoint, por exemplo `setMockScenario('http-5xx', '/api/nfts')`, para não afetar as outras rotas. O nome de cenário também pode ser passado no corpo do reset, que reinicia o banco e seleciona o cenário. Os cenários não usam aleatoriedade; latência variável percorre a sequência fixa de 640, 45, 330 e 90 ms.

## Credenciais fictícias

| Usuário | E-mail | Senha | Dados |
| --- | --- | --- | --- |
| Ada Colecionadora | `ada@kurio.test` | `AdaDemo123!` | Favorito NFT 7; carteiras Ethereum e Polygon |
| Bruno Artista | `bruno@kurio.test` | `BrunoDemo123!` | Favoritos NFT 2 e 8; carteira Polygon |

As senhas não são gravadas em claro: o seed contém salt e hash SHA-256. Tokens e expiração são simulados, sem credenciais ou serviços reais.

## Cenários disponíveis

| Cenário | Endpoint recomendado | Resultado/reprodução |
| --- | --- | --- |
| `success` | qualquer | Caminho normal; `POST /api/orders` confirma o pagamento simulado. |
| `empty` | `GET /api/nfts` | Use `POST /__mocks/reset` com `scenario: "empty"` para resetar o banco e catálogo vazio. |
| `slow` | qualquer rota `/api/*` | Atrasa cada resposta em 1.5 s antes de continuar pelo handler REST. |
| `variable-latency` | rota `/api/*` repetida | Atrasos determinísticos de 640/45/330/90 ms; chamadas paralelas podem terminar fora de ordem. |
| `network-error` | qualquer rota `/api/*` | MSW simula falha de rede sem resposta HTTP. |
| `http-4xx` | qualquer rota `/api/*` | Responde HTTP 422 com erro tipado. |
| `http-5xx` | qualquer rota `/api/*` | Responde HTTP 503 com `TRANSIENT_FAILURE`. |
| `session-expired` | rota autenticada | Responde 401 e invalida o token apresentado. |
| `unauthorized` | rota `/api/*` | Responde 401 `SESSION_INVALID`. |
| `signup-conflict` | `POST /api/auth/register` | Responde 409 `ACCOUNT_CONFLICT`. |
| `validation-error` | cadastro, perfil ou carteiras | Responde 422 com `fieldErrors`. |
| `coupon-invalid` | `POST /api/quotes` | Responde HTTP 422 `COUPON_INVALID`. |
| `coupon-expired` | `POST /api/quotes` | Responde HTTP 422 `COUPON_EXPIRED`. |
| `price-changed` | `POST /api/orders` | Uma vez por reset de cenário, aumenta em `0.01 ETH` o preço da primeira edição requisitada; a cotação antiga conflita. |
| `sold-out` | `POST /api/orders` | Uma vez por cenário, zera o estoque da primeira edição requisitada; a confirmação responde 409 `AVAILABILITY_CONFLICT`. |
| `order-timeout-after-create` | `POST /api/orders` | Persiste e confirma o pedido, mas simula timeout de rede na resposta. Reenvie o mesmo corpo com a mesma `Idempotency-Key` para recuperar o mesmo pedido (HTTP 200). |
| `order-pending` | `POST /api/orders` | Persiste estado `pending`; use `PATCH /__mocks/realtime/orders/:id` com `confirmed` ou `rejected` para emitir a transição determinística. |
| `payment-confirmed` | `POST /api/orders` | Confirma normalmente (comportamento explícito equivalente ao sucesso). |
| `payment-rejected` | `POST /api/orders` | Persiste estado terminal `rejected`, sem recibo, baixa de estoque ou remoção do carrinho. |

Para o timeout de pedido: autentique-se, solicite uma cotação em `POST /api/quotes`, configure `order-timeout-after-create` para `/api/orders` e envie o pedido. Embora a primeira resposta seja uma falha de rede, não gere outra chave: repetir exatamente o request e a chave recupera o pedido persistido.

## Transporte e limitações

As falhas, latências e respostas HTTP são simuladas no interceptor MSW antes dos handlers REST. O estado de negócio único é compartilhado por REST e realtime em `src/mocks/db`; no browser persiste em `localStorage` com chave versionada. Os testes MSW Node reinicializam o seed entre casos. O reset `empty` remove NFTs, mas mantém contas e recursos pessoais para autenticação.

O transporte de eventos usa `socket.io-client` e `@mswjs/socket.io-binding` no ambiente de mocks. O servidor mock não implementa toda a infraestrutura Socket.IO (incluindo rooms/namespaces e heartbeat); veja [docs/realtime.md](./realtime.md). Cenários REST e endpoints `/__mocks/realtime` compartilham banco, reset e emissão de eventos, permitindo reproduzir preço/estoque, estado pendente, duplicatas e desconexão.
