import { expect, test, type Page } from '@playwright/test'
import { buildLayout, getStepTarget, modulo } from '../src/model.js'

const selected = (page: Page) => page.getByLabel('Selected slide')
const previous = (page: Page) => page.getByRole('button', { name: 'Navigate to previous slide' })
const next = (page: Page) => page.getByRole('button', { name: 'Navigate to next slide' })
const mode = (page: Page) => page.getByLabel('Mode')
const viewport = (page: Page) => page.locator('.carousel__viewport')
const originals = (page: Page) => page.locator('[data-original-slide]')

test('calculates fractional sizes and advances by a whole page from a clamped edge', () => {
  const layout = buildLayout({ count: 5, viewport: 500, visible: 2.5, measured: [], gap: 10,
    edge: 0, clones: 0, alignment: 'center', loop: false })
  expect(layout.fixedSize).toBe(194)
  expect(layout.offset(0)).toBe(0)
  expect(layout.offset(4)).toBe(layout.maximum)
  expect(getStepTarget(0, 1, 3, 9, 3, 'center', false)).toBe(4)
  expect(getStepTarget(8, -1, 3, 9, 3, 'center', false)).toBe(4)
  expect(modulo(-1, 5)).toBe(4)
})

test('wraps in both directions and keeps cloned content inert', async ({ page }) => {
  await page.goto('/')
  await mode(page).selectOption('loop')
  await expect(selected(page)).toHaveText('1 / 5')
  await expect(viewport(page)).toHaveCSS('overflow', 'clip')
  await previous(page).click()
  await expect(selected(page)).toHaveText('5 / 5')
  await expect(page.getByText('Item 5 of 5', { exact: true })).toBeAttached()
  await expect(originals(page).nth(4)).toHaveClass(/carousel__slide--active/)
  await expect(page.locator('.carousel__slide--clone').first()).toHaveAttribute('inert', '')
  await next(page).click()
  await expect(selected(page)).toHaveText('1 / 5')
  await expect(originals(page).first()).toHaveClass(/carousel__slide--active/)
})

test('keeps finite controls at the ends and selects a slide with pagination', async ({ page }) => {
  await page.goto('/')
  await mode(page).selectOption('finite')
  await expect(previous(page)).toBeDisabled()
  await page.getByRole('button', { name: 'Navigate to slide 5' }).click()
  await expect(next(page)).toBeDisabled()
  await expect(selected(page)).toHaveText('5 / 5')
  await expect(page.getByRole('button', { name: 'Navigate to slide 5' })).toHaveAttribute('aria-current', 'true')
  await previous(page).click()
  await expect(selected(page)).toHaveText('4 / 5')
})

test('handles keyboard navigation on both orientations and reverses RTL', async ({ page }) => {
  await page.goto('/')
  const carousel = page.getByRole('region', { name: 'Atmospheric studies' })
  await carousel.focus()
  await page.keyboard.press('ArrowRight')
  await expect(selected(page)).toHaveText('2 / 5')

  await mode(page).selectOption('vertical')
  await carousel.focus()
  await page.keyboard.press('ArrowDown')
  await expect(selected(page)).toHaveText('2 / 5')
  await expect(viewport(page)).toHaveCSS('height', '310px')

  await mode(page).selectOption('rtl')
  await carousel.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(selected(page)).toHaveText('2 / 5')
})

