# Tempo real

O cliente usa `socket.io-client` com transporte WebSocket; no ambiente de desenvolvimento, o canal é interceptado pelo MSW e adaptado pelo `@mswjs/socket.io-binding`. Os endpoints em `/__mocks/realtime` permitem alterar anúncios, resolver pedidos pendentes, injetar eventos de teste e interromper conexões de forma determinística. Esse servidor é apenas um mock local: não implementa toda a API Socket.IO (incluindo rooms/namespaces e heartbeat) nem substitui a infraestrutura Socket.IO de produção.

Eventos usam `eventId` estável por recurso e versão monotônica. O cliente descarta IDs repetidos e versões menores ou iguais às aplicadas; pedidos confirmados ou recusados são terminais.

Ao reconectar, as queries ativas de catálogo, detalhe, carrinho, cotação e pedido pendente são invalidadas e reconciliadas via REST. Alterações de anúncio também invalidam cotação/carrinho; o checkout revalida os valores e exige confirmação novamente antes de criar o pedido.
