import type { Page, Locator } from '@playwright/test'

/**
 * Page Object for the Sonos Browse tab (/sonos/browse and its nested detail
 * pages). Encapsulates all selectors and user-intent actions used in
 * sonos-browse-session-resume.spec.ts.
 */
export class SonosBrowsePage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  // ── Navigation helpers ────────────────────────────────────────────────────

  /** Navigate directly to /sonos/browse and wait for the search input. */
  async goto() {
    await this.page.goto('/sonos/browse')
    await this.searchInput.waitFor({ state: 'visible' })
  }

  /**
   * Click a Sonos nav link (Browse, Playing, etc.) in the currently visible
   * nav bar. Both the desktop sidebar and mobile bottom-nav render the link;
   * this helper scopes to the visible one.
   */
  navLink(name: string): Locator {
    return this.page
      .locator('nav')
      .filter({ has: this.page.getByRole('link', { name }) })
      .filter({ visible: true })
      .getByRole('link', { name })
  }

  // ── Source filter tabs ────────────────────────────────────────────────────

  /** The "All" source filter tab button. */
  get tabAll(): Locator {
    return this.page.getByRole('tab', { name: 'All' })
  }

  /** The "NAS" source filter tab button. */
  get tabNas(): Locator {
    return this.page.getByRole('tab', { name: 'NAS' })
  }

  /** The "Spotify" source filter tab button. */
  get tabSpotify(): Locator {
    return this.page.getByRole('tab', { name: 'Spotify' })
  }

  /** The "Radio" source filter tab button. */
  get tabRadio(): Locator {
    return this.page.getByRole('tab', { name: 'Radio' })
  }

  /** Click a source tab and wait for it to become selected. */
  async selectSource(name: 'All' | 'NAS' | 'Spotify' | 'Radio') {
    const tab = this.page.getByRole('tab', { name })
    await tab.click()
    await tab.waitFor()
  }

  // ── Search ────────────────────────────────────────────────────────────────

  get searchInput(): Locator {
    return this.page.getByLabel('Search music')
  }

  get clearSearchButton(): Locator {
    return this.page.getByRole('button', { name: 'Clear search' })
  }

  async typeSearch(query: string) {
    await this.searchInput.fill(query)
  }

  async clearSearch() {
    await this.clearSearchButton.click()
  }

  // ── Session storage helpers ───────────────────────────────────────────────

  async getLastBrowsePath(): Promise<string | null> {
    try {
      return await this.page.evaluate(() => sessionStorage.getItem('sonos:lastBrowsePath'))
    } catch {
      // Execution context destroyed during navigation — return null so expect.poll retries
      return null
    }
  }

  async getNavStack(): Promise<unknown> {
    try {
      return await this.page.evaluate(() => {
        const raw = sessionStorage.getItem('sonos:navStack')
        return raw ? JSON.parse(raw) : null
      })
    } catch {
      return null
    }
  }

  async getScrollY(url: string): Promise<number | null> {
    return this.page.evaluate((u) => {
      const raw = sessionStorage.getItem('scrollY:' + u)
      return raw !== null ? Number(raw) : null
    }, url)
  }

  async getSearchQueryFromUrl(): Promise<string> {
    const url = new URL(this.page.url())
    return url.searchParams.get('q') ?? ''
  }

  async getSourceFromUrl(): Promise<string> {
    const url = new URL(this.page.url())
    return url.searchParams.get('source') ?? ''
  }

  // ── Scroll helpers ────────────────────────────────────────────────────────

  /** Inject a tall spacer so the page is scrollable in tests. */
  async injectTallContent() {
    await this.page.evaluate(() => {
      const main = document.querySelector('main') ?? document.body
      const existing = document.getElementById('e2e-tall-spacer')
      if (existing) return
      const spacer = document.createElement('div')
      spacer.id = 'e2e-tall-spacer'
      spacer.style.height = '3000px'
      spacer.textContent = 'scroll spacer'
      main.appendChild(spacer)
    })
  }

  async scrollTo(y: number) {
    await this.page.evaluate((scrollY) => window.scrollTo(0, scrollY), y)
    await this.page.waitForFunction((target) => window.scrollY >= target - 10, y)
  }

  /** Wait until the scroll position for a given URL is persisted. */
  async waitForScrollPersisted(url: string, minY: number) {
    await this.page.waitForFunction(
      ({ u, min }) => {
        const raw = sessionStorage.getItem('scrollY:' + u)
        return raw !== null && Number(raw) >= min
      },
      { u: url, min: minY },
    )
  }
}
