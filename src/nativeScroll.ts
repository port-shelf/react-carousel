import { clampNumber, modulo } from './model.js'
import type { SnapAlign } from './model.js'

interface NativeOptions {
  vertical: boolean
  reversed: boolean
  alignment: SnapAlign
  edge: number
  shown: number | 'auto'
  loop: boolean
  step: number
}

interface Movement {
  index: number
  direction: number
  smooth: boolean
}

interface Pending extends Movement {
  origin: number
  target: number
}

export interface NativeSettlement {
  from: number
  to: number
  wrapped: boolean
  superseded: boolean
}

export class NativeScroll {
  private order = 0
  private pending: Pending | null = null
  private queued: Movement | null = null
  private timer = 0
  private frame = 0
  private restoreFrame = 0
  private settling = false
  private readonly elements: HTMLElement[]
  private readonly sign: number
  private readonly axis: 'x' | 'y'
  private readonly event: 'scrollend' | 'scroll'

  constructor(
    private readonly viewport: HTMLElement,
    private readonly track: HTMLElement,
    private readonly options: NativeOptions,
    private current: number,
    private readonly onSettled: (change: NativeSettlement) => void,
    private readonly onVisible: (indexes: number[]) => void,
  ) {
    this.elements = Array.from(track.children).filter((child): child is HTMLElement =>
      child instanceof HTMLElement && child.hasAttribute('data-original-slide'))
    this.sign = options.reversed ? -1 : 1
    this.axis = options.vertical ? 'y' : 'x'
    this.event = 'onscrollend' in viewport ? 'scrollend' : 'scroll'
    if (options.loop && this.elements.length > 2) {
      this.reorder(modulo(current - this.buffers().before, this.elements.length), current, false)
    }
    this.scroll(this.offsetFor(current), 'instant')
    this.updateVisible()
    viewport.addEventListener(this.event, this.handleEnd, { passive: true })
    viewport.addEventListener('scroll', this.handleScroll, { passive: true })
  }

  go(index: number, direction: number, smooth: boolean) {
    if (!this.elements[index]) return
    if (this.pending || this.settling) {
      this.queued = this.pending?.index === index ? null : { index, direction, smooth }
      return
    }
    if (index === this.current && Math.abs(this.offsetFor(index) - this.position()) < 1) return
    this.move({ index, direction, smooth })
  }

  destroy() {
    this.viewport.removeEventListener(this.event, this.handleEnd)
    this.viewport.removeEventListener('scroll', this.handleScroll)
    window.clearTimeout(this.timer)
    window.cancelAnimationFrame(this.frame)
    this.restore()
    this.elements.forEach((slide) => slide.style.removeProperty('--vc-native-order'))
  }

  private move(movement: Movement) {
    const { index, direction, smooth } = movement
    const count = this.elements.length
    if (this.options.loop && this.current !== index) {
      if (direction === 0) {
        // A direct selection follows the logical slide order.
        this.reorder(0, this.current, false)
      } else {
        const currentSlot = this.slot(this.current)
        const travel = modulo((index - this.current) * direction, count)
        const destination = currentSlot + direction * travel
        if (destination < 0 || destination >= count) {
          const slot = direction > 0 ? Math.min(currentSlot, count - 1 - travel) : Math.max(currentSlot, travel)
          this.reorder(modulo(this.current - slot, count), this.current, false)
        }
      }
    }
    const target = this.offsetFor(index)
    const origin = this.position()
    this.pending = { ...movement, origin, target }
    if (Math.abs(target - origin) < 1 || !smooth) {
      this.scroll(target, 'instant')
      this.settle()
    } else {
      this.scroll(target, 'smooth')
    }
  }

  private readonly handleEnd = () => {
    if (this.event === 'scrollend') this.settle()
    else {
      window.clearTimeout(this.timer)
      this.timer = window.setTimeout(() => this.settle(), 140)
    }
  }

