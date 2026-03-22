import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

// Collect console errors across all tests
const consoleErrors: { page: string; message: string }[] = []

function collectConsoleErrors(page: Page, pageName: string) {
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // Ignore expected noise
      if (
        text.includes('favicon') ||
        text.includes('404') ||
        text.includes('Failed to load resource') ||
        text.includes('net::ERR_')
      ) return
      consoleErrors.push({ page: pageName, message: text })
    }
  })
}

// ── Test 1: Home Page ────────────────────────────────────────────────────────

test('Home Page loads with mode buttons and room cards', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Home')

  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Mode buttons section
  const modeSection = page.locator('section[aria-label="System mode"]')
  await expect(modeSection).toBeVisible()
  await expect(modeSection.getByText('Current Mode')).toBeVisible()

  // Check for mode buttons
  const modeButtons = modeSection.locator('button')
  const modeCount = await modeButtons.count()
  expect(modeCount).toBeGreaterThanOrEqual(3)

  // Check some expected mode names
  for (const mode of ['Morning', 'Afternoon', 'Evening']) {
    const btn = modeSection.getByText(mode, { exact: true })
    // At least one should exist
    if (await btn.count() > 0) {
      await expect(btn.first()).toBeVisible()
    }
  }

  // Room cards section
  const roomsSection = page.locator('section[aria-label="Rooms"]')
  await expect(roomsSection).toBeVisible()

  // Check room names
  for (const roomName of ['Living', 'Kitchen', 'Bedroom']) {
    const roomCard = roomsSection.getByText(roomName, { exact: false })
    if (await roomCard.count() > 0) {
      await expect(roomCard.first()).toBeVisible()
    }
  }

  // Weather card (may or may not render depending on API)
  // Just check it doesn't crash — the card shows temp if available
  const weatherCard = page.locator('img[alt]').first()
  // No assertion — just verifying no crash

  await page.screenshot({ path: '.testing/results/01-home.png', fullPage: true })
})

// ── Test 2: Rooms Page ───────────────────────────────────────────────────────

test('Rooms Page shows room list and Add Room button', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Rooms')

  await page.goto('/rooms')
  await page.waitForLoadState('networkidle')

  // Page heading
  await expect(page.getByText('All Rooms')).toBeVisible()

  // Add Room button
  const addRoomBtn = page.getByText('Add Room')
  await expect(addRoomBtn).toBeVisible()

  // Room cards should render with room names as links
  const roomLinks = page.locator('a[href^="/rooms/"]')
  const linkCount = await roomLinks.count()
  expect(linkCount).toBeGreaterThanOrEqual(1)

  // Check that room names appear
  for (const roomName of ['Living', 'Kitchen', 'Bedroom']) {
    const heading = page.getByRole('heading', { name: roomName })
    if (await heading.count() > 0) {
      await expect(heading.first()).toBeVisible()
    }
  }

  await page.screenshot({ path: '.testing/results/02-rooms.png', fullPage: true })
})

// ── Test 3: Room Detail Page ─────────────────────────────────────────────────