test('advances by mouse drag and by horizontal wheel input', async ({ page }) => {
  await page.goto('/')
  await mode(page).selectOption('loop')
  const box = await viewport(page).boundingBox()
  if (!box) throw new Error('Carousel viewport has no bounds')
  await page.mouse.move(box.x + box.width * .7, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * .35, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect(selected(page)).toHaveText('2 / 5')
  await page.mouse.wheel(120, 0)
  await expect(selected(page)).toHaveText('3 / 5')
})

test('responds to viewport breakpoints and a shrinking slide list', async ({ page }) => {
  await page.goto('/')
  await mode(page).selectOption('loop')
  await page.getByLabel('Layout').selectOption('responsive')
  await expect.poll(() => originals(page).first().evaluate((element) => element.offsetWidth)).toBeLessThan(500)
  await page.setViewportSize({ width: 520, height: 800 })
  await expect.poll(() => originals(page).first().evaluate((element) => element.offsetWidth)).toBeGreaterThan(450)
  await page.getByRole('button', { name: 'Navigate to slide 5' }).click()
  await page.getByLabel('Slides').selectOption('3')
  await expect(selected(page)).toHaveText('3 / 3')
  await expect(originals(page)).toHaveCount(3)
})

test('syncs native scroll and controls without moving the page', async ({ page }) => {
  await page.goto('/')
  await mode(page).selectOption('native')
  await next(page).click()
  await expect.poll(() => viewport(page).evaluate((element) => element.scrollLeft)).toBeGreaterThan(900)
  await expect(selected(page)).toHaveText('2 / 5')
  await expect(page.locator('.carousel__status')).toHaveText('Item 2 of 5')
  await viewport(page).evaluate((element) => element.scrollTo({ left: element.scrollWidth - element.clientWidth, behavior: 'instant' }))
  await expect(selected(page)).toHaveText('5 / 5')
  await expect(next(page)).toBeDisabled()
})

test('supports fade, marquee, autoplay pause, and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await mode(page).selectOption('fade')
  await next(page).click()
  await expect(originals(page).nth(1)).toHaveCSS('opacity', '1')

  await page.getByLabel('Autoplay').check()
  const start = page.getByRole('button', { name: 'Start rotation' })
  await expect(start).toBeVisible()
  await expect(selected(page)).toHaveText('2 / 5')
  await start.click()
  await page.getByLabel('Mode').hover()
  await expect(selected(page)).toHaveText('3 / 5', { timeout: 5000 })
  await page.getByRole('button', { name: 'Pause rotation' }).click()
  await expect(start).toBeVisible()

  await mode(page).selectOption('marquee')
  await expect(next(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Start rotation' })).toBeVisible()
})

const component = (page: Page) => page.getByRole('region', { name: 'Atmospheric studies' })
const statusText = (page: Page) => component(page).locator('.carousel__status')

async function expectCentered(page: Page, index: number, vertical = false) {
  await expect.poll(() => originals(page).nth(index).evaluate((slide, axis) => {
    const viewport = slide.closest('.carousel__viewport')!.getBoundingClientRect()
    const rect = slide.getBoundingClientRect()
    return Math.abs(axis ? rect.top + rect.height / 2 - viewport.top - viewport.height / 2
      : rect.left + rect.width / 2 - viewport.left - viewport.width / 2)
  }, vertical)).toBeLessThan(3)
}

test('native loop wraps both ways with original DOM order and native snap', async ({ page }) => {
  await page.goto('/')
  await expect(component(page)).toHaveClass(/is-native/)
  await expect(viewport(page)).toHaveCSS('scroll-snap-type', 'x mandatory')
  await expect(page.locator('.carousel__track')).toHaveCSS('transform', 'none')
  const ids = await originals(page).evaluateAll((items) => items.map((item) => item.id))
  await expectCentered(page, 0)
  await previous(page).click()
  await expect(statusText(page)).toHaveText('Item 5 of 5')
  await expectCentered(page, 4)
  await next(page).click()
  await expect(statusText(page)).toHaveText('Item 1 of 5')
  await expectCentered(page, 0)
  await expect(originals(page)).toHaveCount(5)
  await expect(page.locator('.carousel__slide--clone')).toHaveCount(0)
  expect(await originals(page).evaluateAll((items) => items.map((item) => item.id))).toEqual(ids)
})

test('native loop adopts a browser scroll crossing either boundary', async ({ page }) => {
  await page.goto('/')
  await expectCentered(page, 0)
  await viewport(page).evaluate((element) => element.scrollBy({ left: -element.clientWidth - 12, behavior: 'instant' }))
  await expect(selected(page)).toHaveText('5 / 5')
  await expectCentered(page, 4)
  await expect(viewport(page)).toHaveCSS('scroll-snap-type', 'x mandatory')
  await viewport(page).evaluate((element) => element.scrollBy({ left: element.clientWidth + 12, behavior: 'instant' }))
  await expect(selected(page)).toHaveText('1 / 5')
  await expectCentered(page, 0)
})

test('native loop queues rapid navigation and recenters after a direct marker', async ({ page }) => {
  await page.goto('/')
  await previous(page).click()
  await previous(page).click()
  await previous(page).click()
  await expect(statusText(page)).toHaveText('Item 3 of 5')
  await expectCentered(page, 2)
  await page.getByRole('button', { name: 'Navigate to slide 1', exact: true }).click()
  await expect(statusText(page)).toHaveText('Item 1 of 5')
  await expectCentered(page, 0)
  await previous(page).click()
  await expect(statusText(page)).toHaveText('Item 5 of 5')
  await expectCentered(page, 4)
})

test('native loop supports RTL and vertical keyboard and native offsets', async ({ page }) => {
  await page.goto('/')
  await mode(page).selectOption('native-rtl')
  await component(page).focus()
  await expectCentered(page, 0)
  await page.keyboard.press('ArrowRight')
  await expect(statusText(page)).toHaveText('Item 5 of 5')
  await expectCentered(page, 4)
  await expect.poll(() => viewport(page).evaluate((element) => element.scrollLeft)).toBeLessThan(0)
  await mode(page).selectOption('native-vertical')
  await expect(viewport(page)).toHaveCSS('scroll-snap-type', 'y mandatory')
  await component(page).focus()
  await page.keyboard.press('ArrowUp')
  await expect(statusText(page)).toHaveText('Item 5 of 5')
  await expectCentered(page, 4, true)
  await page.keyboard.press('ArrowDown')
  await expect(statusText(page)).toHaveText('Item 1 of 5')
  await expectCentered(page, 0, true)
})

test('native loop handles variable widths, breakpoints, and a two-slide list', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Layout').selectOption('auto')
  await expect.poll(() => originals(page).nth(4).evaluate((element) => element.offsetWidth)).toBeGreaterThan(350)
  await previous(page).click()
  await expect(statusText(page)).toHaveText('Item 5 of 5')
  await expectCentered(page, 4)

  await page.getByLabel('Layout').selectOption('responsive')
  await expect(component(page)).toHaveClass(/is-native/)
  await next(page).click()
  await expect(statusText(page)).toHaveText('Item 1 of 5')
  await page.getByLabel('Slides').selectOption('2')
  await expect(component(page)).not.toHaveClass(/is-native/)
  await page.setViewportSize({ width: 540, height: 800 })
  await expect(component(page)).toHaveClass(/is-native/)
  await previous(page).click()
  await expect(statusText(page)).toHaveText('Item 2 of 2')
  await expectCentered(page, 1)
  await next(page).click()
  await expect(statusText(page)).toHaveText('Item 1 of 2')
  await expectCentered(page, 0)
})

test('native loop works without smooth motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await previous(page).click()
  await expect(statusText(page)).toHaveText('Item 5 of 5')
  await expectCentered(page, 4)
  await next(page).click()
  await expect(statusText(page)).toHaveText('Item 1 of 5')
})

