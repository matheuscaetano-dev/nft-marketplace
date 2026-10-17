import { expect, test } from '@playwright/test'
import { loginAs, resetMockState } from './e2e-helpers'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2025-01-15T12:00:00.000Z'))
  await resetMockState(page)
})

for (const screen of ['home', 'detail', 'cart', 'payment'] as const) {
  test(`visual regression: ${screen}`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width: testInfo.project.name === 'chromium-mobile' ? 390 : 1440,
      height: testInfo.project.name === 'chromium-mobile' ? 844 : 900,
    })

    if (screen === 'detail') {
      await page.goto('/nft/1')
    } else if (screen === 'cart') {
      await page.goto('/nft/1')
      await page.getByRole('button', { name: /^(COMPRAR|Comprar NFT)$/ }).click()
      await page.goto('/cart')
    } else if (screen === 'payment') {
      await loginAs(page)
      await page.goto('/nft/1')
      await page.getByRole('button', { name: /^(COMPRAR|Comprar NFT)$/ }).click()
      await page.goto('/payment')
      await expect(page.getByRole('heading', { name: 'Revisão do pedido' })).toBeVisible()
    } else {
      await page.goto('/')
      await expect(page.getByRole('main').getByRole('heading').first()).toBeVisible()
    }

    if (screen === 'detail') {
      await expect(page.getByRole('heading', { name: 'Emerald Ape #042' })).toBeVisible()
    } else if (screen === 'cart') {
      await expect(page.getByRole('heading', { name: /Carrinho/ }).first()).toBeVisible()
    }

    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
          scroll-behavior: auto !important;
          caret-color: transparent !important;
        }
      `,
    })
    await page.evaluate(async () => {
      await document.fonts.ready
      const images = Array.from(document.images)
      for (const image of images) image.loading = 'eager'
      await Promise.all(images.map((image) => image.decode()))
    })
    await expect(page).toHaveScreenshot(`${screen}.png`, {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    })
  })
}