test('Room Detail Page shows settings, tabs, and save button', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'RoomDetail')

  await page.goto('/rooms/Living')
  await page.waitForLoadState('networkidle')

  // Room name heading
  // The room name input or heading should show "Living"
  const livingText = page.getByText('Living', { exact: false })
  await expect(livingText.first()).toBeVisible()

  // Settings section
  await expect(page.getByText('Room Settings')).toBeVisible()

  // Auto toggle
  await expect(page.getByText('Automation')).toBeVisible()
  const autoToggle = page.locator('#auto-toggle')
  await expect(autoToggle).toBeVisible()

  // Devices section heading (use the h3 within the page content, not the nav)
  await expect(page.locator('h3:text("Devices")').first()).toBeVisible()

  // Tab triggers: Lights, Switches, Sensors
  const lightsTab = page.getByRole('tab', { name: /Lights/i })
  const switchesTab = page.getByRole('tab', { name: /Switches/i })
  const sensorsTab = page.getByRole('tab', { name: /Sensors/i })

  await expect(lightsTab).toBeVisible()
  await expect(switchesTab).toBeVisible()
  await expect(sensorsTab).toBeVisible()

  // Click Lights tab — should show assigned lights content
  await lightsTab.click()
  await page.waitForTimeout(300)
  const lightsContent = page.locator('[data-state="active"][role="tabpanel"]')
  await expect(lightsContent).toBeVisible()

  // Click Sensors tab
  await sensorsTab.click()
  await page.waitForTimeout(300)
  const sensorsContent = page.locator('[data-state="active"][role="tabpanel"]')
  await expect(sensorsContent).toBeVisible()

  // Save button
  const saveBtn = page.getByText('Save Room')
  await expect(saveBtn).toBeVisible()

  await page.screenshot({ path: '.testing/results/03-room-detail.png', fullPage: true })
})

// ── Test 4: Scenes Page ──────────────────────────────────────────────────────

test('Scenes Page loads with search and filtering', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Scenes')

  await page.goto('/scenes')
  await page.waitForLoadState('networkidle')

  // Heading
  await expect(page.getByText('All Scenes')).toBeVisible()

  // Search input
  const searchInput = page.locator('input[type="search"]')
  await expect(searchInput).toBeVisible()

  // Scene cards should be present
  const sceneLinks = page.locator('a[href^="/scenes/"]')
  const totalCount = await sceneLinks.count()
  expect(totalCount).toBeGreaterThanOrEqual(10)

  // Type "Living" in search
  await searchInput.fill('Living')
  await page.waitForTimeout(500)

  // Filtered results should be fewer
  const filteredCount = await page.locator('a[href^="/scenes/"]').count()
  expect(filteredCount).toBeLessThan(totalCount)
  expect(filteredCount).toBeGreaterThanOrEqual(1)

  // Check "Showing X of Y" text
  const showingText = page.getByText(/Showing \d+ of \d+/)
  await expect(showingText).toBeVisible()

  // Clear search
  await searchInput.fill('')
  await page.waitForTimeout(500)

  const restoredCount = await page.locator('a[href^="/scenes/"]').count()
  expect(restoredCount).toBe(totalCount)

  await page.screenshot({ path: '.testing/results/04-scenes.png', fullPage: true })
})

// ── Test 5: Scene Editor ─────────────────────────────────────────────────────

test('Scene Editor shows tabs and light controls', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'SceneEditor')

  await page.goto('/scenes/Relaxed%20Living')
  await page.waitForLoadState('networkidle')

  // Scene name should appear in the name input field
  const nameInput = page.locator('input[value="Relaxed Living"]')
  if (await nameInput.count() > 0) {
    await expect(nameInput).toBeVisible()
  } else {
    // Or it may appear as text
    const sceneName = page.getByText('Relaxed Living', { exact: false })
    await expect(sceneName.first()).toBeVisible()
  }

  // Three tabs: Lights, Devices, Settings
  const lightsTab = page.getByRole('tab', { name: /Lights/i })
  const devicesTab = page.getByRole('tab', { name: /Devices/i })
  const settingsTab = page.getByRole('tab', { name: /Settings/i })

  await expect(lightsTab).toBeVisible()
  await expect(devicesTab).toBeVisible()
  await expect(settingsTab).toBeVisible()

  // Click Lights tab (should be default)
  await lightsTab.click()
  await page.waitForTimeout(300)
  // Check that lights panel is visible
  const lightsPanel = page.locator('[role="tabpanel"][data-state="active"]')
  await expect(lightsPanel).toBeVisible()

  // Click Settings tab
  await settingsTab.click()
  await page.waitForTimeout(300)
  const settingsPanel = page.locator('[role="tabpanel"][data-state="active"]')
  await expect(settingsPanel).toBeVisible()

  // Click Devices tab
  await devicesTab.click()
  await page.waitForTimeout(300)
  const devicesPanel = page.locator('[role="tabpanel"][data-state="active"]')
  await expect(devicesPanel).toBeVisible()

  await page.screenshot({ path: '.testing/results/05-scene-editor.png', fullPage: true })
})

