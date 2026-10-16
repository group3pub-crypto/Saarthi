import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('SAARTHI Access - Auditor & Verification Portal', () => {
  test('Auditor can sign in, review field assignments, and save offline audit', async ({ page }) => {
    await page.goto('/auditor')

    // Verify Login Screen
    await expect(page.getByRole('heading', { name: /Staff & Auditor Portal/i })).toBeVisible()

    // Sign in as auditor
    await page.locator('#staff-email').fill('auditor@saarthi.local')
    await page.locator('#staff-password').fill('AuditorPass123!')
    await page.getByRole('button', { name: /Sign In to Portal/i }).click()

    // Verify Dashboard loads with role badge
    await expect(page.getByRole('heading', { name: /Field Auditor & Verifier Console/i })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('auditor', { exact: true })).toBeVisible()

    // Check Offline Sync Bar
    await expect(page.getByText(/Offline Audit Queue/i)).toBeVisible()

    // Check Priority Field Assignments
    await expect(page.getByRole('heading', { name: /Priority Field Assignments in Pune/i })).toBeVisible()
    const assignmentCards = page.locator('.saarthi-card button:has-text("Start Field Audit")')
    await expect(assignmentCards.first()).toBeVisible({ timeout: 10000 })

    // Click "Start Field Audit" to open checklist form
    await assignmentCards.first().click()

    // Verify Checklist Form tab active
    await expect(page.getByRole('heading', { name: /Field Audit Checklist Form/i })).toBeVisible()

    // Enter audit measurements
    await page.locator('#feature-name-input').fill('West Wing Accessible Ramp Entrance')
    const notesInput = page.locator('#audit-notes')
    await notesInput.fill('Audited zero entrance steps with 1:12 slope ramp and bilateral grab rails.')

    // Save audit to offline IndexedDB queue
    await page.getByRole('button', { name: /Save Audit to Offline Queue/i }).click()

    // Verify local storage update message
    await expect(page.getByText(/recorded locally in IndexedDB queue/i)).toBeVisible()
    await expect(page.getByText(/Offline Audit Queue: 1 pending/i)).toBeVisible()

    // Test Training Mode Toggle
    const trainingBtn = page.getByRole('button', { name: /Training Mode/i })
    await trainingBtn.click()
    await expect(trainingBtn).toHaveAttribute('aria-pressed', 'true')
    await trainingBtn.click()
    await expect(trainingBtn).toHaveAttribute('aria-pressed', 'false')
  })

  test('Axe accessibility scan reports zero critical or serious WCAG 2.2 AA violations on Auditor Console', async ({ page }) => {
    await page.goto('/auditor')

    // Sign in as auditor
    await page.locator('#staff-email').fill('auditor@saarthi.local')
    await page.locator('#staff-password').fill('AuditorPass123!')
    await page.getByRole('button', { name: /Sign In to Portal/i }).click()
    await expect(page.getByRole('heading', { name: /Field Auditor & Verifier Console/i })).toBeVisible({ timeout: 10000 })

    await page.waitForLoadState('networkidle')

    const scanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze()

    const criticalOrSerious = scanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    )

    expect(criticalOrSerious).toEqual([])
  })
})
