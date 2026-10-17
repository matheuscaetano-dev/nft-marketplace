import { expect, test, type Page } from '@playwright/test';

const demoEmail = 'ada@kurio.test';
const demoPassword = 'AdaDemo123!';

async function resetScenario(page: Page, scenario = 'success') {
  await page.goto('/');
  await page.getByRole('searchbox').waitFor();
  const response = await page.evaluate(async (selectedScenario) => {
    const result = await fetch('/__mocks/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: selectedScenario }),
    });
    return {
      ok: result.ok,
      status: result.status,
      isJson: result.headers.get('content-type')?.includes('application/json') ?? false,
    };
  }, scenario);
  expect(response.ok && response.isJson, `Mock reset did not reach MSW (HTTP ${response.status})`).toBeTruthy();
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill(demoEmail);
  await page.getByLabel('Senha', { exact: true }).fill(demoPassword);
  await page.locator('main').getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/(?:\?.*)?$/);
}

async function addFirstNft(page: Page) {
  await page.goto('/nft/1');
  await expect(page.getByRole('heading', { name: 'Emerald Ape #042' })).toBeVisible();
  await page.getByRole('button', { name: /^(COMPRAR|Comprar NFT)$/ }).click();
}

async function waitForRealtime(page: Page, expectedConnections = 1) {
  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch('/__mocks/realtime/status');
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return -1;
    return (await response.json() as { connections: number }).connections;
  }), { timeout: 10_000 }).toBe(expectedConnections);
}

async function updateListing(page: Page, priceEth: string, availableQuantity = 50) {
  const response = await page.evaluate(async ({ price, available }) => {
    const result = await fetch('/__mocks/realtime/nfts/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editionId: 'default', priceEth: price, availableQuantity: available }),
    });
    return { ok: result.ok, body: await result.json() };
  }, { price: priceEth, available: availableQuantity });
  expect(response.ok).toBeTruthy();
  return response.body as {
    version: number;
    priceEth: string;
    availableQuantity: number;
  };
}

test('updates a cart listing live and requires checkout quote reconfirmation', async ({ page }) => {
  await resetScenario(page);
  await login(page);
  await addFirstNft(page);
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Emerald Ape #042' }).first()).toBeVisible();
  await waitForRealtime(page);

  await updateListing(page, '0.99', 17);
  await expect(page.getByText(/preço atualizado para 0\.99 ETH/)).toBeVisible();
  await expect(page.getByText('0.99 ETH').first()).toBeVisible();

  await page.getByRole('link', { name: 'Conectar e finalizar' }).click();
  await expect(page.getByRole('heading', { name: 'Revisão do pedido' })).toBeVisible();
  await expect(page.getByText(/Revalide a cotação e confirme novamente/)).toBeVisible();
  await page.getByRole('button', { name: 'Simular conexão' }).click();
  await page.getByRole('button', { name: 'Revalidar e confirmar pedido' }).click();
  await expect(page.getByText(/A cotação foi atualizada\. Revise os valores e confirme novamente\./)).toBeVisible();
  await expect(page).toHaveURL(/\/payment$/);
  const status = await page.evaluate(async () => (await fetch('/__mocks/realtime/status')).json());
  expect((status as { orders: number }).orders).toBe(0);
});

test('ignores duplicate and old listing events without regressing cache values', async ({ page }) => {
  await resetScenario(page);
  await login(page);
  await addFirstNft(page);
  await page.goto('/cart');
  await waitForRealtime(page);

  const changed = await updateListing(page, '0.88', 12);
  await expect(page.getByText(/preço atualizado para 0\.88 ETH/)).toBeVisible();
  const duplicateResponse = await page.evaluate(async (event) => {
    const response = await fetch('/__mocks/realtime/emit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, duplicates: 2 }),
    });
    return response.ok;
  }, {
    eventId: `nft:1:v${changed.version}`,
    type: 'nft.updated',
    resource: {
      nftId: '1',
      editionId: 'default',
      priceEth: '0.88',
      availableQuantity: changed.availableQuantity,
    },
    version: changed.version,
  });
  expect(duplicateResponse).toBeTruthy();

  const oldResponse = await page.evaluate(async (version) => {
    const response = await fetch('/__mocks/realtime/emit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: {
          eventId: `nft:1:stale:${version}`,
          type: 'nft.updated',
          resource: { nftId: '1', editionId: 'default', priceEth: '0.01', availableQuantity: 0 },
          version,
        },
      }),
    });
    return response.ok;
  }, changed.version - 1);
  expect(oldResponse).toBeTruthy();
  await expect(page.getByText('0.88 ETH').first()).toBeVisible();
  await expect(page.getByText(/preço atualizado para 0\.01 ETH/)).toHaveCount(0);
});

test('recovers a pending order after socket interruption without creating another order', async ({ page }) => {
  await resetScenario(page, 'order-pending');
  await login(page);
  await addFirstNft(page);
  await page.goto('/payment');
  await expect(page.getByRole('heading', { name: 'Revisão do pedido' })).toBeVisible();
  await page.getByRole('button', { name: 'Simular conexão' }).click();
  await waitForRealtime(page);
  await page.getByRole('button', { name: 'Revalidar e confirmar pedido' }).click();

  await expect(page).toHaveURL(/\/order\/order-\d+$/);
  await expect(page.getByRole('heading', { name: 'Pedido em processamento' })).toBeVisible();
  const orderId = page.url().split('/').at(-1);
  expect(orderId).toBeTruthy();

  await page.evaluate(async () => fetch('/__mocks/realtime/disconnect', { method: 'POST' }));
  await waitForRealtime(page, 0);
  const resolved = await page.evaluate(async (id) => {
    const response = await fetch(`/__mocks/realtime/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'confirmed' }),
    });
    return response.ok;
  }, orderId);
  expect(resolved).toBeTruthy();

  await waitForRealtime(page);
  await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible();
  const status = await page.evaluate(async () => (await fetch('/__mocks/realtime/status')).json());
  expect((status as { orders: number }).orders).toBe(1);
});