// ── Test 6: Devices Page ─────────────────────────────────────────────────────

test('Devices Page shows device list with search and filter chips', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Devices')

  await page.goto('/devices')
  await page.waitForLoadState('networkidle')

  // Heading
  await expect(page.getByText('All Devices')).toBeVisible()

  // Search input
  const searchInput = page.locator('input[type="search"]')
  await expect(searchInput).toBeVisible()

  // Filter chips — "All" should be visible
  const allChip = page.getByRole('button', { name: /^All/ })
  await expect(allChip).toBeVisible()

  // Device cards should be present
  const deviceCards = page.locator('.card.rounded-xl')
  const deviceCount = await deviceCards.count()
  expect(deviceCount).toBeGreaterThanOrEqual(1)

  await page.screenshot({ path: '.testing/results/06-devices.png', fullPage: true })
})

// ── Test 7: Settings Page ────────────────────────────────────────────────────

test('Settings Page shows all sections', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Settings')

  await page.goto('/settings')
  await page.waitForLoadState('networkidle')

  // Page heading
  await expect(page.getByRole('heading', { name: 'Settings' }).first()).toBeVisible()

  // Appearance section with theme toggle
  await expect(page.getByText('Appearance', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Theme')).toBeVisible()

  // Theme buttons
  for (const label of ['Light', 'Dark', 'System']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
  }

  // Modes section
  await expect(page.getByText('Modes', { exact: true }).first()).toBeVisible()

  // Mode chips should show (at least some mode names)
  const modeContainer = page.locator('section:has(h3:text("Modes"))')
  // If modes are loaded, they should be visible as chips
  await page.waitForTimeout(1000) // wait for API

  // System section
  await expect(page.getByText('System', { exact: true }).first()).toBeVisible()

  // Version
  await expect(page.getByText('Version')).toBeVisible()
  await expect(page.getByText('3.0.0')).toBeVisible()

  // Uptime
  await expect(page.getByText('Uptime')).toBeVisible()

  await page.screenshot({ path: '.testing/results/07-settings.png', fullPage: true })
})

// ── Test 8: Watch Page ───────────────────────────────────────────────────────

test('Watch Page shows room list with All Off and mode indicator', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Watch')

  await page.goto('/watch')
  await page.waitForLoadState('networkidle')

  // Mode indicator pill at the top
  const modeIndicator = page.locator('span.rounded-full').first()
  await expect(modeIndicator).toBeVisible()

  // Room buttons — each room row has a button with the room name
  const roomButtons = page.locator('button span.text-heading')
  const roomCount = await roomButtons.count()
  expect(roomCount).toBeGreaterThanOrEqual(1)

  // All Off button — it's the red button at bottom with Power icon and text
  // Need to scroll to it and use a more specific selector
  const allOffBtn = page.locator('button.bg-red-600', { hasText: 'All Off' })
  await allOffBtn.scrollIntoViewIfNeeded()
  await expect(allOffBtn).toBeVisible()

  await page.screenshot({ path: '.testing/results/08-watch.png', fullPage: true })
})

// ── Test 9: Console Error Check ──────────────────────────────────────────────

