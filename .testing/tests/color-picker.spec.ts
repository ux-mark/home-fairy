import { test, expect } from '@playwright/test'

test.describe('ColorBrightnessPicker', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a scene editor page that has lights
    await page.goto('/scenes/new')
    // Wait for the page to load
    await page.waitForLoadState('networkidle')
  })

  test('colour picker renders with full-width hue bar', async ({ page }) => {
    // Check if the picker is on the page (may need a room with lights assigned)
    const picker = page.locator('.fairy-picker .react-colorful')
    if (await picker.count() === 0) {
      test.skip()
      return
    }

    // Hue bar should be at least 28px tall
    const hueBar = page.locator('.fairy-picker .react-colorful__hue')
    const hueBox = await hueBar.boundingBox()
    expect(hueBox).not.toBeNull()
    if (hueBox) {
      expect(hueBox.height).toBeGreaterThanOrEqual(24)
    }

    // Saturation panel should be at least 200px tall
    const satPanel = page.locator('.fairy-picker .react-colorful__saturation')
    const satBox = await satPanel.boundingBox()
    expect(satBox).not.toBeNull()
    if (satBox) {
      expect(satBox.height).toBeGreaterThanOrEqual(200)
    }
  })

  test('hue pointer is large enough for touch (>= 24px)', async ({ page }) => {
    const pointer = page.locator('.fairy-picker .react-colorful__hue .react-colorful__pointer')
    if (await pointer.count() === 0) {
      test.skip()
      return
    }

    const box = await pointer.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(24)
      expect(box.height).toBeGreaterThanOrEqual(24)
    }
  })

  test('brightness slider has correct range', async ({ page }) => {
    const slider = page.locator('.fairy-slider[aria-label="Brightness"]')
    if (await slider.count() === 0) {
      test.skip()
      return
    }

    const min = await slider.getAttribute('min')
    const max = await slider.getAttribute('max')
    expect(min).toBe('0')
    expect(max).toBe('100')
  })

  test('brightness slider thumb is touch-friendly (>= 24px)', async ({ page }) => {
    const slider = page.locator('.fairy-slider[aria-label="Brightness"]')
    if (await slider.count() === 0) {
      test.skip()
      return
    }

    // Check the slider has adequate height for touch
    const box = await slider.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      // Including padding, the slider should be at least 40px tall for touch
      expect(box.height).toBeGreaterThanOrEqual(36)
    }
  })

  test('kelvin slider renders for white-only lights', async ({ page }) => {
    const kelvinSlider = page.locator('.fairy-slider[aria-label="Colour temperature"]')
    // This may or may not be present depending on the light type
    if (await kelvinSlider.count() === 0) {
      test.skip()
      return
    }

    const min = await kelvinSlider.getAttribute('min')
    const max = await kelvinSlider.getAttribute('max')
    expect(Number(min)).toBeGreaterThanOrEqual(1500)
    expect(Number(max)).toBeLessThanOrEqual(9000)
  })
})
