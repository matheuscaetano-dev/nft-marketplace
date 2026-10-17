import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '../src/api/keys';
import { clearQueryClient } from '../src/api/query-client';

describe('query cache isolation and lifecycle', () => {
  it('keys private resources by user and lists by all query parameters', () => {
    expect(queryKeys.favorites('user-ada')).not.toEqual(queryKeys.favorites('user-bruno'));
    expect(queryKeys.cart('user-ada')).not.toEqual(queryKeys.cart('user-bruno'));
    expect(queryKeys.nftList({ q: 'ape', page: 1 }))
      .not.toEqual(queryKeys.nftList({ q: 'ape', page: 2 }));
  });

  it('cancels and clears the cache on account changes', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.favorites('user-ada'), { nftIds: ['1'] });
    client.setQueryData(queryKeys.favorites('user-bruno'), { nftIds: ['2'] });
    await clearQueryClient(client);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
