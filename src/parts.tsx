import { createContext, useContext } from 'react'
import type { LiHTMLAttributes, ReactNode } from 'react'
import { defaultLabels, formatLabel } from './model.js'

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

export interface CarouselControls {
  currentSlide: number
  slidesCount: number
  prev: () => void
  next: () => void
  slideTo: (index: number) => void
}

interface CarouselContextValue extends CarouselControls {
  step: number
  prefix: string
  viewportId: string
  previous: boolean
  following: boolean
  locked: boolean
  vertical: boolean
  reversed: boolean
  pageSize: number
  labels: { [Key in keyof typeof defaultLabels]: string }
}

export const CarouselContext = createContext<CarouselContextValue | null>(null)
export const SlideContext = createContext<{
  state: SlideState
  prefix: string
  label: string
  interactive: boolean
} | null>(null)

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
    id={state.isClone ? undefined : id}
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

export interface NavigationProps {
  prev?: ReactNode
  next?: ReactNode
  className?: string
}

export function Navigation({ prev, next, className }: NavigationProps) {
  const context = useContext(CarouselContext)
  if (!context || context.locked) return null
  const arrow = context.vertical ? ['↑', '↓'] : ['←', '→']
  if (context.reversed) arrow.reverse()
  return <div className={[context.prefix + '__navigation', className].filter(Boolean).join(' ')}>
    <button type="button" className={context.prefix + '__prev'}
      aria-controls={context.viewportId} aria-label={context.labels.ariaPreviousSlide}
      aria-disabled={!context.previous} onClick={context.prev}>
      {prev ?? <span aria-hidden="true">{arrow[0]}</span>}
    </button>
    <button type="button" className={context.prefix + '__next'}
      aria-controls={context.viewportId} aria-label={context.labels.ariaNextSlide}
      aria-disabled={!context.following} onClick={context.next}>
      {next ?? <span aria-hidden="true">{arrow[1]}</span>}
    </button>
  </div>
}

export interface PaginationProps {
  disableOnClick?: boolean
  paginateByItemsToShow?: boolean
  className?: string
  label?: string
}

export function Pagination({ disableOnClick, paginateByItemsToShow, className, label = 'Choose a slide' }: PaginationProps) {
  const context = useContext(CarouselContext)
  if (!context || context.locked || !context.slidesCount) return null
  const pageSize = paginateByItemsToShow ? context.pageSize : 1
  const currentPage = Math.floor(context.currentSlide / pageSize)
  return <ol className={[context.prefix + '__pagination', className].filter(Boolean).join(' ')}
    aria-label={label}>
    {Array.from({ length: Math.ceil(context.slidesCount / pageSize) }, (_, page) => {
      const target = page * pageSize
      const message = paginateByItemsToShow ? context.labels.ariaNavigateToPage : context.labels.ariaNavigateToSlide
      return <li className={context.prefix + '__pagination-item'} key={target}>
        <button type="button"
          className={context.prefix + '__pagination-button' + (page === currentPage ? ' ' + context.prefix + '__pagination-button--active' : '')}
          aria-label={formatLabel(message, { slideNumber: page + 1 })}
          aria-controls={context.viewportId} aria-current={page === currentPage ? 'true' : undefined}
          disabled={disableOnClick}
          onClick={() => context.slideTo(target)} />
      </li>
    })}
  </ol>
}