  private readonly handleScroll = () => {
    if (this.frame) return
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0
      this.updateVisible()
    })
  }

  private settle() {
    if (this.settling || this.restoreFrame) return
    const position = this.position()
    const pending = this.pending
    if (pending && Math.abs(position - pending.origin) < 1 && Math.abs(position - pending.target) > 1) return
    const reached = pending && Math.abs(position - pending.target) < 2
    const index = reached ? pending.index : this.nearest(position)
    const from = this.current
    const direction = reached && pending.direction ? pending.direction : Math.sign(this.slot(index) - this.slot(from))
    const wrapped = this.options.loop && index !== from && direction !== 0 && Math.sign(index - from) !== direction
    this.pending = null
    this.current = index
    this.settling = true
    const next = this.queued
    this.queued = null

    if (this.options.loop && this.elements.length > 2) {
      const { before, after } = this.buffers()
      const position = this.slot(index)
      if (position < before || position >= this.elements.length - after) {
        this.reorder(modulo(index - before, this.elements.length), index, !next, true)
      }
    }

    this.updateVisible()
    if (from !== index) this.onSettled({ from, to: index, wrapped, superseded: next !== null })
    this.settling = false
    if (next && next.index !== index) this.move(next)
  }

  private nearest(position: number) {
    if (Math.abs(position - this.offsetFor(this.current)) < 1) return this.current
    const count = this.elements.length
    let nearest = position >= this.maximum() - 1 ? modulo(this.order + count - 1, count) : this.order
    let distance = Math.abs(this.offsetFor(nearest) - position)
    for (let index = 0; index < count; index += 1) {
      const candidate = Math.abs(this.offsetFor(index) - position)
      if (candidate < distance - 0.5) {
        distance = candidate
        nearest = index
      }
    }
    return nearest
  }

  private slot(index: number) {
    return modulo(index - this.order, this.elements.length)
  }

  private buffers() {
    const count = this.elements.length
    const shown = this.options.shown === 'auto' ? 1 : this.options.shown
    const step = Math.min(this.options.step, Math.floor((count - 1) / 2))
    const surround = Math.ceil((shown - 1) / 2)
    let before = this.options.alignment === 'end' ? Math.ceil(shown) : this.options.alignment === 'start' ? 1 : surround + 1
    let after = this.options.alignment === 'start' ? Math.ceil(shown) : this.options.alignment === 'end' ? 1 : surround + 1
    if (this.options.shown === 'auto') {
      const view = this.options.vertical ? this.viewport.clientHeight : this.viewport.clientWidth
      const dimension = (element: HTMLElement) => this.options.vertical ? element.offsetHeight : element.offsetWidth
      const styles = getComputedStyle(this.track)
      const gap = Number.parseFloat(this.options.vertical ? styles.rowGap : styles.columnGap) || 0
      const available = Math.max(0, view - dimension(this.elements[this.current]))
      const side = (direction: number, required: number) => {
        let covered = 0
        let slides = 0
        while (covered < required && slides < count - 2) {
          slides += 1
          covered += dimension(this.elements[modulo(this.current + direction * slides, count)]) + gap
        }
        return Math.max(1, slides)
      }
      before = side(-1, this.options.alignment === 'start' ? 0 : this.options.alignment === 'end' ? available : available / 2)
      after = side(1, this.options.alignment === 'end' ? 0 : this.options.alignment === 'start' ? available : available / 2)
    }
    const right = clampNumber(Math.max(step, after), 1, count - 2)
    return { before: clampNumber(Math.max(step, before), 1, count - 1 - right), after: right }
  }

  private position() {
    return (this.options.vertical ? this.viewport.scrollTop : this.viewport.scrollLeft) * this.sign
  }

  private maximum() {
    return this.options.vertical
      ? this.viewport.scrollHeight - this.viewport.clientHeight
      : this.viewport.scrollWidth - this.viewport.clientWidth
  }

  private physicalPoint(rect: DOMRect, spacing = 0) {
    const [low, high] = this.options.vertical ? [rect.top, rect.bottom] : [rect.left, rect.right]
    if (this.options.alignment !== 'start' && this.options.alignment !== 'end') return (low + high) / 2
    return (this.options.alignment === 'start') !== this.options.reversed ? low + spacing : high - spacing
  }

  private scale(rect: DOMRect) {
    const [layout, visual] = this.options.vertical
      ? [this.viewport.clientHeight, rect.height]
      : [this.viewport.clientWidth, rect.width]
    return visual ? layout / visual : 1
  }

  private offsetFor(index: number) {
    const slide = this.elements[index]
    if (!slide) return 0
    const viewport = this.viewport.getBoundingClientRect()
    const scale = this.scale(viewport)
    const point = this.physicalPoint(slide.getBoundingClientRect())
    const view = this.physicalPoint(viewport, this.options.edge / scale)
    const offset = this.position() + (point - view) * this.sign * scale
    return clampNumber(offset, 0, this.maximum())
  }

  private scroll(position: number, behavior: ScrollBehavior) {
    const physical = clampNumber(position, 0, this.maximum()) * this.sign
    this.viewport.scrollTo(this.options.vertical ? { top: physical, behavior } : { left: physical, behavior })
  }

  private reorder(start: number, index: number, freeze: boolean, align = false) {
    if (start === this.order) return
    this.restore()
    const anchor = this.elements[index]
    const before = this.physicalPoint(anchor.getBoundingClientRect())
    this.viewport.style.scrollSnapType = 'none'
    if (freeze) this.viewport.style.setProperty('overflow-' + this.axis, 'hidden')
    this.order = start
    this.elements.forEach((slide, position) => slide.style.setProperty('--vc-native-order', String(this.slot(position))))
    const after = this.physicalPoint(anchor.getBoundingClientRect())
    const scale = this.scale(this.viewport.getBoundingClientRect())
    this.scroll(align ? this.offsetFor(index) : this.position() + (after - before) * this.sign * scale, 'instant')
    if (freeze) {
      this.restoreFrame = window.requestAnimationFrame(() => {
        this.restoreFrame = window.requestAnimationFrame(() => this.restore())
      })
    } else {
      this.restore()
    }
  }

  private restore() {
    window.cancelAnimationFrame(this.restoreFrame)
    this.restoreFrame = 0
    this.viewport.style.removeProperty('scroll-snap-type')
    this.viewport.style.removeProperty('overflow-' + this.axis)
  }

  private updateVisible() {
    const viewport = this.viewport.getBoundingClientRect()
    this.onVisible(this.elements.flatMap((slide, index) => {
      const rect = slide.getBoundingClientRect()
      const visible = this.options.vertical
        ? rect.bottom > viewport.top + 1 && rect.top < viewport.bottom - 1
        : rect.right > viewport.left + 1 && rect.left < viewport.right - 1
      return visible ? [index] : []
    }))
  }
}
