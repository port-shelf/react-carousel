import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'
import type { LiHTMLAttributes, ReactNode, RefObject } from 'react'
import { alignmentOffset, clampNumber, defaultLabels, formatLabel, modulo } from './model.js'
import type { ResolvedOptions } from './model.js'

export interface SlideState {
  currentIndex: number
  isActive: boolean
  isClone: boolean
  isNext: boolean
  isPrev: boolean
  isSliding: boolean
  isVisible: boolean
}

export interface SlideProps extends Omit<LiHTMLAttributes<HTMLLIElement>, 'children'> {
  index?: number
  children?: ReactNode | ((state: SlideState) => ReactNode)
}

export interface CarouselData {
  config: ResolvedOptions
  currentSlide: number
  maxSlide: number
  middleSlide: number
  minSlide: number
  slideSize: number
  slidesCount: number
}

export interface CarouselNavigation {
  prev: (skipTransition?: boolean) => void
  next: (skipTransition?: boolean) => void
  slideTo: (index: number, skipTransition?: boolean) => void
}

export interface CarouselControls extends CarouselData, CarouselNavigation {
  data: CarouselData
  nav: CarouselNavigation
  activeSlide: number
  isSliding: boolean
  isVertical: boolean
  isReversed: boolean
  isNative: boolean
  isMarquee: boolean
  isLocked: boolean
  allSlidesFit: boolean
  slides: readonly HTMLElement[]
  slideIds: readonly string[]
  viewport: HTMLElement | null
  viewportId: string
  visibleRange: { min: number; max: number }
  canPrev: boolean
  canNext: boolean
  restartCarousel: () => void
  updateBreakpointsConfig: () => void
  updateSlideSize: () => void
  updateSlidesData: () => void
  getSnapshot?: () => CarouselControls | null
  subscribe?: (listener: () => void) => () => void
}

export interface SlideRegistration {
  index: number
  slide: HTMLElement
}

export type CarouselSource = CarouselControls | RefObject<CarouselControls | null>

const emptySubscription = () => {}
const emptySnapshot = () => null
const refListeners = new WeakMap<RefObject<CarouselControls | null>, Set<() => void>>()

export function notifyCarouselRef(ref: RefObject<CarouselControls | null>) {
  for (const listener of refListeners.get(ref) ?? []) listener()
}

function subscribeCarouselRef(ref: RefObject<CarouselControls | null>, listener: () => void) {
  const listeners = refListeners.get(ref) ?? new Set<() => void>()
  listeners.add(listener)
  refListeners.set(ref, listeners)
  return () => { listeners.delete(listener) }
}

export function createCarouselStore() {
  let snapshot: CarouselControls | null = null
  const listeners = new Set<() => void>()
  const handle = {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  } as CarouselControls
  return {
    handle,
    publish(value: CarouselControls) {
      snapshot = value
      Object.assign(handle, value)
      for (const listener of listeners) listener()
    },
    clear() {
      snapshot = null
      for (const listener of listeners) listener()
    },
  }
}

export const CarouselContext = createContext<CarouselControls | null>(null)
export const SlideContext = createContext<{
  state: SlideState
  prefix: string
  label: string
  id: string
  interactive: boolean
} | null>(null)

function resolveSource(source: CarouselSource) {
  return 'current' in source ? source.current : source
}

export function useCarousel(source?: CarouselSource | null) {
  const local = useContext(CarouselContext)
  const subscribe = useCallback((listener: () => void) => {
    if (!source) return emptySubscription
    if ('current' in source) return subscribeCarouselRef(source, listener)
    return source.subscribe?.(listener) ?? emptySubscription
  }, [source])
  const snapshot = useCallback(() => {
    if (!source) return local
    const controls = resolveSource(source)
    return controls?.getSnapshot ? controls.getSnapshot() : controls
  }, [source, local])
  const serverSnapshot = useCallback(() =>
    source && !('current' in source) ? source.getSnapshot?.() ?? source : local, [source, local])
  return useSyncExternalStore(subscribe, snapshot, source ? serverSnapshot : emptySnapshot) ?? local
}

export function Slide({ children, className, index, id, ...attributes }: SlideProps) {
  const context = useContext(SlideContext)
  const state = context?.state ?? {
    currentIndex: index ?? 0, isActive: false, isClone: false, isNext: false,
    isPrev: false, isSliding: false, isVisible: true,
  }
  const prefix = context?.prefix ?? 'carousel'
  const classNames = [
    prefix + '__slide', className,
    state.isActive && prefix + '__slide--active',
    state.isClone && prefix + '__slide--clone',
    state.isNext && prefix + '__slide--next',
    state.isPrev && prefix + '__slide--prev',
    state.isSliding && prefix + '__slide--sliding',
    state.isVisible && prefix + '__slide--visible',
  ].filter(Boolean).join(' ')
  return <li
    {...attributes}
    id={state.isClone ? undefined : id ?? context?.id}
    role="group"
    aria-roledescription="slide"
    aria-label={attributes['aria-label'] ?? context?.label}
    aria-hidden={state.isClone || undefined}
    inert={state.isClone || context?.interactive === false || undefined}
    data-original-slide={context && !state.isClone ? state.currentIndex : undefined}
    className={classNames}
  >
    <SlideContext.Provider value={null}>
      {typeof children === 'function' ? children(state) : children}
    </SlideContext.Provider>
  </li>
}