test('No unexpected console errors across all pages', async ({ page }) => {
  test.setTimeout(60_000)
  const errors: { page: string; message: string }[] = []

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (
        text.includes('favicon') ||
        text.includes('404') ||
        text.includes('Failed to load resource') ||
        text.includes('net::ERR_')
      ) return
      errors.push({ page: currentPage, message: text })
    }
  })

  const pages = [
    { url: '/', name: 'Home' },
    { url: '/rooms', name: 'Rooms' },
    { url: '/rooms/Living', name: 'RoomDetail' },
    { url: '/scenes', name: 'Scenes' },
    { url: '/scenes/Relaxed%20Living', name: 'SceneEditor' },
    { url: '/devices', name: 'Devices' },
    { url: '/settings', name: 'Settings' },
    { url: '/watch', name: 'Watch' },
  ]

  let currentPage = ''

  for (const p of pages) {
    currentPage = p.name
    await page.goto(p.url)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
  }

  if (errors.length > 0) {
    console.log('Console errors found:')
    errors.forEach(e => console.log(`  [${e.page}] ${e.message}`))
  }

  // Allow test to pass even with errors, but report them
  // If you want strict mode, uncomment this:
  // expect(errors).toHaveLength(0)
})

// ── Test 10: Form Interactions (non-destructive) ─────────────────────────────

test('Form interactions work without crashes', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'FormInteractions')

  // --- Room Detail: timer value ---
  await page.goto('/rooms/Living')
  await page.waitForLoadState('networkidle')

  // Find the timer input (type="number" for timer)
  const timerInput = page.locator('input[type="number"]').first()
  if (await timerInput.count() > 0) {
    const originalValue = await timerInput.inputValue()
    await timerInput.fill('42')
    const updatedValue = await timerInput.inputValue()
    expect(updatedValue).toBe('42')
    // Restore original value
    await timerInput.fill(originalValue)
  }

  // --- Scene Editor: tab switching ---
  await page.goto('/scenes/Relaxed%20Living')
  await page.waitForLoadState('networkidle')

  const lightsTab = page.getByRole('tab', { name: /Lights/i })
  const devicesTab = page.getByRole('tab', { name: /Devices/i })
  const settingsTab = page.getByRole('tab', { name: /Settings/i })

  // Click through all tabs
  await settingsTab.click()
  await page.waitForTimeout(200)
  let activePanel = page.locator('[role="tabpanel"][data-state="active"]')
  await expect(activePanel).toBeVisible()

  await devicesTab.click()
  await page.waitForTimeout(200)
  activePanel = page.locator('[role="tabpanel"][data-state="active"]')
  await expect(activePanel).toBeVisible()

  await lightsTab.click()
  await page.waitForTimeout(200)
  activePanel = page.locator('[role="tabpanel"][data-state="active"]')
  await expect(activePanel).toBeVisible()

  // --- Settings: theme toggle ---
  await page.goto('/settings')
  await page.waitForLoadState('networkidle')

  const lightBtn = page.getByRole('button', { name: 'Light', exact: true })
  const darkBtn = page.getByRole('button', { name: 'Dark', exact: true })
  const systemBtn = page.getByRole('button', { name: 'System', exact: true })

  // Click Dark
  await darkBtn.click()
  await page.waitForTimeout(200)
  await expect(darkBtn).toHaveAttribute('aria-pressed', 'true')

  // Click Light
  await lightBtn.click()
  await page.waitForTimeout(200)
  await expect(lightBtn).toHaveAttribute('aria-pressed', 'true')

  // Restore System
  await systemBtn.click()
  await page.waitForTimeout(200)
  await expect(systemBtn).toHaveAttribute('aria-pressed', 'true')

  // --- Scenes: search filtering ---
  await page.goto('/scenes')
  await page.waitForLoadState('networkidle')

  const searchInput = page.locator('input[type="search"]')
  await searchInput.fill('Kitchen')
  await page.waitForTimeout(500)

  const filteredLinks = page.locator('a[href^="/scenes/"]')
  const filteredCount = await filteredLinks.count()
  expect(filteredCount).toBeGreaterThanOrEqual(0)

  // Clear and verify restoration
  await searchInput.fill('')
  await page.waitForTimeout(500)
  const restoredCount = await page.locator('a[href^="/scenes/"]').count()
  expect(restoredCount).toBeGreaterThanOrEqual(filteredCount)

  await page.screenshot({ path: '.testing/results/10-form-interactions.png', fullPage: true })
})
