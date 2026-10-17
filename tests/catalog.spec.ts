import { expect, test, type Page } from '@playwright/test'
import { resetMockState } from './e2e-helpers'

test.beforeEach(async ({ page }) => {
  await resetMockState(page)
})

test('search, combine filters and restore catalog state through browser history', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: /^Ver detalhes de / })).toHaveCount(9)

  const mobileFilters = page.getByRole('button', { name: 'Mostrar filtros' })
  if (await mobileFilters.isVisible()) await mobileFilters.click()
  await page.getByRole('button', { name: 'Música' }).click()
  await page.getByRole('button', { name: 'Ethereum' }).click()
  await expect(page).toHaveURL(/collection=M%C3%BAsica/)
  await expect(page).toHaveURL(/network=Ethereum/)
  await expect(page).toHaveURL(/page=1/)
  await expect(page.getByRole('link', { name: /^Ver detalhes de / })).toHaveCount(2, { timeout: 15_000 })

  await page.getByRole('button', { name: 'Ethereum' }).click()
  await page.getByRole('button', { name: 'Música' }).click()
  await goToNextCatalogPage(page)
  await expect(page).toHaveURL(/page=2/)
  await page.goBack()
  await expect(page).toHaveURL(/page=1/)
  await page.goForward()
  await expect(page).toHaveURL(/page=2/)
  await page.reload()
  await expect(page).toHaveURL(/page=2/)

  await page.getByRole('searchbox').fill('Golden')
  await expect(page).toHaveURL(/q=Golden/)
  await expect(page.getByRole('link', { name: /^Ver detalhes de Golden/ }).first()).toBeVisible()
})

test('catalog sort and page state survive back, forward, and refresh', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Novos lançamentos' }).click()
  await expect(page).toHaveURL(/sort=newest/)
  await goToNextCatalogPage(page)
  await expect(page).toHaveURL(/page=2/)

  await page.goBack()
  await expect(page).toHaveURL(/sort=newest/)
  await expect(page).toHaveURL(/page=1/)
  await page.goForward()
  await expect(page).toHaveURL(/page=2/)
  await page.reload()
  await expect(page).toHaveURL(/sort=newest/)
  await expect(page).toHaveURL(/page=2/)
})

test('sort and pagination are represented by query parameters', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Novos lançamentos' }).click()
  await expect(page).toHaveURL(/sort=newest/)

  await goToNextCatalogPage(page)
  await expect(page).toHaveURL(/page=2/)
  await expect(page.getByRole('link', { name: /^Ver detalhes de / })).toHaveCount(9, { timeout: 15_000 })
})

test('empty searches show the empty state and recover when cleared', async ({ page }) => {
  await page.goto('/?q=an-item-that-does-not-exist')
  await expect(page.getByText('Nenhum NFT encontrado com esses filtros.')).toBeVisible()

  await page.getByRole('searchbox').fill('')
  await expect(page.getByRole('link', { name: /^Ver detalhes de / })).toHaveCount(9)
})

async function goToNextCatalogPage(page: Page) {
  const nextPage = page.getByRole('button', { name: 'Próxima página' })
  const mobileNavigation = page.getByRole('button', { name: 'Mostrar filtros' })

  if (await mobileNavigation.isVisible()) {
    await nextPage.focus()
    await nextPage.press('Enter')
    return
  }

  await nextPage.click()
}

test('direct NFT detail access works and missing NFT is handled', async ({ page }) => {
  await page.goto('/nft/1')
  await expect(page.getByRole('heading', { name: 'Emerald Ape #042' })).toBeVisible()

  await page.goto('/nft/not-a-real-nft')
  await expect(page.getByRole('heading', { name: 'NFT não encontrado' })).toBeVisible()
})