test.describe('mobile native loop', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  test('receives a browser-controlled touch swipe without a custom drag listener', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Trusted touch sequences are only available through Chromium CDP.')
    await page.goto('/')
    await expectCentered(page, 0)
    await expect(page.locator('.is-draggable')).toHaveCount(0)
    const bounds = await viewport(page).boundingBox()
    if (!bounds) throw new Error('Carousel viewport has no bounds')
    const cdp = await page.context().newCDPSession(page)
    const point = (progress: number) => ({
      x: bounds.x + bounds.width * (0.1 + progress * 0.8),
      y: bounds.y + bounds.height * 0.5,
    })
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(0)] })
      for (let step = 1; step <= 8; step += 1) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(step / 8)] })
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await expect(statusText(page)).toHaveText('Item 5 of 5')
      await expectCentered(page, 4)
    } finally {
      await cdp.detach()
    }
  })
})

const fixtureUrl = 'http://127.0.0.1:4318/tests/fixture.html'
const fixtureEvents = (page: Page) => page.getByLabel('Fixture events')
const fixtureSelection = (page: Page) => page.getByLabel('Fixture selection')

test('renders named slides and addons, honors explicit indexes, and registers originals once', async ({ page }) => {
  await page.goto(fixtureUrl)
  await expect(fixtureEvents(page)).toContainText('init')
  await expect(page.getByLabel('Addon data')).toHaveText('2/5')
  await expect(originals(page).first()).toHaveText('First (5)')
  const log = (await fixtureEvents(page).textContent())!.split('\n')
  expect(log).toEqual(['before', 'register:0:first', 'register:1:second', 'register:2:third',
    'register:3:fourth', 'register:4:final', 'init'])
  await page.getByRole('button', { name: 'Toggle extra slide' }).click()
  await expect(fixtureEvents(page)).toContainText('unregister:4:final')
  await expect(page.getByLabel('Addon data')).toHaveText('2/4')
  await page.getByRole('button', { name: 'Toggle carousel' }).click()
  await expect(fixtureEvents(page)).toContainText('unregister:0:first')
})

