import { test, expect } from '@playwright/test'

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

async function assertGrayCanvas(page) {
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).not.toBe('rgb(255, 255, 255)')
}

const publicConfig = {
  vision: {
    enabled: true,
    provider: 'cloudflare-workers-ai',
    model: '@cf/google/gemma-4-26b-a4b-it',
    server_token_configured: true,
    byo_hf_token_enabled: false,
  },
  regulation_agents: {
    enabled: true,
    provider: 'cloudflare-workers-ai',
    investigator_model: '@cf/zai-org/glm-4.7-flash',
    verifier_model: '@cf/zai-org/glm-4.7-flash',
    server_token_configured: true,
    byo_token_enabled: false,
  },
}

test.describe('REGIQ release smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/scan/config', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(publicConfig),
    }))
    await page.route('**/api/model/provenance', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        hosting: { provider: 'cloudflare-workers', mode: 'free-tier-public-demo' },
        vision: publicConfig.vision,
        regulation_agents: publicConfig.regulation_agents,
      }),
    }))
    await page.goto('/')
  })

  test('scan shell is visually complete and usable', async ({ page }) => {
    await expect(page.getByText('REGIQ', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /use camera/i })).toBeVisible()
    await expect(page.getByText(/upload image/i)).toBeVisible()
    await expect(page.getByText(/the signal, not the dossier/i)).toBeVisible()
    await assertGrayCanvas(page)
    await assertNoHorizontalOverflow(page)
  })

  test('navigation works without layout overflow', async ({ page }) => {
    const menu = page.locator('.os-mobile-menu')
    if (await menu.isVisible()) await menu.click()
    await page.getByRole('button', { name: 'Intelligence', exact: true }).click()
    await expect(page.getByRole('heading', { name: /no dossier yet/i })).toBeVisible()
    await expect(page.getByText(/regiq intelligence/i)).toBeVisible()
    await assertNoHorizontalOverflow(page)

    if (await menu.isVisible()) await menu.click()
    await page.getByRole('button', { name: /history/i }).click()
    await expect(page.getByText(/your regulation trail/i)).toBeVisible()
    await assertNoHorizontalOverflow(page)
  })

  test('capture card stays inside phone viewport', async ({ page }) => {
    const card = page.locator('.os-capture-card').first()
    await expect(card).toBeVisible()
    const box = await card.boundingBox()
    const viewport = page.viewportSize()
    expect(box).not.toBeNull()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(box.height).toBeGreaterThan(300)
    await assertNoHorizontalOverflow(page)
  })

  test('public setup is ready without asking visitors for a token', async ({ page }) => {
    const menu = page.locator('.os-mobile-menu')
    if (await menu.isVisible()) await menu.click()
    await page.getByRole('button', { name: /setup/i }).click()
    await expect(page.getByRole('heading', { name: /host credentials are ready/i })).toBeVisible()
    await expect(page.locator('input[placeholder="hf_…"]')).toHaveCount(0)
    await assertNoHorizontalOverflow(page)
  })
})