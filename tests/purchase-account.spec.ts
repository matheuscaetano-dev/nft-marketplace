import { expect, test, type Page } from '@playwright/test';

const demoEmail = 'ada@kurio.test';
const demoPassword = 'AdaDemo123!';

async function resetScenario(page: Page, scenario = 'success') {
  await page.goto('/');
  await page.getByRole('searchbox').waitFor();
  const reset = await page.evaluate(async (selectedScenario) => {
    const response = await fetch('/__mocks/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: selectedScenario }),
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  }, scenario);
  expect(reset.ok, `Reset failed: HTTP ${reset.status} ${reset.body}`).toBeTruthy();
  expect(reset.body).toContain(scenario);
  const activeScenario = await page.evaluate(async () => (await fetch('/__mocks/scenario')).text());
  expect(activeScenario).toBe(JSON.stringify({ selection: { name: scenario } }));
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
  const buy = page.getByRole('button', { name: /^(COMPRAR|Comprar NFT)$/ });
  await buy.click();
}

async function startCheckout(page: Page) {
  await page.goto('/payment');
  await expect(page.getByRole('heading', { name: 'Revisão do pedido' })).toBeVisible();
  await page.getByRole('button', { name: 'Simular conexão' }).click();
}

test('completes a simulated purchase and renders the immutable receipt', async ({ page }) => {
  await resetScenario(page);
  await login(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Ver detalhes de Emerald Ape #042' }).click();
  await expect(page.getByRole('heading', { name: 'Emerald Ape #042' })).toBeVisible();
  await page.getByRole('button', { name: /^(COMPRAR|Comprar NFT)$/ }).click();
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Emerald Ape #042' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Conectar e finalizar' }).click();
  await expect(page.getByRole('heading', { name: 'Revisão do pedido' })).toBeVisible();
  await page.getByRole('button', { name: 'Simular conexão' }).click();
  await page.getByRole('button', { name: 'Revalidar e confirmar pedido' }).click();

  await expect(page).toHaveURL(/\/order\/order-\d+$/);
  await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible();
  await expect(page.getByText('Emerald Ape #042 × 1')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver transação simulada' })).toHaveAttribute('href', /explorer\.kurio\.test/);

  await page.goto('/cart');
  await expect(page.getByText('Seu carrinho está vazio.')).toBeVisible();
});

test('keeps cart items after a simulated payment rejection', async ({ page }) => {
  await resetScenario(page, 'payment-rejected');
  await login(page);
  await addFirstNft(page);
  await startCheckout(page);
  await page.getByRole('button', { name: 'Revalidar e confirmar pedido' }).click();

  await expect(page).toHaveURL(/\/order\/order-\d+$/);
  await expect(page.getByRole('heading', { name: 'Pagamento recusado' })).toBeVisible();
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Emerald Ape #042' }).first()).toBeVisible();
});

test('recovers a timeout with the same idempotency attempt after refresh', async ({ page }) => {
  await resetScenario(page, 'order-timeout-after-create');
  await login(page);
  await addFirstNft(page);
  await startCheckout(page);
  await page.getByRole('button', { name: 'Revalidar e confirmar pedido' }).click();
  await expect(page.getByText(/mesma chave, sem duplicação/)).toBeVisible();
  await page.reload();
  const resume = page.getByRole('button', { name: 'Retomar pedido com segurança' });
  await expect(resume).toBeEnabled();
  await resume.click();

  await expect(page).toHaveURL(/\/order\/order-\d+$/);
  await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible();
});

test('preserves checkout context through an expired session and login', async ({ page }) => {
  await resetScenario(page);
  await login(page);
  await addFirstNft(page);
  const configured = await page.evaluate(async () => {
    const response = await fetch('/__mocks/scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'session-expired', endpoint: '/api/profile' }),
    });
    return response.ok;
  });
  expect(configured).toBeTruthy();
  await page.goto('/payment');
  await expect(page).toHaveURL(/\/login\?.*context=checkout.*reason=session-expired/);
  await expect(page.getByText(/Sua sessão expirou/)).toBeVisible();

  await page.evaluate(async () => {
    await fetch('/__mocks/scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'success', endpoint: '/api/profile' }),
    });
  });
  await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill(demoEmail);
  await page.getByLabel('Senha', { exact: true }).fill(demoPassword);
  await page.locator('main').getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/payment$/);
  await expect(page.getByRole('heading', { name: 'Revisão do pedido' })).toBeVisible();
});

test('persists profile and wallet edits after a refresh', async ({ page }) => {
  await resetScenario(page);
  await login(page);

  await page.goto('/profile');
  await page.getByLabel('Nome de exibição').fill('Ada Colecionadora Atualizada');
  await page.getByRole('button', { name: 'Salvar perfil' }).click();
  await expect(page.getByRole('status')).toContainText('Perfil atualizado');
  await page.reload();
  await expect(page.getByLabel('Nome de exibição')).toHaveValue('Ada Colecionadora Atualizada');

  await page.goto('/wallets');
  const primaryForm = page.locator('form').first();
  await primaryForm.getByLabel('Apelido da carteira').fill('Vault principal');
  await primaryForm.getByRole('button', { name: 'Atualizar carteira principal' }).click();
  await expect(page.getByRole('status')).toContainText('Carteira principal salva');
  await page.reload();
  await expect(page.locator('form').first().getByLabel('Apelido da carteira')).toHaveValue('Vault principal');
});