export const IconName = {
  arrowDown: 'arrowDown',
  arrowLeft: 'arrowLeft',
  arrowRight: 'arrowRight',
  arrowUp: 'arrowUp',
} as const

export type IconNameValue = typeof IconName[keyof typeof IconName]

export const icons: Readonly<Record<IconNameValue, string>> = {
  arrowDown: 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z',
  arrowLeft: 'M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z',
  arrowRight: 'M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z',
  arrowUp: 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z',
}

const iconLabels = {
  arrowDown: 'iconArrowDown',
  arrowLeft: 'iconArrowLeft',
  arrowRight: 'iconArrowRight',
  arrowUp: 'iconArrowUp',
} as const

export interface IconProps {
  name: IconNameValue
  title?: string
  carousel?: CarouselSource | null
}

export function Icon({ name, title, carousel }: IconProps) {
  const context = useCarousel(carousel)
  if (!Object.hasOwn(icons, name)) return null
  const label = title ?? context?.config.i18n[iconLabels[name]] ?? defaultLabels[iconLabels[name]]
  return <svg className={(context?.config.classPrefix ?? 'carousel') + '__icon'}
    width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label={label}>
    <title>{label}</title>
    <path d={icons[name]} />
  </svg>
}

export interface NavigationProps {
  carousel?: CarouselSource | null
  prev?: ReactNode
  next?: ReactNode
  className?: string
}

export function Navigation({ carousel, prev, next, className }: NavigationProps) {
  const context = useCarousel(carousel)
  if (!context || context.isLocked || context.isMarquee) return null
  const { classPrefix: prefix, i18n } = context.config
  const arrows: IconNameValue[] = context.isVertical
    ? ['arrowUp', 'arrowDown']
    : ['arrowLeft', 'arrowRight']
  if (context.isReversed) arrows.reverse()
  const controls = [
    { name: 'prev', canGo: context.canPrev, action: context.prev, content: prev, label: i18n.ariaPreviousSlide },
    { name: 'next', canGo: context.canNext, action: context.next, content: next, label: i18n.ariaNextSlide },
  ]
  return <div className={[prefix + '__navigation', className].filter(Boolean).join(' ')}>
    {controls.map(({ name, canGo, action, content, label }, index) => <button key={name} type="button"
      className={prefix + '__' + name + (canGo ? '' : ' ' + prefix + '__' + name + '--disabled')}
      aria-controls={context.viewportId} aria-label={label} title={label}
      aria-disabled={!canGo} onClick={() => action()}>
      {content ?? <span aria-hidden="true"><Icon name={arrows[index]} carousel={context} /></span>}
    </button>)}
  </div>
}

export interface PaginationProps {
  carousel?: CarouselSource | null
  disableOnClick?: boolean
  paginateByItemsToShow?: boolean
  className?: string
  label?: string
}

export function Pagination({ carousel, disableOnClick, paginateByItemsToShow, className, label = 'Choose a slide' }: PaginationProps) {
  const context = useCarousel(carousel)
  if (!context || context.isLocked || context.isMarquee || !context.slidesCount) return null
  const { classPrefix: prefix, i18n, itemsToShow, snapAlign, wrapAround } = context.config
  const isPaginated = Boolean(paginateByItemsToShow && typeof itemsToShow === 'number' && itemsToShow > 1)
  const pageSize = isPaginated ? Number(itemsToShow) : 1
  const offset = isPaginated ? alignmentOffset(snapAlign, pageSize) : 0
  const pageCount = Math.ceil(context.slidesCount / pageSize)
  const rawPage = Math.ceil((context.activeSlide - offset) / pageSize)
  const currentPage = wrapAround ? modulo(rawPage, pageCount) : clampNumber(rawPage, 0, pageCount - 1)
  const message = isPaginated ? i18n.ariaNavigateToPage : i18n.ariaNavigateToSlide
  return <ol className={[prefix + '__pagination', className].filter(Boolean).join(' ')} aria-label={label}>
    {Array.from({ length: pageCount }, (_, page) => {
      const index = Math.floor(page * pageSize + offset)
      const reachesEnd = isPaginated && !wrapAround && pageSize <= context.slidesCount
        && index - offset >= context.slidesCount - pageSize
      const target = reachesEnd ? context.maxSlide : clampNumber(index, 0, context.maxSlide)
      const selected = page === currentPage
      const title = formatLabel(message, { slideNumber: page + 1 })
      return <li className={prefix + '__pagination-item'} key={page}>
        <button type="button"
          className={prefix + '__pagination-button' + (selected ? ' ' + prefix + '__pagination-button--active' : '')}
          aria-label={title} title={title}
          aria-controls={context.slideIds[target] ?? context.viewportId}
          aria-current={selected ? 'true' : undefined} aria-pressed={selected}
          disabled={disableOnClick || !context.config.enabled}
          onClick={() => context.slideTo(target)} />
      </li>
    })}
  </ol>
}
