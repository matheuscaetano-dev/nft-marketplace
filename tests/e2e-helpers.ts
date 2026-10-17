import { expect, type Page } from '@playwright/test'

export async function resetMockState(page: Page, scenario = 'success') {
  await page.goto('/')
  await page.getByRole('main').first().waitFor()
  const response = await page.evaluate(async (selectedScenario) => {
    const result = await fetch('/__mocks/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: selectedScenario }),
    })
    return { ok: result.ok, status: result.status }
  }, scenario)
  expect(response.ok, `Mock reset failed with HTTP ${response.status}`).toBeTruthy()
}

export async function setMockScenario(page: Page, scenario: string, endpoint?: string) {
  const response = await page.evaluate(async ({ selectedScenario, selectedEndpoint }) => {
    const result = await fetch('/__mocks/scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario: selectedScenario,
        ...(selectedEndpoint ? { endpoint: selectedEndpoint } : {}),
      }),
    })
    return { ok: result.ok, status: result.status }
  }, { selectedScenario: scenario, selectedEndpoint: endpoint })
  expect(response.ok, `Could not select mock scenario (HTTP ${response.status})`).toBeTruthy()
}

export async function loginAs(page: Page, email = 'ada@kurio.test', password = 'AdaDemo123!') {
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(password)
  await page.locator('main').getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/(?:\?.*)?$/)
}
