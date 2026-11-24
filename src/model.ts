export type Direction =
  | 'ltr' | 'rtl' | 'ttb' | 'btt'
  | 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top'

export type SnapAlign = 'start' | 'center' | 'center-even' | 'center-odd' | 'end'
export type DragOptions = { threshold?: number }
export type WheelOptions = { threshold?: number; throttleTime?: number; ignoreCrossAxis?: boolean }

export const defaultLabels = {
  ariaGallery: 'Gallery {id}',
  ariaNavigateToPage: 'Navigate to page {slideNumber}',
  ariaNavigateToSlide: 'Navigate to slide {slideNumber}',
  ariaPreviousSlide: 'Navigate to previous slide',
  ariaNextSlide: 'Navigate to next slide',
  iconArrowDown: 'Arrow pointing downwards',
  iconArrowLeft: 'Arrow pointing to the left',
  iconArrowRight: 'Arrow pointing to the right',
  iconArrowUp: 'Arrow pointing upwards',
  itemXofY: 'Item {currentSlide} of {slidesCount}',
} as const

export type CarouselLabels = { [Key in keyof typeof defaultLabels]?: string }

export interface CarouselOptions {
  adaptiveHeight?: boolean
  autoplay?: number
  autoScrollOnFocus?: boolean
  clamp?: boolean
  dir?: Direction
  disableWhenSlidesFit?: boolean
  edgeSpacing?: number
  enabled?: boolean
  gap?: number
  height?: number | string
  i18n?: CarouselLabels
  ignoreAnimations?: boolean | string | string[]
  itemsToShow?: number | 'auto'
  itemsToScroll?: number
  keyboardNavigation?: boolean
  marquee?: boolean
  marqueeSpeed?: number
  mouseDrag?: boolean | DragOptions
  mouseWheel?: boolean | WheelOptions
  mouseScrollThreshold?: number
  nativeCss?: boolean
  pauseAutoplayOnHover?: boolean
  preventExcessiveDragging?: boolean
  slideEffect?: 'slide' | 'fade'
  snapAlign?: SnapAlign
  touchDrag?: boolean | DragOptions
  transition?: number
  transitionEasing?: string
  wrapAround?: boolean
}

export type Breakpoints = Record<number, Partial<CarouselOptions>>
export type BreakpointMode = 'viewport' | 'carousel'

export const defaultOptions = {
  adaptiveHeight: false,
  autoplay: 0,
  autoScrollOnFocus: true,
  clamp: false,
  dir: 'ltr',
  disableWhenSlidesFit: false,
  edgeSpacing: 0,
  enabled: true,
  gap: 0,
  height: 'auto',
  i18n: {},
  ignoreAnimations: false,
  itemsToShow: 1,
  itemsToScroll: 1,
  keyboardNavigation: true,
  marquee: false,
  marqueeSpeed: 60,
  mouseDrag: true,
  mouseWheel: false,
  mouseScrollThreshold: 10,
  nativeCss: false,
  pauseAutoplayOnHover: false,
  preventExcessiveDragging: false,
  slideEffect: 'slide',
  snapAlign: 'center',
  touchDrag: true,
  transition: 300,
  transitionEasing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  wrapAround: false,
} satisfies Required<CarouselOptions>

export const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export const modulo = (index: number, count: number) => count ? ((index % count) + count) % count : 0

export function resolveOptions(options: CarouselOptions, breakpoints: Breakpoints | undefined, width: number) {
  const breakpoint = Object.keys(breakpoints ?? {}).map(Number)
    .filter((minimum) => minimum <= width)
    .sort((a, b) => b - a)[0]
  const overrides = breakpoints?.[breakpoint]
  const defined = Object.fromEntries(Object.entries({ ...options, ...overrides }).filter(([, value]) => value !== undefined))
  return { ...defaultOptions, ...defined, i18n: { ...defaultLabels, ...options.i18n, ...overrides?.i18n } } as
    Required<CarouselOptions> & { i18n: Required<CarouselLabels> }
}

export type ResolvedOptions = Omit<Required<CarouselOptions>, 'i18n'> & {
  i18n: Required<CarouselLabels>
  breakpointMode: BreakpointMode
  breakpoints?: Breakpoints
  classPrefix: string
  modelValue: number
}

export function alignmentOffset(alignment: SnapAlign, shown: number) {
  if (alignment === 'start') return 0
  if (alignment === 'end') return shown - 1
  return (shown - (alignment === 'center-even' ? 2 : 1)) / 2
}

export function formatLabel(message: string, values: Record<string, string | number>) {
  return message.replace(/\{(\w+)\}/g, (placeholder, key: string) => String(values[key] ?? placeholder))
}

export function getDirection(dir: Direction) {
  const vertical = ['ttb', 'btt', 'top-to-bottom', 'bottom-to-top'].includes(dir)
  const reversed = ['rtl', 'btt', 'right-to-left', 'bottom-to-top'].includes(dir)
  return { vertical, reversed, axisSign: reversed ? -1 : 1 }
}

export function buildLayout({
  count, viewport, visible, measured, gap, edge, clones, alignment, loop,
}: {
  count: number
  viewport: number
  visible: number | 'auto'
  measured: number[]
  gap: number
  edge: number
  clones: number
  alignment: SnapAlign
  loop: boolean
}) {
  const fixedSize = typeof visible === 'number' ? Math.max(0, (viewport - gap * (visible - 1)) / visible) : 0
  const first = -clones
  const last = count + clones - 1
  const starts: number[] = []
  const sizes: number[] = []
  let cursor = edge

  for (let index = first; index <= last; index += 1) {
    const size = visible === 'auto' ? measured[modulo(index, count)] ?? 0 : fixedSize
    starts.push(cursor)
    sizes.push(size)
    cursor += size + gap
  }

  const content = count ? cursor - gap + edge : 0
  const maximum = Math.max(0, content - viewport)

  const start = (index: number) => starts[index - first] ?? 0
  const size = (index: number) => sizes[index - first] ?? 0
  const offset = (index: number) => {
    const available = viewport - size(index)
    const step = size(index) + gap
    let align = available / 2
    if (alignment === 'start') align = edge
    if (alignment === 'end') align = available - edge
    if (alignment === 'center-even') {
      align = visible === 'auto' ? viewport / 2 - size(index) : step * alignmentOffset(alignment, visible)
    }
    const desired = start(index) - align
    if (loop) return desired
    if (desired <= edge) return 0
    if (desired >= maximum - edge) return maximum
    return clampNumber(desired, 0, maximum)
  }

  return { start, size, offset, first, last, maximum, content, fixedSize }
}

export function getStepTarget(index: number, direction: number, step: number, count: number, visible: number | 'auto', alignment: SnapAlign, loop: boolean) {
  if (loop || visible === 'auto' || step === 1 || count === 0) return index + direction * step
  const align = alignmentOffset(alignment, visible)
  const max = Math.max(0, count - visible)
  const scrolled = clampNumber(index - align, 0, max)
  const target = scrolled + direction * step
  if (target <= 0) return 0
  if (target >= max) return count - 1
  return direction > 0 ? Math.floor(target + align) : Math.ceil(target + align)
}
