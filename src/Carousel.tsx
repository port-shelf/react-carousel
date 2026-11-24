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
import { CarouselContext, Slide, SlideContext } from './parts.js'
import type { CarouselControls, SlideProps } from './parts.js'

export type SlideChange = { from: number; to: number }
export interface CarouselProps extends CarouselOptions {
  children?: ReactNode
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
  onDrag?: (position: { x: number; y: number }) => void
  onWheel?: (event: { deltaX: number; deltaY: number; isScrollingForward: boolean }) => void
}

type Motion = SlideChange & { virtual: number }
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

const asPixels = (value: number) => value + 'px'
const isEqualList = (a: number[], b: number[]) => a.length === b.length && a.every((value, i) => value === b[i])
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Carousel({
  children, addons, breakpoints, breakpointMode = 'viewport', className, classPrefix = 'carousel',
  label, id, style, modelValue, defaultIndex = 0, ref, onModelValueChange, onSlideStart, onSlideEnd, onLoop,
  onDrag, onWheel, ...options
}: CarouselProps) {
  const instanceId = useId()
  const root = useRef<HTMLElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLOListElement>(null)
  const slides = useMemo(() => collectSlides(children), [children])
  const count = slides.length
  const [measurement, setMeasurement] = useState(emptyMeasurement)
  const [stored, setStored] = useState(defaultIndex)
  const [motion, setMotion] = useState<Motion | null>(null)
  const [distance, setDistance] = useState(0)
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)
  const [paused, setPaused] = useState(prefersReducedMotion)
  const [reduced, setReduced] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const gesture = useRef<Gesture | null>(null)
  const clickBlock = useRef(0)
  const pointerFocus = useRef(0)
  const nativeTarget = useRef<number | null>(null)
  const marqueeAnimation = useRef<Animation | null>(null)
  const config = resolveOptions(options, breakpoints, breakpointMode === 'carousel' ? measurement.width : measurement.viewport)
  const { vertical, reversed, axisSign } = getDirection(config.dir)
  const fade = config.slideEffect === 'fade'
  const marquee = config.marquee && config.enabled && !fade && count > 1
  const loop = config.wrapAround && count > 1
  const native = config.nativeCss && !fade && !marquee && !loop && !(vertical && reversed)
  const numeric = Math.max(1, Number(config.itemsToShow) || 1)
  const shown = fade ? 1 : config.itemsToShow === 'auto' ? 'auto' : config.clamp ? Math.min(numeric, Math.max(1, count)) : numeric
  const step = Math.max(1, Math.trunc(config.itemsToScroll) || 1)
  const gap = fade ? 0 : Math.max(0, config.gap)
  const edge = fade || loop || marquee ? 0 : Math.max(0, config.edgeSpacing)
  const clones = marquee || (loop && !fade)
    ? marquee || shown === 'auto' ? count : Math.min(count, Math.ceil(shown) + step)
    : 0
  const viewportSize = vertical ? measurement.height : measurement.width
  const layout = useMemo(() => buildLayout({
    count, viewport: viewportSize, visible: shown, measured: measurement.sizes, gap, edge,
    clones, alignment: marquee ? 'start' : config.snapAlign, loop: !fade && (loop || marquee),
  }), [count, viewportSize, shown, measurement.sizes, gap, edge, clones, marquee, config.snapAlign, loop, fade])
  const locked = config.disableWhenSlidesFit && !loop && !marquee && !fade &&
    (shown === 'auto' ? viewportSize > 0 && layout.maximum <= 0.5 : count <= shown)
  const interactive = config.enabled && !locked && !marquee && count > 1
  const raw = Math.trunc(modelValue ?? stored)
  const active = clampNumber(Number.isFinite(raw) ? raw : 0, 0, Math.max(0, count - 1))
  const moving = Boolean(motion && motion.to === active)
  const virtual = moving && clones ? clampNumber(motion!.virtual, layout.first, layout.last) : active
  const duration = reduced ? 0 : Math.max(0, config.transition)
  const offset = count ? layout.offset(marquee ? 0 : locked ? 0 : virtual) : 0
  const drawn = offset + distance
  const prefix = classPrefix.trim() || 'carousel'
  const viewportId = (id ?? instanceId) + '-viewport'
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
    const originals = Array.from(list.children).filter((child): child is HTMLElement =>
      child instanceof HTMLElement && child.hasAttribute('data-original-slide'))
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
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    if (shown === 'auto' || config.adaptiveHeight) originals.forEach((child) => observer?.observe(child))
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [slides, shown, vertical, config.adaptiveHeight])

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

  const requestSlide = useCallback((target: number, source: 'control' | 'scroll' = 'control') => {
    if (!interactive || !Number.isFinite(target)) return
    const requested = Math.trunc(target)
    const to = loop ? modulo(requested, count) : clampNumber(requested, 0, count - 1)
    if (to === active) return
    const event = { from: active, to }
    const displacement = requested < 0 || requested >= count ? requested - active : to - active
    const nextVirtual = virtual + displacement
    const canAnimateWrapped = clones && nextVirtual >= layout.first && nextVirtual <= layout.last
    onSlideStart?.(event)
    setMotion({ ...event, virtual: canAnimateWrapped ? nextVirtual : to })
    if (native) nativeTarget.current = source === 'control' ? layout.offset(to) : null
    if (modelValue === undefined) setStored(to)
    onModelValueChange?.(to)
    if (loop && requested !== to) onLoop?.(event)
  }, [interactive, loop, count, active, virtual, clones, layout, native, modelValue, onSlideStart, onModelValueChange, onLoop])

  const advance = useCallback((direction: number) => {
    requestSlide(getStepTarget(active, direction, step, count, shown, config.snapAlign, loop))
  }, [requestSlide, active, step, count, shown, config.snapAlign, loop])
  const prev = () => advance(-1)
  const next = () => advance(1)
  const controls = { currentSlide: active, slidesCount: count, prev, next, slideTo: requestSlide }
  useImperativeHandle(ref, () => controls)

  const lifecycleCallbacks = useRef({ onSlideEnd, status })
  useLayoutEffect(() => {
    lifecycleCallbacks.current = { onSlideEnd, status }
  })
  useEffect(() => {
    if (!moving || !motion) return
    const timer = window.setTimeout(() => {
      lifecycleCallbacks.current.onSlideEnd?.({ from: motion.from, to: motion.to })
      setAnnouncement(lifecycleCallbacks.current.status(motion.to))
      setMotion(null)
    }, duration)
    return () => window.clearTimeout(timer)
  }, [duration, motion, moving])

  useEffect(() => {
    if (!interactive || !(config.autoplay > 0) || rotationPaused) return
    const timer = window.setInterval(() => advance(1), Math.max(config.autoplay, duration))
    return () => window.clearInterval(timer)
  }, [config.autoplay, interactive, rotationPaused, advance, duration])

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

  useLayoutEffect(() => {
    const element = viewport.current
    if (!native || !element || !viewportSize || gesture.current?.moved) return
    const current = vertical ? element.scrollTop : element.scrollLeft * axisSign
    if (Math.abs(current - offset) < 1) return
    const behavior = nativeTarget.current !== null && duration > 0 ? 'smooth' : 'instant'
    element.scrollTo(vertical ? { top: offset, behavior } : { left: offset * axisSign, behavior })
  }, [native, viewportSize, offset, axisSign, vertical, duration, distance])

  useEffect(() => {
    const element = viewport.current
    if (!element || !native || !interactive) return
    let timer: number | undefined
    function settle() {
      if (!element || gesture.current?.moved) return
      const position = vertical ? element.scrollTop : element.scrollLeft * axisSign
      if (nativeTarget.current !== null) {
        const reached = Math.abs(position - nativeTarget.current) < 2
        nativeTarget.current = null
        if (reached) return
      }
      if (Math.abs(position - layout.offset(active)) < 2) return
      let nearest = position >= layout.maximum - 1 ? count - 1 : 0
      for (let index = 0; index < count; index += 1) {
        if (Math.abs(position - layout.offset(index)) < Math.abs(position - layout.offset(nearest))) nearest = index
      }
      requestSlide(nearest, 'scroll')
    }
    const fallback = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(settle, 120)
    }
    const event = 'onscrollend' in element ? 'scrollend' : 'scroll'
    element.addEventListener(event, event === 'scrollend' ? settle : fallback, { passive: true })
    return () => {
      window.clearTimeout(timer)
      element.removeEventListener(event, event === 'scrollend' ? settle : fallback)
    }
  }, [native, interactive, layout, active, axisSign, vertical, count, requestSlide])

  const wheel = config.mouseWheel
  useEffect(() => {
    const element = viewport.current
    if (!wheel || !element || !interactive) return
    const config = typeof wheel === 'object' ? wheel : {}
    let lastMovement = 0
    const handleWheel = (event: WheelEvent) => {
      const threshold = Math.max(0, config.threshold ?? 10)
      const primary = vertical ? event.deltaY : event.deltaX
      const cross = vertical ? event.deltaX : event.deltaY
      if (config.ignoreCrossAxis && Math.abs(cross) > Math.abs(primary)) return
      const amount = Math.abs(primary) > threshold ? primary : cross
      if (Math.abs(amount) <= threshold) return
      const direction = Math.sign(amount) * axisSign
      if (!loop && ((direction < 0 && active <= 0) || (direction > 0 && active >= count - 1))) return
      event.preventDefault()
      const now = performance.now()
      if (lastMovement && now - lastMovement < (config.throttleTime ?? Math.max(160, duration))) return
      lastMovement = now
      onWheel?.({ deltaX: event.deltaX, deltaY: event.deltaY, isScrollingForward: direction > 0 })
      advance(direction)
    }
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [wheel, interactive, vertical, axisSign, loop, active, count, duration, advance, onWheel])

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
    if (!interactive || !event.isPrimary || event.button !== 0 || gesture.current) return
    if ((kind === 'touch' ? !config.touchDrag || native : !config.mouseDrag)) return
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
    if (native) {
      if (vertical) event.currentTarget.scrollTop = offset + applied
      else event.currentTarget.scrollLeft = (offset + applied) * axisSign
    }
    onDrag?.({ x, y })
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
    if (!viewportSize) return index >= active && index < active + (shown === 'auto' ? 1 : shown)
    const position = layout.start(index)
    return position + layout.size(index) > drawn + 0.5 && position < drawn + viewportSize - 0.5
  }
  const height = config.adaptiveHeight && !vertical
    ? Math.max(0, ...measurement.heights.filter((_, index) => visibleAt(index)
      || clones > 0 && (visibleAt(index - count) || visibleAt(index + count))))
    : 0
  const classes = [
    prefix, className, vertical && 'is-vertical', vertical && reversed && 'is-bottom-to-top',
    native && 'is-native', fade && 'is-fade', marquee && 'is-marquee',
    interactive && config.mouseDrag && 'is-draggable',
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

  return <CarouselContext.Provider value={{
    ...controls, prefix, viewportId, step, pageSize: shown === 'auto' ? 1 : Math.max(1, Math.floor(shown)),
    previous: interactive && (loop || active > 0), following: interactive && (loop || active < count - 1),
    locked: locked || marquee, vertical, reversed, labels: config.i18n,
  }}>
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
          touchAction: native && config.touchDrag ? undefined : vertical ? 'pan-x pinch-zoom' : 'pan-y pinch-zoom',
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
            const neighbor = (step: number) => loop ? modulo(active + step, count) : active + step
            return <SlideContext.Provider key={clone ? 'clone/' + physical : 'slide/' + slides[index].key} value={{
              prefix, label: status(index), interactive: visible && !clone,
              state: {
                currentIndex: index, isActive: !marquee && physical === virtual, isClone: clone,
                isNext: !marquee && index === neighbor(1), isPrev: !marquee && index === neighbor(-1),
                isSliding: moving, isVisible: visible,
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
