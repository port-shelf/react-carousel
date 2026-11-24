import {
  Children, Fragment, isValidElement, useCallback, useEffect, useId, useImperativeHandle,
  useLayoutEffect, useMemo, useRef, useState,
} from 'react'
import type {
  CSSProperties, KeyboardEvent, PointerEvent, ReactNode, Ref,
} from 'react'
import {
  buildLayout, clampNumber, formatLabel, getDirection, getStepTarget, modulo, resolveOptions,
} from './model.js'
import type { BreakpointMode, Breakpoints, CarouselOptions } from './model.js'
import { NativeScroll } from './nativeScroll.js'
import type { NativeSettlement } from './nativeScroll.js'
import { CarouselContext, Slide, SlideContext, createCarouselStore, notifyCarouselRef } from './parts.js'
import type { CarouselControls, CarouselData, SlideProps, SlideRegistration } from './parts.js'

export type SlideChange = {
  from: number
  to: number
  currentSlideIndex: number
  prevSlideIndex: number
  slidingToIndex: number
  slidesCount: number
}

type SlidesContent = ReactNode | ((data: CarouselData) => ReactNode)
export interface CarouselProps extends CarouselOptions {
  children?: SlidesContent
  slides?: SlidesContent
  addons?: ReactNode | ((controls: CarouselControls) => ReactNode)
  breakpoints?: Breakpoints
  breakpointMode?: BreakpointMode
  className?: string
  classPrefix?: string
  style?: CSSProperties
  label?: string
  id?: string
  modelValue?: number
  defaultIndex?: number
  ref?: Ref<CarouselControls>
  onModelValueChange?: (index: number) => void
  onSlideStart?: (event: SlideChange) => void
  onSlideEnd?: (event: SlideChange) => void
  onLoop?: (event: SlideChange) => void
  onBeforeInit?: () => void
  onInit?: () => void
  onSlideRegistered?: (event: SlideRegistration) => void
  onSlideUnregistered?: (event: SlideRegistration) => void
  onDrag?: (position: { x: number; y: number; deltaX: number; deltaY: number }) => void
  onWheel?: (event: { deltaX: number; deltaY: number; isScrollingForward: boolean }) => void
}

type Motion = {
  from: number
  to: number
  requested: number
  virtual: number
  direction: number
  source: 'control' | 'scroll'
}
type Measurement = { width: number; height: number; viewport: number; sizes: number[]; heights: number[] }
type Gesture = { id: number; kind: string; x: number; y: number; distance: number; moved: boolean }
const emptyMeasurement: Measurement = { width: 0, height: 0, viewport: 0, sizes: [], heights: [] }

function collectSlides(children: ReactNode, parent = ''): { key: string; content: ReactNode }[] {
  return Children.toArray(children).flatMap((child, index) => {
    const key = parent + '/' + (isValidElement(child) ? child.key ?? index : index)
    return isValidElement<SlideProps>(child) && child.type === Fragment
      ? collectSlides(child.props.children as ReactNode, key)
      : [{ key, content: isValidElement(child) && child.type === Slide ? child : <Slide>{child}</Slide> }]
  })
}

function orderSlides(children: ReactNode) {
  const ordered: ReturnType<typeof collectSlides> = []
  for (const entry of collectSlides(children)) {
    const index = isValidElement<SlideProps>(entry.content) ? entry.content.props.index : undefined
    ordered.splice(index ?? ordered.length, 0, entry)
  }
  return ordered
}

function slideChange(from: number, to: number, requested: number, count: number, ended = false): SlideChange {
  return {
    from, to, currentSlideIndex: ended ? to : from, prevSlideIndex: from,
    slidingToIndex: requested, slidesCount: count,
  }
}

const getOriginalSlides = (track: HTMLElement | null) =>
  Array.from(track?.children ?? []).filter((child): child is HTMLElement =>
    child instanceof HTMLElement && child.hasAttribute('data-original-slide'))

