# Política de cache e retry

## Chaves e isolamento

As chaves são criadas em `src/api/keys.ts`. Listagens incluem o objeto inteiro de parâmetros de busca; detalhes incluem o identificador. Toda chave de recurso privado inclui o identificador da conta autenticada antes do nome do recurso (`['private', userId, ...]`), para que respostas nunca sejam compartilhadas entre usuários.

## Frescor e descarte

| Dado | `staleTime` | `gcTime` | Atualização |
| --- | ---: | ---: | --- |
| Catálogo, detalhe NFT | 30 s | 5 min | Revalida ao reconectar; sem refetch automático ao focar janela |
| Favoritos, carrinho, perfil, carteiras | 0 (override por recurso privado) | 5 min | Invalidar após mutations; carregar sob chave por usuário |
| Cotação e pedido | 0 (override por dado de curta validade) | 5 min | Revalidar antes do envio/recuperação; invalidar em alterações relacionadas |
| Sessão | Gerida pelo store | Não persistida no Query cache | GET de sessão ao hidratar a aplicação |

O padrão global atual aplica 30 segundos para consultas de catálogo/detalhe. Recursos privados sensíveis devem passar `staleTime: 0` explicitamente nas queries. TanStack Query recebe `AbortSignal`; as funções de transporte passam o sinal ao Axios para cancelar respostas obsoletas.

Logout, troca de usuário e 401 cancelam queries em voo e limpam o QueryClient inteiro, incluindo dados privados e públicos. Não há persistência do Query cache no armazenamento local.

## Retry

Queries tentam novamente até duas vezes somente para falha de rede, HTTP 429 e HTTP 5xx, com backoff exponencial começando em 1 s e limitado a 30 s. Erros 4xx tipados nunca são repetidos. Mutations não têm retry automático: operações de escrita não devem duplicar ações sem contrato explícito de idempotência.

Criação de pedido usa uma chave `Idempotency-Key` estável na tentativa e o mesmo valor deve ser preservado ao recuperar timeout/repetir o envio. Não repetir mutations indiscriminadamente é deliberado; a recuperação é uma ação explícita com a chave original.