test('registers an account and merges the visitor cart', async ({ page }) => {
  await resetScenario(page);
  await addFirstNft(page);
  await page.goto('/register?redirect=%2Fcart');
  await page.getByLabel('Nome', { exact: true }).fill('Nova Colecionadora');
  await page.getByLabel('Nome de usuário', { exact: true }).fill('nova-coleciona');
  await page.getByLabel('E-mail', { exact: true }).fill('nova@kurio.test');
  await page.getByLabel('Senha', { exact: true }).fill('NovaDemo123!');
  await page.locator('main').getByRole('button', { name: 'Criar conta' }).click();

  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole('heading', { name: 'Carrinho' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Emerald Ape #042' }).first()).toBeVisible();
  await page.goto('/profile');
  await expect(page.getByLabel('Nome de exibição')).toHaveValue('Nova Colecionadora');
});

test('shows API field errors for a conflicting registration', async ({ page }) => {
  await resetScenario(page);
  await page.goto('/register');
  await page.getByLabel('Nome', { exact: true }).fill('Outra Ada');
  await page.getByLabel('Nome de usuário', { exact: true }).fill('outra-ada');
  await page.getByLabel('E-mail', { exact: true }).fill(demoEmail);
  await page.getByLabel('Senha', { exact: true }).fill('OutraDemo123!');
  await page.locator('main').getByRole('button', { name: 'Criar conta' }).click();

  await expect(page.getByRole('alert')).toContainText('Já existe uma conta');
  await expect(page.getByText('Este e-mail já está cadastrado.')).toBeVisible();
  await expect(page.locator('#register-email')).toHaveAttribute('aria-invalid', 'true');
});

test('validates invalid, expired and applicable cart coupons through quotes', async ({ page }) => {
  await resetScenario(page);
  await login(page);
  await addFirstNft(page);
  await page.goto('/cart');
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  const input = page.locator(viewportWidth >= 1024 ? '#promo-code' : '#mobile-promo-code');
  await expect(input).toBeVisible();
  const form = input.locator('xpath=ancestor::form');

  for (const [scenario, code, message] of [
    ['coupon-invalid', 'INVALID', 'Cupom inválido (cenário simulado).'],
    ['coupon-expired', 'EXPIRED', 'Cupom expirado (cenário simulado).'],
  ]) {
    const configured = await page.evaluate(async (selectedScenario) => {
      const response = await fetch('/__mocks/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: selectedScenario, endpoint: '/api/quotes' }),
      });
      return response.ok;
    }, scenario);
    expect(configured).toBeTruthy();
    await input.fill(code);
    await form.getByRole('button', { name: 'Aplicar' }).click();
    await expect(form.getByRole('status')).toContainText(message);
  }

  await page.evaluate(async () => {
    await fetch('/__mocks/scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'success', endpoint: '/api/quotes' }),
    });
  });
  await input.fill('KURIO10');
  await form.getByRole('button', { name: 'Aplicar' }).click();
  await expect(form.getByRole('status')).toContainText('Cupom KURIO10 aplicado.');
});

test('submits only one order when confirmation is clicked repeatedly', async ({ page }) => {
  await resetScenario(page);
  await login(page);
  await addFirstNft(page);
  await startCheckout(page);
  let orderRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/orders') {
      orderRequests += 1;
    }
  });
  await page.getByRole('button', { name: 'Revalidar e confirmar pedido' }).evaluate((button) => {
    button.click();
    button.click();
  });

  await expect(page).toHaveURL(/\/order\/order-\d+$/);
  await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toBeVisible();
  expect(orderRequests).toBe(1);
});

test('associates profile conflict errors with the affected field', async ({ page }) => {
  await resetScenario(page);
  await login(page);
  await page.goto('/profile');
  const emailInput = page.locator('#profile-email');
  await expect(emailInput).toBeVisible();
  await emailInput.fill('bruno@kurio.test');
  await page.getByRole('button', { name: 'Salvar perfil' }).click();

  await expect(page.getByRole('status')).toContainText('O e-mail ou nome de usuário já está em uso.');
  await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Este e-mail já está cadastrado.')).toBeVisible();
});

test('keeps account and purchase screens within 390, 768 and 1440px viewports', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Runs once across all required viewport widths.');
  test.setTimeout(120_000);
  await resetScenario(page);
  await login(page);
  await addFirstNft(page);
  await startCheckout(page);
  await page.getByRole('button', { name: 'Revalidar e confirmar pedido' }).click();
  await expect(page).toHaveURL(/\/order\/order-\d+$/);
  const orderPath = new URL(page.url()).pathname;

  const overflows: string[] = [];
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/nft/1', '/cart', '/payment', '/profile', '/wallets', orderPath]) {
      await page.goto(route);
      await page.getByRole('main').first().waitFor();
      await page.waitForTimeout(100);
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (hasOverflow) {
        const offenders = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('body *'))
          .map((element) => ({ element, bounds: element.getBoundingClientRect() }))
          .filter(({ bounds }) => bounds.right > window.innerWidth + 1 || bounds.left < -1)
          .slice(0, 5)
          .map(({ element, bounds }) => `${element.tagName}.${element.className} (${Math.round(bounds.left)}-${Math.round(bounds.right)})`)
          .join('; '));
        overflows.push(`${width}px ${route}: ${offenders}`);
      }
    }
  }
  expect(overflows).toEqual([]);
});
