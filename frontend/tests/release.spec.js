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
    model: '@cf/meta/llama-4-scout-17b-16e-instruct',
    fallback_model: '@cf/google/gemma-4-26b-a4b-it',
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

  test('unresolved recognition degrades gracefully without a technical error banner', async ({ page }) => {
    await page.route('**/api/scan/image', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        filename: 'ambiguous.png',
        content_type: 'image/png',
        identification: {
          status: 'unresolved',
          message: 'I could not identify this product reliably from this image. Try another angle, move closer, or photograph a label or model marking.',
          product_type: null,
          category: 'other',
          visual_evidence_confidence: 25,
          product_family_confidence: 0,
          exact_product_confidence: 0,
        },
        regulatory_profile: null,
        regulatory: { status: 'not_assessed' },
        discovery: { status: 'waiting_for_identification' },
      }),
    }))

    const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles({ name: 'ambiguous.png', mimeType: 'image/png', buffer: onePixelPng })
    await expect(page.getByRole('heading', { name: /product not identified/i })).toBeVisible()
    await expect(page.getByText(/try another angle/i)).toBeVisible()
    await expect(page.locator('.error')).toHaveCount(0)
    await assertNoHorizontalOverflow(page)
  })
})
