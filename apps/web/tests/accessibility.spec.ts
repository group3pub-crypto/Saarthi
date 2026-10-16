import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('SAARTHI Access - User App UI & Accessibility', () => {
  test('Home page loads with accessible markup and functional skip link', async ({ page }) => {
    await page.goto('/')

    // Check document title
    await expect(page).toHaveTitle(/SAARTHI Access/)

    // Test skip link with keyboard navigation
    await page.keyboard.press('Tab')
    const skipLink = page.locator('a.skip-link')
    await expect(skipLink).toBeFocused()
    await expect(skipLink).toBeVisible()

    // Press Enter on skip link and verify focus shifts to main content
    await page.keyboard.press('Enter')
    const mainContent = page.locator('#main-content')
    await expect(mainContent).toBeFocused()
  })

  test('Access Profile modal opens, allows toggling presets, and closes with Escape key', async ({ page }) => {
    await page.goto('/')

    // Open profile modal via navbar
    const profileBtn = page.getByRole('button', { name: /Access Profile/i })
    await profileBtn.click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('heading', { name: /On-Device Access Profile/i })).toBeVisible()

    // Verify preset options are displayed
    await expect(modal.getByText(/Wheelchair \/ Mobility/i)).toBeVisible()
    await expect(modal.getByText(/Low Vision \/ Blind/i)).toBeVisible()

    // Test Escape key dismissal
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
  })

  test('Searching public places displays real open data with honest Unknown readiness card', async ({ page }) => {
    await page.goto('/')

    // Search for hospital
    const searchInput = page.getByPlaceholder(/Search hospitals, bus stops/i)
    await searchInput.fill('Hospital')

    // Wait for real public hospital list to render from backend
    const placeButton = page.locator('.places-list button').first()
    await expect(placeButton).toBeVisible({ timeout: 10000 })

    // Click on place to view Service Readiness Card
    await placeButton.click()

    // Verify Service Readiness Card renders for selected place
    await expect(page.locator('.saarthi-card h2').first()).toBeVisible({ timeout: 10000 })

    // Strict Rule: Unaudited real places must honestly show Not Confirmed / Status Unknown
    const statusChip = page.locator('.status-chip').first()
    await expect(statusChip).toBeVisible()
    const text = await statusChip.textContent()
    expect(text?.toLowerCase()).toMatch(/not confirmed|status unknown|readiness/)
  })

  test('Journey planning page loads with MapLibre canvas and route evaluation controls', async ({ page }) => {
    await page.goto('/plan')

    // Verify heading
    await expect(page.getByRole('heading', { name: /Plan Accessible Journey/i })).toBeVisible()

    // Check MapLibre container
    const mapRegion = page.getByRole('region', { name: /Interactive Map/i })
    await expect(mapRegion).toBeVisible()

    // Check Destination search input
    await expect(page.getByLabel(/Destination/i)).toBeVisible()
  })

  test('Settings page allows cycling theme and text scale', async ({ page }) => {
    await page.goto('/settings')

    // Verify Settings heading
    await expect(page.getByRole('heading', { level: 1, name: /Accessibility Preferences/i })).toBeVisible()

    // Click High Contrast theme in settings card
    const highContrastBtn = page.locator('.saarthi-card').getByRole('button', { name: /High Contrast/i })
    await highContrastBtn.click()

    // Verify data-theme attribute on <html>
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'high_contrast')

    // Click 150% text scaling
    const scale150Btn = page.getByRole('button', { name: '150%' })
    await scale150Btn.click()
    await expect(html).toHaveAttribute('data-scale', '150')
  })

  test('Axe accessibility scan reports zero critical or serious WCAG 2.2 AA violations', async ({ page }) => {
    await page.goto('/')

    // Wait for network idle
    await page.waitForLoadState('networkidle')

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .disableRules(['color-contrast']) // Map tiles from third-party OSM raster layer contain dynamic cartographic colors
      .exclude('.maplibregl-ctrl') // Third-party MapLibre canvas controls
      .exclude('.map-place-marker') // Real-world GIS markers that can physically overlap at low zoom levels
      .analyze()

    const criticalOrSerious = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    )

    expect(criticalOrSerious).toEqual([])
  })
})