const asPixels = (value: number) => value + 'px'
const isEqualList = (a: number[], b: number[]) => a.length === b.length && a.every((value, i) => value === b[i])
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Carousel({
  children, slides: namedSlides, addons, breakpoints, breakpointMode = 'viewport', className, classPrefix = 'carousel',
  label, id, style, modelValue, defaultIndex = 0, ref, onModelValueChange, onSlideStart, onSlideEnd, onLoop,
  onBeforeInit, onInit, onSlideRegistered, onSlideUnregistered, onDrag, onWheel, ...options
}: CarouselProps) {
  const instanceId = useId()
  const root = useRef<HTMLElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLOListElement>(null)
  const [renderData, setRenderData] = useState<CarouselData>(() => ({
    config: { ...resolveOptions(options, breakpoints, 0), breakpoints, breakpointMode, classPrefix, modelValue: modelValue ?? defaultIndex },
    currentSlide: modelValue ?? defaultIndex, maxSlide: 0, middleSlide: 0, minSlide: 0, slideSize: 0, slidesCount: 0,
  }))
  const slot = children ?? namedSlides
  const rendered = typeof slot === 'function' ? slot(renderData) : slot
  const slides = useMemo(() => orderSlides(rendered), [rendered])
  const count = slides.length
  const slideKeys = JSON.stringify(slides.map(({ key }) => key))
  const [measurement, setMeasurement] = useState(emptyMeasurement)
  const [stored, setStored] = useState(defaultIndex)
  const [motion, setMotion] = useState<Motion | null>(null)
  const [distance, setDistance] = useState(0)
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)
  const [paused, setPaused] = useState(prefersReducedMotion)
  const [reduced, setReduced] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [nativeSupport, setNativeSupport] = useState(true)
  const [controlsStore] = useState(createCarouselStore)
  const [autoplayEpoch, resetAutoplay] = useState(0)
  const [nativeVisible, setNativeVisible] = useState<number[] | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const clickBlock = useRef(0)
  const lastWheel = useRef(0)
  const measureNow = useRef<(() => void) | null>(null)
  const registry = useRef(new Map<string, SlideRegistration>())
  const initialized = useRef(false)
  const started = useRef(false)
  const unregister = useRef(onSlideUnregistered)
  const nativeSelection = useRef<number | null>(null)
  const pointerFocus = useRef(0)
  const nativeScroll = useRef<NativeScroll | null>(null)
  const nativeWasActive = useRef(false)
  const marqueeAnimation = useRef<Animation | null>(null)
  const config = resolveOptions(options, breakpoints, breakpointMode === 'carousel' ? measurement.width : measurement.viewport)
  const { vertical, reversed, axisSign } = getDirection(config.dir)
  const fade = config.slideEffect === 'fade'
  const marquee = config.marquee && config.enabled && !fade && count > 1
  const loop = config.wrapAround && count > 1
  const numeric = Math.max(1, Number(config.itemsToShow) || 1)
  const shown: number | 'auto' = fade ? 1 : config.itemsToShow === 'auto' ? 'auto' : config.clamp ? Math.min(numeric, Math.max(1, count)) : numeric
  const step = Math.max(1, Math.trunc(config.itemsToScroll) || 1)
  const gap = fade ? 0 : Math.max(0, config.gap)
  const edge = fade || loop || marquee ? 0 : Math.max(0, config.edgeSpacing)
  const viewportSize = vertical ? measurement.height : measurement.width
  const measuredLength = measurement.sizes.reduce((total, size) => total + size, 0) + gap * Math.max(0, count - 1)
  const allFit = shown === 'auto' ? viewportSize > 0 && measuredLength <= viewportSize + 1 : count <= shown
  const fitsWithoutLoop = !loop && count > 0 && (!fade || count === 1)
    && (shown === 'auto' ? viewportSize > 0 && measuredLength + edge <= viewportSize + 1
      : edge === 0 || !viewportSize ? allFit
        : (viewportSize - gap * (shown - 1)) / shown * count + gap * (count - 1) + edge <= viewportSize + 1)
  const native = config.nativeCss && nativeSupport && !fade && !marquee
    && !(vertical && reversed) && !(loop && allFit)
  const clones = marquee || (loop && !fade && !native)
    ? marquee || shown === 'auto' ? count : Math.min(count, Math.ceil(shown) + step)
    : 0
  const layout = useMemo(() => buildLayout({
    count, viewport: viewportSize, visible: shown, measured: measurement.sizes, gap, edge,
    clones, alignment: marquee ? 'start' : config.snapAlign, loop: !fade && !native && (loop || marquee),
  }), [count, viewportSize, shown, measurement.sizes, gap, edge, clones, marquee, config.snapAlign, loop, fade, native])
  const locked = config.disableWhenSlidesFit && fitsWithoutLoop && !marquee
  const interactive = config.enabled && !locked && !marquee && count > 1
  const raw = Math.trunc(modelValue ?? stored)
  const active = locked ? 0 : clampNumber(Number.isFinite(raw) ? raw : 0, 0, Math.max(0, count - 1))
  const moving = Boolean(motion && motion.to === active)
  const virtual = moving && clones ? clampNumber(motion!.virtual, layout.first, layout.last) : active
  const duration = reduced ? 0 : Math.max(0, config.transition)
  const offset = count ? layout.offset(marquee ? 0 : locked ? 0 : virtual) : 0
  const drawn = offset + distance
  let preview = virtual
  if (distance && !fade) {
    for (let index = layout.first; index <= layout.last; index += 1) {
      if (Math.abs(layout.offset(index) - drawn) < Math.abs(layout.offset(preview) - drawn)) preview = index
    }
  }
  const prefix = classPrefix.trim() || 'carousel'
  const viewportId = (id ?? instanceId) + '-viewport'
  const slideIds = slides.map(({ key, content }) =>
    (isValidElement<SlideProps>(content) ? content.props.id : undefined) ?? viewportId + '-slide-' + encodeURIComponent(key))
  const rotationAvailable = Boolean(config.enabled && !locked && (marquee || config.autoplay > 0 && count > 1))
  const rotationPaused = paused || focused || config.pauseAutoplayOnHover && hover || distance !== 0
  const status = (value: number) => formatLabel(config.i18n.itemXofY, { currentSlide: value + 1, slidesCount: count })
  const transform = (position: number) => vertical
    ? 'translate3d(0, ' + asPixels(-position * axisSign) + ', 0)'
    : 'translate3d(' + asPixels(-position * axisSign) + ', 0, 0)'

  useLayoutEffect(() => {
    const element = viewport.current
    const list = track.current
    if (!element || !list) return
    const originals = getOriginalSlides(list)
    function measure() {
      if (!element) return
      const sizes = shown === 'auto'
        ? originals.map((child) => vertical ? child.offsetHeight : child.offsetWidth)
        : []
      const heights = config.adaptiveHeight && !vertical ? originals.map((child) => child.offsetHeight) : []
      const width = element.clientWidth
      const height = vertical ? element.clientHeight : 0
      const screen = window.innerWidth
      setMeasurement((current) => {
        const sameSizes = isEqualList(current.sizes, sizes)
        const sameHeights = isEqualList(current.heights, heights)
        if (current.width === width && current.height === height && current.viewport === screen && sameSizes && sameHeights) return current
        return { width, height, viewport: screen, sizes: sameSizes ? current.sizes : sizes, heights: sameHeights ? current.heights : heights }
      })
    }
    measureNow.current = measure
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    if (shown === 'auto' || config.adaptiveHeight) originals.forEach((child) => observer?.observe(child))
    window.addEventListener('resize', measure)
    const ignored = typeof config.ignoreAnimations === 'string'
      ? config.ignoreAnimations.split(',').map((name) => name.trim()) : config.ignoreAnimations
    const running = new Map<HTMLElement, Set<string>>()
    let animationFrame = 0
    function tick() {
      measure()
      animationFrame = window.requestAnimationFrame(tick)
    }
    function startAnimation(event: AnimationEvent) {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.contains(root.current) || event.animationName === 'vc-marquee'
        || Array.isArray(ignored) && ignored.includes(event.animationName)) return
      const names = running.get(target) ?? new Set<string>()
      names.add(event.animationName)
      running.set(target, names)
      if (!animationFrame) animationFrame = window.requestAnimationFrame(tick)
    }
    function endAnimation(event: AnimationEvent) {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const names = running.get(target)
      names?.delete(event.animationName)
      if (names?.size === 0) running.delete(target)
      if (!running.size) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = 0
        measure()
      }
    }
    if (ignored !== true) {
      document.addEventListener('animationstart', startAnimation)
      document.addEventListener('animationend', endAnimation)
      document.addEventListener('animationcancel', endAnimation)
    }
    return () => {
      measureNow.current = null
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      window.cancelAnimationFrame(animationFrame)
      document.removeEventListener('animationstart', startAnimation)
      document.removeEventListener('animationend', endAnimation)
      document.removeEventListener('animationcancel', endAnimation)
    }
  }, [slideKeys, shown, vertical, config.adaptiveHeight, config.ignoreAnimations])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      setReduced(query.matches)
      if (query.matches) setPaused(true)
    }
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useLayoutEffect(() => {
    setNativeSupport(typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('scroll-snap-type', 'x mandatory'))
  }, [])

  const requestSlide = useCallback((target: number, source: 'control' | 'scroll' = 'control', direction = 0) => {
    if (!interactive || !Number.isFinite(target)) return
    const requested = Math.trunc(target)
    const to = loop ? modulo(requested, count) : clampNumber(requested, 0, count - 1)
    if (to === active) return
    if (!native && motion?.to === active) onSlideEnd?.(slideChange(motion.from, motion.to, motion.requested, count, true))
    const event = slideChange(active, to, requested, count)
    const displacement = requested < 0 || requested >= count ? requested - active : to - active
    const nextVirtual = virtual + displacement
    const canAnimateWrapped = clones && nextVirtual >= layout.first && nextVirtual <= layout.last
    onSlideStart?.(event)
    setMotion({ from: active, to, requested, virtual: canAnimateWrapped ? nextVirtual : to, direction, source })
    if (modelValue === undefined) setStored(to)
    onModelValueChange?.(to)
    if (!native && loop && requested !== to) onLoop?.(event)
  }, [interactive, loop, count, active, virtual, clones, layout, native, modelValue, onSlideStart, onModelValueChange, onSlideEnd, onLoop, motion])

  const advance = useCallback((direction: number) => {
    requestSlide(getStepTarget(active, direction, step, count, shown, config.snapAlign, loop), 'control', direction)
  }, [requestSlide, active, step, count, shown, config.snapAlign, loop])
  const lastModel = useRef({ value: modelValue, index: active })
  useLayoutEffect(() => {
    const previous = lastModel.current
    lastModel.current = { value: modelValue, index: active }
    if (nativeSelection.current === active) {
      nativeSelection.current = null
      return
    }
    if (modelValue === undefined || previous.value === undefined || previous.value === modelValue
      || previous.index === active || moving || !interactive) return
    const candidates = [active, active - count, active + count]
    const requested = !native && loop && shown !== 'auto'
      ? candidates.reduce((best, candidate) => Math.abs(candidate - previous.index) < Math.abs(best - previous.index) ? candidate : best)
      : active
    const event = slideChange(previous.index, active, requested, count)
    onSlideStart?.(event)
    setMotion({ from: previous.index, to: active, requested, source: 'control', direction: 0,
      virtual: clampNumber(requested, layout.first, layout.last) })
    if (!native && requested !== active) onLoop?.(event)
  }, [active, modelValue, moving, interactive, native, loop, shown, count, layout.first, layout.last, onSlideStart, onLoop])

  const lastLock = useRef(false)
  useLayoutEffect(() => {
    if (locked && !lastLock.current && raw !== 0) {
      if (modelValue === undefined) setStored(0)
      onModelValueChange?.(0)
    }
    lastLock.current = locked
  }, [locked, raw, modelValue, onModelValueChange])

  const lifecycleCallbacks = useRef({ onSlideEnd, status })
  useLayoutEffect(() => {
    lifecycleCallbacks.current = { onSlideEnd, status }
  })
  useEffect(() => {
    if (native || !moving || !motion) return
    const timer = window.setTimeout(() => {
      lifecycleCallbacks.current.onSlideEnd?.(slideChange(motion.from, motion.to, motion.requested, count, true))
      setAnnouncement(lifecycleCallbacks.current.status(motion.to))
      setMotion(null)
    }, duration)
    return () => window.clearTimeout(timer)
  }, [duration, motion, moving, native, count])

  useEffect(() => {
    if (!interactive || !(config.autoplay > 0) || rotationPaused) return
    const timer = window.setInterval(() => advance(1), Math.max(config.autoplay, duration))
    return () => window.clearInterval(timer)
  }, [config.autoplay, interactive, rotationPaused, advance, duration, autoplayEpoch])

  useEffect(() => {
    const list = track.current
    const span = layout.start(count) - layout.start(0)
    if (!list || !marquee || !span || !list.animate) return
    const axisTransform = (position: number) => vertical
      ? 'translate3d(0, ' + asPixels(-position * axisSign) + ', 0)'
      : 'translate3d(' + asPixels(-position * axisSign) + ', 0, 0)'
    const animation = list.animate([
      { transform: axisTransform(layout.start(0)) }, { transform: axisTransform(layout.start(count)) },
    ], { duration: span * 1000 / Math.max(1, config.marqueeSpeed), iterations: Infinity })
    marqueeAnimation.current = animation
    return () => {
      animation.cancel()
      marqueeAnimation.current = null
    }
  }, [marquee, layout, count, vertical, axisSign, config.marqueeSpeed])

  useEffect(() => {
    if (rotationPaused) marqueeAnimation.current?.pause()
    else marqueeAnimation.current?.play()
  }, [rotationPaused, layout, marquee, config.marqueeSpeed, vertical, axisSign])

  const nativeState = useRef({
    index: active, accept: (_change: NativeSettlement) => {},
  })
  useLayoutEffect(() => {
    nativeState.current = {
      index: locked ? 0 : active,
      accept(change) {
        if (!interactive) return
        const requested = motion?.to === change.to ? motion.requested : change.to
        const event = slideChange(change.from, change.to, requested, count, true)
        if (!change.superseded && active !== change.to) {
          nativeSelection.current = change.to
          requestSlide(change.to, 'scroll')
        }
        if (change.wrapped) onLoop?.(event)
        onSlideEnd?.(event)
        setAnnouncement(status(change.to))
        if (!change.superseded) setMotion(null)
      },
    }
  })

  useLayoutEffect(() => {
    const element = viewport.current
    const list = track.current
    if (!element || !list) return
    if (!native) {
      if (nativeWasActive.current) {
        element.scrollTo({ left: 0, top: 0, behavior: 'instant' })
        setNativeVisible(null)
      }
      nativeWasActive.current = false
      return
    }
    if (!viewportSize || !count) return
    nativeWasActive.current = true
    const controller = new NativeScroll(element, list, {
      vertical, reversed, shown, alignment: config.snapAlign, edge, loop, step,
    }, nativeState.current.index, (change) => nativeState.current.accept(change),
    (indexes) => setNativeVisible((old) => old && isEqualList(old, indexes) ? old : indexes))
    nativeScroll.current = controller
    return () => {
      controller.destroy()
      nativeScroll.current = null
    }
  }, [native, slideKeys, count, viewportSize, vertical, reversed, shown, config.snapAlign, edge, loop, step, measurement.sizes])

  useLayoutEffect(() => {
    if (motion?.source === 'scroll' || !native || !interactive) return
    const direction = moving ? motion?.direction ?? 0 : 0
    nativeScroll.current?.go(active, direction, duration > 0 && !prefersReducedMotion())
  }, [active, motion, moving, duration, native, interactive])

  const wheel = config.mouseWheel
  const wheelThreshold = config.mouseScrollThreshold
  useEffect(() => {
    const element = viewport.current
    if (native || !wheel || !element || !interactive) return
    const config = typeof wheel === 'object' ? wheel : {}
    const handleWheel = (event: WheelEvent) => {
      const threshold = Math.max(0, config.threshold ?? wheelThreshold)
      const primary = vertical ? event.deltaY : event.deltaX
      const cross = vertical ? event.deltaX : event.deltaY
      if (config.ignoreCrossAxis && Math.abs(cross) > Math.abs(primary)) return
      const amount = Math.abs(primary) > threshold ? primary : cross
      if (Math.abs(amount) <= threshold) return
      const direction = Math.sign(amount) * axisSign
      if (!loop && ((direction < 0 && active <= 0) || (direction > 0 && active >= count - 1))) return
      event.preventDefault()
      const now = performance.now()
      if (lastWheel.current && now - lastWheel.current < (config.throttleTime ?? Math.max(160, duration))) return
      lastWheel.current = now
      onWheel?.({ deltaX: event.deltaX, deltaY: event.deltaY, isScrollingForward: direction > 0 })
      advance(direction)
    }
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [native, wheel, wheelThreshold, interactive, vertical, axisSign, loop, active, count, duration, advance, onWheel])

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget && event.target !== viewport.current) return
    if (!interactive || !config.keyboardNavigation || event.altKey || event.metaKey || event.ctrlKey) return
    const previousKey = vertical ? 'ArrowUp' : 'ArrowLeft'
    const nextKey = vertical ? 'ArrowDown' : 'ArrowRight'
    if (event.key === previousKey || event.key === nextKey) {
      event.preventDefault()
      advance((event.key === nextKey ? 1 : -1) * axisSign)
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const kind = event.pointerType
    if (native || !interactive || !event.isPrimary || event.button !== 0 || gesture.current) return
    if (kind === 'touch' ? !config.touchDrag : !config.mouseDrag) return
    gesture.current = { id: event.pointerId, kind, x: event.clientX, y: event.clientY, distance: 0, moved: false }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current
    if (!current || current.id !== event.pointerId) return
    const x = event.clientX - current.x
    const y = event.clientY - current.y
    const main = vertical ? y : x
    const cross = vertical ? x : y
    if (!current.moved && Math.abs(cross) > 8 && Math.abs(cross) > Math.abs(main)) {
      gesture.current = null
      return
    }
    if (!current.moved && Math.abs(main) < 6) return
    if (!current.moved) event.currentTarget.setPointerCapture(event.pointerId)
    current.moved = true
    const projected = -main * axisSign
    const applied = !loop && config.preventExcessiveDragging
      ? clampNumber(projected, -offset, layout.maximum - offset)
      : projected
    current.distance = projected
    setDistance(applied)
    onDrag?.({ x, y, deltaX: x, deltaY: y })
  }

  function endGesture(event: PointerEvent<HTMLDivElement>, canceled = false) {
    const current = gesture.current
    if (!current || current.id !== event.pointerId) return
    gesture.current = null
    if (!current.moved) return
    clickBlock.current = performance.now() + 350
    setDistance(0)
    if (canceled) return
    const drag = current.kind === 'touch' ? config.touchDrag : config.mouseDrag
    const threshold = typeof drag === 'object' ? drag.threshold ?? 0.08 : 0.08
    const size = layout.size(active) + gap
    const amount = Math.abs(current.distance)
    if (amount >= Math.max(6, size * threshold)) {
      const steps = Math.max(1, Math.round(amount / Math.max(1, size)))
      requestSlide(active + Math.sign(current.distance) * steps)
    }
  }

  const visibleAt = (index: number) => {
    if (marquee) return true
    if (fade) return index === active
    if (native && nativeVisible) return nativeVisible.includes(index)
    if (!viewportSize) return index >= active && index < active + (shown === 'auto' ? 1 : shown)
    const position = layout.start(index)
    return position + layout.size(index) > drawn + 0.5 && position < drawn + viewportSize - 0.5
  }
  const height = config.adaptiveHeight && !vertical
    ? Math.max(0, ...measurement.heights.filter((_, index) => visibleAt(index)
      || clones > 0 && (visibleAt(index - count) || visibleAt(index + count))))
    : 0
  const indexes = Array.from({ length: count + 2 * clones }, (_, index) => index - clones).filter((index) => visibleAt(index))
  const visibleRange = { min: indexes[0] ?? 0, max: indexes[indexes.length - 1] ?? 0 }
  const effective = {
    ...config, itemsToShow: shown, gap, edgeSpacing: edge, wrapAround: loop,
    modelValue: active, classPrefix: prefix, breakpoints, breakpointMode, nativeCss: native,
    mouseDrag: native ? false : config.mouseDrag, touchDrag: native ? false : config.touchDrag,
    mouseWheel: native ? false : config.mouseWheel,
    preventExcessiveDragging: native || loop ? false : config.preventExcessiveDragging,
  }
  const data: CarouselData = {
    config: effective, currentSlide: active, minSlide: 0, maxSlide: Math.max(0, count - 1),
    middleSlide: Math.max(0, Math.ceil((count - 1) / 2)),
    slideSize: shown === 'auto' ? (count ? measuredLength - gap * (count - 1) : 0) / Math.max(count, 1) : layout.fixedSize,
    slidesCount: count,
  }
  const refresh = () => { measureNow.current?.() }
  const navigate = {
    prev: (allowWhileSliding?: boolean) => { if (allowWhileSliding !== false || !moving) advance(-1) },
    next: (allowWhileSliding?: boolean) => { if (allowWhileSliding !== false || !moving) advance(1) },
    slideTo: (index: number, allowWhileSliding?: boolean) => {
      if (allowWhileSliding !== false || !moving) requestSlide(index)
    },
  }
  const controls: CarouselControls = {
    ...data, ...navigate, data, nav: navigate, activeSlide: modulo(preview, count),
    isSliding: moving || distance !== 0, isVertical: vertical, isReversed: reversed, isNative: native,
    isMarquee: marquee, isLocked: locked, allSlidesFit: fitsWithoutLoop,
    slides: [], slideIds, viewport: null, viewportId, visibleRange,
    canPrev: interactive && (loop || active > 0), canNext: interactive && (loop || active < count - 1),
    updateSlideSize: refresh, updateSlidesData: refresh, updateBreakpointsConfig: refresh,
    restartCarousel: () => { refresh(); resetAutoplay((value) => value + 1) },
  }

  useImperativeHandle(ref, () => controlsStore.handle, [controlsStore])
  useLayoutEffect(() => {
    if (typeof slot === 'function') {
      const serialized = JSON.stringify(data)
      setRenderData((previous) => JSON.stringify(previous) === serialized ? previous : data)
    }
    unregister.current = onSlideUnregistered
    if (!started.current) {
      started.current = true
      onBeforeInit?.()
    }
    const elements = getOriginalSlides(track.current)
    const next = new Map(slides.flatMap(({ key }, index) => {
      const slide = elements[index]
      return slide ? [[key, { index, slide }] as const] : []
    }))
    for (const [key, value] of registry.current) if (!next.has(key)) onSlideUnregistered?.(value)
    for (const [key, value] of next) if (!registry.current.has(key)) onSlideRegistered?.(value)
    registry.current = next
    controlsStore.publish({ ...controls, slides: elements, viewport: viewport.current })
    if (ref && typeof ref === 'object') notifyCarouselRef(ref)
    if (!initialized.current && (measurement.width > 0 || count === 0)) {
      initialized.current = true
      onInit?.()
    }
  })
  const latestRef = useRef(ref)
  useLayoutEffect(() => { latestRef.current = ref })
  useEffect(() => () => {
    queueMicrotask(() => {
      if (root.current) return
      for (const value of registry.current.values()) unregister.current?.(value)
      registry.current.clear()
      controlsStore.clear()
      if (latestRef.current && typeof latestRef.current === 'object') notifyCarouselRef(latestRef.current)
    })
  }, [controlsStore])

  const classes = [
    prefix, className, vertical && 'is-vertical', vertical && reversed && 'is-bottom-to-top',
    native && 'is-native', fade && 'is-fade', marquee && 'is-marquee',
    !native && interactive && config.mouseDrag && 'is-draggable',
    !config.enabled && 'is-disabled',
    distance !== 0 && 'is-dragging', locked && 'is-locked',
    config.adaptiveHeight && !vertical && 'is-adaptive',
  ].filter(Boolean).join(' ')
  const css = {
    '--vc-gap': asPixels(gap), '--vc-edge': asPixels(edge),
    '--vc-size': shown === 'auto' ? 'auto' : viewportSize ? asPixels(layout.fixedSize)
      : 'calc((100% - ' + asPixels(gap * (shown - 1)) + ') / ' + shown + ')',
    '--vc-transform': fade ? 'none' : transform(drawn),
    '--vc-align': ['start', 'end'].includes(config.snapAlign) ? config.snapAlign : 'center',
    '--vc-duration': (distance || !moving ? 0 : duration) + 'ms',
    '--vc-easing': config.transitionEasing,
    ...style,
  } as CSSProperties

  return <CarouselContext.Provider value={controls}>
    <section ref={root} id={id} className={classes} style={css} tabIndex={config.enabled && count > 0 ? 0 : undefined}
      aria-roledescription="carousel" aria-label={label ?? formatLabel(config.i18n.ariaGallery, { id: id ?? instanceId })}
      dir={!vertical && reversed ? 'rtl' : undefined} onKeyDown={onKeyDown}
      onPointerDownCapture={() => { pointerFocus.current = performance.now() + 250 }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocusCapture={() => {
        if (performance.now() > pointerFocus.current) setFocused(true)
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}>
      {rotationAvailable && <button type="button" className={prefix + '__rotation'}
        onClick={() => { setPaused(!paused); if (paused) setFocused(false) }}>
        {paused ? 'Start rotation' : 'Pause rotation'}
      </button>}
      {typeof addons === 'function' ? addons(controls) : addons}
      <div id={viewportId} className={prefix + '__viewport'} ref={viewport}
        style={{
          height: height || config.height,
          touchAction: native ? undefined : vertical ? 'pan-x pinch-zoom' : 'pan-y pinch-zoom',
        }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerLeave={() => { if (gesture.current && !gesture.current.moved) gesture.current = null }}
        onPointerUp={(event) => endGesture(event)}
        onPointerCancel={(event) => endGesture(event, true)}
        onLostPointerCapture={(event) => endGesture(event, true)}
        onDragStart={(event) => { if (gesture.current) event.preventDefault() }}
        onClickCapture={(event) => {
          if (event.detail && performance.now() < clickBlock.current) {
            event.preventDefault()
            event.stopPropagation()
          }
          clickBlock.current = 0
        }}
        onFocusCapture={(event) => {
          if (!config.autoScrollOnFocus || performance.now() < pointerFocus.current) return
          const slide = (event.target as HTMLElement).closest<HTMLElement>('[data-original-slide]')
          if (slide?.parentElement === track.current) requestSlide(Number(slide.dataset.originalSlide))
        }}>
        <ol className={prefix + '__track'} ref={track}>
          {Array.from({ length: count + 2 * clones }, (_, position) => {
            const physical = position - clones
            const index = modulo(physical, count)
            const clone = index !== physical
            const visible = visibleAt(physical)
            const neighbor = (step: number) => native && loop ? modulo(preview + step, count) : preview + step
            return <SlideContext.Provider key={clone ? 'clone/' + physical : 'slide/' + slides[index].key} value={{
              prefix, label: status(index), id: slideIds[index], interactive: visible && !clone,
              state: {
                currentIndex: index, isActive: !marquee && physical === preview, isClone: clone,
                isNext: !marquee && physical === neighbor(1), isPrev: !marquee && physical === neighbor(-1),
                isSliding: controls.isSliding, isVisible: visible,
              },
            }}>
              {slides[index].content}
            </SlideContext.Provider>
          })}
        </ol>
      </div>
      <div className={prefix + '__status'} role="status" aria-live={rotationAvailable && !rotationPaused ? 'off' : 'polite'}
        aria-atomic="true">{announcement}</div>
    </section>
  </CarouselContext.Provider>
}
