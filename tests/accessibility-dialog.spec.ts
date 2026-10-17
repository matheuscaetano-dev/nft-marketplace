import { expect, test } from '@playwright/test'

test('keeps keyboard focus in the authentication dialog and restores the opener', async ({ page }) => {
  await page.goto('/tests/fixtures/auth-dialog.html')
  const opener = page.getByRole('button', { name: 'Open dialog' })
  await opener.click()

  const dialog = page.getByRole('dialog', { name: 'Entrar' })
  const email = dialog.getByRole('textbox', { name: 'E-mail' })
  await expect(email).toBeFocused()

  await page.evaluate(() => {
    const dialogElement = document.querySelector<HTMLElement>('[role="dialog"]')
    const focusable = Array.from(dialogElement?.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => element.getClientRects().length > 0)
    focusable[0]?.focus()
  })
  await page.keyboard.press('Shift+Tab')
  await expect.poll(() => page.evaluate(() => {
    const dialogElement = document.querySelector<HTMLElement>('[role="dialog"]')
    const focusable = Array.from(dialogElement?.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => element.getClientRects().length > 0)
    return document.activeElement === focusable.at(-1)
  })).toBe(true)

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})
