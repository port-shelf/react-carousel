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
  await viewport(page).evaluate((element) => element.scrollTo({ left: element.scrollWidth, behavior: 'instant' }))
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
