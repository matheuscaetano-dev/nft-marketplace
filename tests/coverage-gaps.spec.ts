import { expect, test } from '@playwright/test'
import { loginAs, resetMockState, setMockScenario } from './e2e-helpers'

test.beforeEach(async ({ page }) => {
  await resetMockState(page)
})

test('rolls back a failed favorite mutation and accepts a later retry', async ({ page }) => {
  await loginAs(page)
  await page.goto('/nft/1')
  const favorite = page.locator('button[aria-pressed]:not([aria-label^="Página"]):visible')
  await expect(favorite).toBeVisible()

  await setMockScenario(page, 'http-5xx', '/api/favorites')
  await favorite.click()
  await expect(page.getByRole('status')).toContainText('Falha HTTP 5xx simulada.')
  await expect(favorite).toHaveAttribute('aria-pressed', 'false')

  await setMockScenario(page, 'success', '/api/favorites')
  await favorite.click()
  await expect(favorite).toHaveAttribute('aria-pressed', 'true')
})

test('keeps visitor cart quantity through refresh and account login, then removes the item', async ({ page }) => {
  await page.goto('/nft/1')
  await expect(page.getByRole('heading', { name: 'Emerald Ape #042' })).toBeVisible()
  await page.getByRole('button', { name: 'Aumentar quantidade' }).first().click()
  await page.getByRole('button', { name: /^(COMPRAR|Comprar NFT)$/ }).click()

  await page.goto('/cart')
  const visibleCartItem = page.locator('article:visible').filter({ hasText: 'Emerald Ape #042' })
  await expect(visibleCartItem.getByRole('button', { name: 'Aumentar Emerald Ape #042' })).toBeVisible()
  await expect(visibleCartItem.getByText('2', { exact: true })).toBeVisible()
  await page.reload()
  const reloadedItem = page.locator('article:visible').filter({ hasText: 'Emerald Ape #042' })
  await expect(reloadedItem.getByRole('button', { name: 'Aumentar Emerald Ape #042' })).toBeVisible()
  await expect(reloadedItem.getByText('2', { exact: true })).toBeVisible()

  await loginAs(page)
  await page.goto('/cart')
  const authenticatedItem = page.locator('article:visible').filter({ hasText: 'Emerald Ape #042' })
  await expect(authenticatedItem.getByRole('heading', { name: 'Emerald Ape #042' })).toBeVisible()
  await expect(authenticatedItem.getByText('2', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Diminuir Emerald Ape #042' }).click()
  await expect(authenticatedItem.getByText('1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Remover Emerald Ape #042' }).click()
  await expect(page.getByText('Seu carrinho está vazio.')).toBeVisible()
})

test('switches accounts without exposing the previous account profile, favorites, or cart', async ({ page }) => {
  await loginAs(page)
  await page.goto('/nft/1')
  const favorite = page.locator('button[aria-pressed]:not([aria-label^="Página"]):visible')
  await favorite.click()
  await expect(favorite).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /^(COMPRAR|Comprar NFT)$/ }).click()

  await page.goto('/')
  await page.getByRole('button', { name: 'Sair da conta de Ada Colecionadora' }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('kurio-marketplace-session-v1'))).toBeNull()
  await loginAs(page, 'bruno@kurio.test', 'BrunoDemo123!')

  await page.goto('/profile')
  await expect(page.getByLabel('Nome de exibição')).toHaveValue('Bruno Artista')
  await page.goto('/cart')
  await expect(page.getByText('Seu carrinho está vazio.')).toBeVisible()
  await page.goto('/nft/1')
  await expect(page.locator('button[aria-pressed]:not([aria-label^="Página"]):visible')).toHaveAttribute('aria-pressed', 'false')
})

test('validates avatar, password, and wallet forms with accessible feedback', async ({ page }) => {
  await loginAs(page)
  await page.goto('/profile')

  await page.getByLabel('Selecionar avatar').setInputFiles({
    name: 'not-an-image.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('invalid avatar'),
  })
  await expect(page.getByRole('status')).toContainText('Escolha PNG, JPEG, WebP ou GIF de até 1 MB.')
  await page.getByLabel('Selecionar avatar').setInputFiles({
    name: 'avatar.svg',
    mimeType: 'image/png',
    buffer: Buffer.from('invalid avatar'),
  })
  await expect(page.getByRole('status')).toContainText('Escolha PNG, JPEG, WebP ou GIF de até 1 MB.')

  await page.getByLabel('Senha atual').fill('AdaDemo123!')
  await page.locator('#profile-newPassword').fill('NewPassword123!')
  await page.locator('#profile-password-confirm').fill('DifferentPassword123!')
  await page.getByRole('button', { name: 'Alterar senha' }).click()
  await expect(page.getByText('A nova senha e a confirmação estão diferentes.')).toBeVisible()
  await expect(page.locator('#profile-password-confirm')).toBeFocused()
  await page.getByLabel('Senha atual').fill('WrongPassword123!')
  await page.locator('#profile-newPassword').fill('NewPassword123!')
  await page.locator('#profile-password-confirm').fill('NewPassword123!')
  await page.getByRole('button', { name: 'Alterar senha' }).click()
  await expect(page.getByRole('status')).toContainText('A senha atual está incorreta.')
  await expect(page.getByLabel('Senha atual')).toHaveValue('')
  await expect(page.locator('#profile-newPassword')).toHaveValue('')
  await expect(page.locator('#profile-password-confirm')).toHaveValue('')

  await page.goto('/wallets')
  const secondaryNickname = page.locator('input[id^="wallet-nickname"]').nth(1)
  await secondaryNickname.fill('')
  await page.getByRole('button', { name: 'Atualizar carteira secundária' }).click()
  await expect(secondaryNickname).toBeFocused()

  await setMockScenario(page, 'http-5xx', '/api/wallets')
  await page.getByRole('button', { name: 'Atualizar carteira principal' }).click()
  await expect(page.getByRole('status')).toContainText('Falha HTTP 5xx simulada.')
})

test('supports keyboard navigation and focuses invalid registration fields', async ({ page }) => {
  await page.goto('/register')
  const name = page.getByLabel('Nome', { exact: true })
  const username = page.getByLabel('Nome de usuário', { exact: true })
  await name.focus()
  await page.keyboard.press('Tab')
  await expect(username).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(name).toBeFocused()

  await page.locator('main').getByRole('button', { name: 'Criar conta' }).click()
  await expect(name).toBeFocused()
})

test('shows a slow-load skeleton and recovers from a failed catalog request', async ({ page }) => {
  await setMockScenario(page, 'slow', '/api/nfts/1')
  await page.goto('/nft/1')
  await expect(page.getByRole('status', { name: 'Carregando NFT' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Emerald Ape #042' })).toBeVisible({ timeout: 10_000 })

  await setMockScenario(page, 'network-error', '/api/nfts')
  await page.goto('/?q=retry-after-network-error')
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar')
  await setMockScenario(page, 'success', '/api/nfts')
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(page.getByText('Nenhum NFT encontrado com esses filtros.')).toBeVisible()
})
