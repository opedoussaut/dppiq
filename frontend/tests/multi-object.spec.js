import { test, expect } from '@playwright/test'

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
  'base64',
)

test('multi-object scan asks which product to investigate', async ({ page }) => {
  await page.route('**/api/scan/config', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route('**/api/model/provenance', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))

  await page.route('**/api/scan/fast-identify', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      elapsed_ms: 820,
      inference_ms: 710,
      identification: {
        status: 'identified',
        product_type: 'over-ear headphones',
        category: 'headphones',
        confidence: 0.96,
      },
      candidates: [
        { id: 'object-1', product_type: 'over-ear headphones', category: 'headphones', confidence: 0.96 },
        { id: 'object-2', product_type: 'smartphone', category: 'smartphone', confidence: 0.96 },
      ],
      description: 'Over-ear headphones and a smartphone.',
    }),
  }))

  let investigatedProduct = null
  await page.route('**/api/intelligence/investigate', async route => {
    const body = JSON.parse(route.request().postData() || '{}')
    investigatedProduct = body?.identification?.product_type || null
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        stage: 'investigation',
        status: 'completed',
        elapsed_ms: 80,
        degraded: false,
        investigation: {
          headline: 'Candidate regulations mapped',
          summary: 'Test investigation',
          findings: [],
          global_missing_evidence: [],
          _regiq: { agent_used: true },
        },
      }),
    })
  })

  await page.route('**/api/intelligence/verify', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      stage: 'verification',
      status: 'completed',
      elapsed_ms: 60,
      degraded: false,
      regulatory_profile: {
        status: 'agentic_assessment',
        headline: 'Regulatory dossier ready',
        summary: 'Test profile',
        regimes: [],
        missing_evidence: [],
        overall_confidence: 82,
        overall_confidence_label: 'medium',
      },
    }),
  }))

  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'two-products.png',
    mimeType: 'image/png',
    buffer: tinyPng,
  })

  const chooser = page.locator('#regiq-object-chooser')
  await expect(chooser).toBeVisible()
  await expect(chooser.getByText(/2 objects found/i)).toBeVisible()
  await expect(chooser.getByText('over-ear headphones', { exact: true })).toBeVisible()
  await expect(chooser.getByText('smartphone', { exact: true })).toBeVisible()

  await chooser.getByRole('button', { name: /smartphone/i }).click()

  await expect(chooser).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'smartphone', exact: true })).toBeVisible()
  expect(investigatedProduct).toBe('smartphone')
})
