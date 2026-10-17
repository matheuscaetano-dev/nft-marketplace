# API REST e eventos

Todas as rotas REST usam prefixo `/api`, JSON UTF-8 e erros no formato:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Revise os campos informados.",
  "fieldErrors": { "email": ["Informe um e-mail válido."] },
  "details": { "requestId": "req_demo" }
}
```

| HTTP | Códigos usuais | Significado |
| --- | --- | --- |
| 401 | `SESSION_INVALID`, `SESSION_EXPIRED` | Token ausente, inválido ou expirado |
| 403 | `FORBIDDEN` | Sessão válida sem permissão para o recurso |
| 404 | `NOT_FOUND` | Recurso inexistente |
| 409 | `AVAILABILITY_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `ACCOUNT_CONFLICT`, `QUOTE_STALE` | Conflito com o estado atual |
| 422 | `VALIDATION_ERROR`, `COUPON_INVALID`, `COUPON_EXPIRED` | Dados ou cupom inválidos |
| 503 | `TRANSIENT_FAILURE` | Falha transitória simulada |

ETH trafega como string decimal; quantidades são inteiros positivos. A autorização é simulada pelo bearer token `Authorization: Bearer <token>`. A chave de criação de pedido é enviada em `Idempotency-Key`.

## Sessão e conta

| Método e path | Request | Response | Erros específicos |
| --- | --- | --- | --- |
| `POST /api/auth/register` | `{ email, password, displayName, username, visitorId? }` | `{ user, session }` | 409 `ACCOUNT_CONFLICT`; 422 `VALIDATION_ERROR` |
| `POST /api/auth/login` | `{ email, password, visitorId? }` | `{ user, token, expiresAt }` | 401 `SESSION_INVALID`; 422 `VALIDATION_ERROR` |
| `GET /api/auth/session` | bearer token | `{ user, token, expiresAt }` | 401 `SESSION_INVALID`/`SESSION_EXPIRED` |
| `POST /api/auth/logout` | bearer token | `{ loggedOut: true }` | 401 `SESSION_INVALID` |
| `POST /api/auth/expire` | bearer token; somente mock | `{ expired: true }` | 401 `SESSION_INVALID` |

## Catálogo e favoritos

| Método e path | Request | Response | Erros específicos |
| --- | --- | --- | --- |
| `GET /api/nfts` | `q`, `collection`, `network`, `minPrice`, `maxPrice`, `sort`, `page`, `limit` | `{ data, total, page, limit }` | 503 `TRANSIENT_FAILURE` |
| `GET /api/nfts/:id` | ID na rota | NFT | 404 `NOT_FOUND` |
| `GET /api/favorites` | bearer token | `{ nftIds: string[] }` | 401 |
| `PUT /api/favorites/:nftId` | bearer token | `{ nftIds }` | 401; 404 |
| `DELETE /api/favorites/:nftId` | bearer token | `{ nftIds }` | 401 |

`GET /api/nfts` usa `minPrice`/`maxPrice` em centésimos de ETH por compatibilidade com o slider atual. A query seleciona os dados antes da paginação.

## Carrinho e cotação

Uma linha usa `{ nftId, editionId, quantity }`. `editionId` identifica a edição selecionada; `quantity` é inteiro positivo limitado ao estoque.

| Método e path | Request | Response | Erros específicos |
| --- | --- | --- | --- |
| `GET /api/cart` | bearer token | `{ items, version }` | 401 |
| `GET /api/cart/visitor/:visitorId` | visitante | `{ items, version }` | — |
| `POST /api/cart/visitor/:visitorId/items` | linha | `{ items, version }` | 404; 409 `AVAILABILITY_CONFLICT`; 422 |
| `POST /api/cart/items` | linha | `{ items, version }` | 401; 404; 409 `AVAILABILITY_CONFLICT`; 422 |
| `PATCH /api/cart/items/:nftId/:editionId` | `{ quantity }` | `{ items, version }` | 401; 404; 409 `AVAILABILITY_CONFLICT`; 422 |
| `DELETE /api/cart/items/:nftId/:editionId` | — | `{ items, version }` | 401 |
| `POST /api/cart/merge` | `{ visitorId, items }` | `{ items, version }` | 401; 404; 409 `AVAILABILITY_CONFLICT`; 422 |
| `POST /api/quotes` | `{ items, couponCode? }` | cotação | 401; 409 `AVAILABILITY_CONFLICT`; 422 `COUPON_INVALID`/`COUPON_EXPIRED` |

A cotação inclui `quoteId`, `version`, disponibilidade por linha, `subtotalEth`, `discountEth`, `networkFeeEth`, `totalEth`, estado do cupom e `validUntil`. Os valores são strings decimais. Cupom não aplicado usa `couponStatus: "not-applied"`. Cupom inválido ou expirado é reportado como `couponStatus` correspondente na resposta normal; cenários dedicados também podem simular os erros HTTP 422 `COUPON_INVALID` e `COUPON_EXPIRED`.

## Pedidos

| Método e path | Request | Response | Erros específicos |
| --- | --- | --- | --- |
| `POST /api/orders` | `Idempotency-Key` + `{ quoteId, items, walletId, network }` | pedido | 401; 404; 409 `IDEMPOTENCY_CONFLICT`, `QUOTE_STALE` ou `AVAILABILITY_CONFLICT`; 422; 503 |
| `GET /api/orders/:orderId` | bearer token | pedido e recibo snapshot | 401; 404 |

Estados: `pending`, `confirmed`, `rejected`; os dois últimos são terminais. Repetir uma chave com o mesmo conteúdo recupera o mesmo pedido; conteúdo diferente conflita. O recibo copia itens, preços, subtotal, desconto, taxa, total, rede e referência de transação simulada no momento da confirmação.

## Perfil e carteiras

| Método e path | Request | Response | Erros específicos |
| --- | --- | --- | --- |
| `GET /api/profile` | bearer token | perfil | 401 |
| `PATCH /api/profile` | campos de perfil/avatar | perfil | 401; 409; 422 |
| `PUT /api/profile/password` | `{ currentPassword, newPassword }` | `{ changed: true }` | 401; 422 |
| `GET /api/wallets` | bearer token | `{ wallets }` | 401 |
| `POST /api/wallets` | `{ nickname, address, network, provider, role }` | carteira | 401; 409; 422 |
| `PATCH /api/wallets/:walletId` | campos alteráveis da carteira | carteira | 401; 403; 404; 409; 422 |

## Eventos

Os contratos TypeScript de evento estão em `src/contracts/api.ts`. `nft.updated` contém `eventId`, `resource.nftId`, edição, preço/disponibilidade e `version`. `order.updated` contém `eventId`, `resource.orderId`, estado e `version`. Transporte, política de deduplicação e reconciliação estão descritos em [realtime.md](./realtime.md).