test('external navigation and grouped pagination update with the same live ref', async ({ page }) => {
  await page.goto(fixtureUrl)
  const lastPage = page.getByRole('button', { name: 'Navigate to page 3' })
  await expect(lastPage).toHaveAttribute('aria-controls', 'final')
  await lastPage.click()
  await expect(fixtureSelection(page)).toHaveText('4')
  await expect(lastPage).toHaveAttribute('aria-pressed', 'true')
  await expect(next(page)).toBeDisabled()
  await page.getByRole('button', { name: 'Read ref' }).click()
  const metrics = JSON.parse((await page.getByLabel('Fixture measurements').textContent())!)
  expect(metrics).toMatchObject({ index: 4, slides: 5, viewport: true, locked: false, allFit: false })
  expect(metrics.slideSize).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Toggle fit' }).click()
  await expect(lastPage).toHaveCount(0)
  await expect(fixtureSelection(page)).toHaveText('0')
})

test('a controlled transform carousel chooses the shortest wrap path and emits matching events', async ({ page }) => {
  await page.goto(fixtureUrl + '?variant=wrap')
  await page.getByRole('button', { name: 'Select index four externally' }).click()
  await expect(fixtureEvents(page)).toContainText('start:0:4:-1:5')
  await expect(fixtureEvents(page)).toContainText('loop:0:4')
  await expect(fixtureEvents(page)).toContainText('end:0:4')
  await expect(originals(page).nth(4)).toHaveClass(/carousel__slide--active/)
})

test('finite native mode locks when slides fit and reports its effective state', async ({ page }) => {
  await page.goto(fixtureUrl + '?variant=native')
  await page.getByRole('button', { name: 'Toggle fit' }).click()
  await expect(next(page)).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Fixture carousel' })).toHaveClass(/is-native.*is-locked/)
  await page.getByRole('button', { name: 'Read ref' }).click()
  const metrics = JSON.parse((await page.getByLabel('Fixture measurements').textContent())!)
  expect(metrics).toMatchObject({ native: true, locked: true, allFit: true, index: 0 })
})


test('exports standalone translated icons and honors the legacy wheel threshold', async ({ page }) => {
  await page.goto(fixtureUrl)
  await expect(page.getByRole('img', { name: 'Forward arrow' })).toBeVisible()
  const canceled = await viewport(page).evaluate((element) => [60, 120].map((deltaX) => {
    const event = new WheelEvent('wheel', { deltaX, cancelable: true })
    element.dispatchEvent(event)
    return event.defaultPrevented
  }))
  expect(canceled).toEqual([false, true])
  await expect(fixtureSelection(page)).toHaveText('1')
})


test('native mode falls back when the browser cannot use Scroll Snap', async ({ page }) => {
  await page.addInitScript(() => {
    const supports = CSS.supports.bind(CSS)
    CSS.supports = (property: string, value?: string) =>
      property === 'scroll-snap-type' ? false : value === undefined ? supports(property) : supports(property, value)
  })
  await page.goto('/')
  await expect(component(page)).not.toHaveClass(/is-native/)
  await expect(viewport(page)).toHaveCSS('overflow', 'clip')
  await previous(page).click()
  await expect(statusText(page)).toHaveText('Item 5 of 5')
})

test('external controls follow the same ref when the carousel remounts', async ({ page }) => {
  await page.goto(fixtureUrl)
  const toggle = page.getByRole('button', { name: 'Toggle carousel' })
  await expect(next(page)).toBeVisible()
  await toggle.click()
  await expect(next(page)).toHaveCount(0)
  await toggle.click()
  await next(page).click()
  await expect(fixtureSelection(page)).toHaveText('1')
  await expect(previous(page)).toBeEnabled()
})
