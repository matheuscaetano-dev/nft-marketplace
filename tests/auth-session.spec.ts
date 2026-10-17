import { expect, test } from '@playwright/test';
import { resetMockState } from './e2e-helpers';

test.beforeEach(async ({ page }) => {
  await resetMockState(page);
});

test('ignores external login redirect targets', async ({ page }) => {
  await page.goto('/login?redirect=https%3A%2F%2Fattacker.example');
  await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill('ada@kurio.test');
  await page.getByLabel('Senha', { exact: true }).fill('AdaDemo123!');
  await page.locator('main').getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/(?:\?.*)?$/);
});

test('login restores session on refresh, logout clears it, and private routes redirect', async ({ page, isMobile }) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill('ada@kurio.test');
  await page.getByLabel('Senha', { exact: true }).fill('WrongPassword123!');
  await page.locator('main').getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveValue('');

  await page.getByLabel('Senha', { exact: true }).fill('AdaDemo123!');
  await page.locator('main').getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/(?:\?.*)?$/);

  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Perfil do colecionador' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Perfil do colecionador' })).toBeVisible();

  await page.goto('/');
  if (isMobile) {
    await page.getByRole('button', { name: 'Sair da conta de Ada Colecionadora' }).click();
  } else {
    await page.getByRole('button', { name: 'Sair da conta de Ada Colecionadora' }).click();
  }
  await expect.poll(() => page.evaluate(() => localStorage.getItem('kurio-marketplace-session-v1')))
    .toBeNull();

  await page.goto('/wallets');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fwallets/);
  await expect(page.getByRole('heading', { name: 'Entrar na sua conta' })).toBeVisible();
});
