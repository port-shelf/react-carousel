import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Carousel, Icon, Navigation, Pagination, Slide } from '../src/index.js'
import type { CarouselControls } from '../src/index.js'
import '../src/carousel.css'

function Fixture() {
  const carousel = useRef<CarouselControls>(null)
  const [selected, setSelected] = useState(0)
  const [showExtra, setShowExtra] = useState(true)
  const [showCarousel, setShowCarousel] = useState(true)
  const [fit, setFit] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [measurements, setMeasurements] = useState('')
  const kind = new URLSearchParams(location.search).get('variant')
  const record = (event: string) => setLog((previous) => [...previous, event])
  return <main>
    <section aria-label="Fixture controls">
      <button onClick={() => setShowExtra((value) => !value)}>Toggle extra slide</button>
      <button onClick={() => setShowCarousel((value) => !value)}>Toggle carousel</button>
      <button onClick={() => setFit((value) => !value)}>Toggle fit</button>
      <button onClick={() => setSelected(4)}>Select index four externally</button>
      <button onClick={() => {
        const handle = carousel.current
        if (!handle) return
        handle.restartCarousel()
        handle.updateSlideSize()
        handle.updateBreakpointsConfig()
        handle.updateSlidesData()
        setMeasurements(JSON.stringify({
          index: handle.data.currentSlide,
          slides: handle.slides.length,
          slideSize: handle.slideSize,
          viewport: Boolean(handle.viewport),
          native: handle.isNative,
          locked: handle.isLocked,
          allFit: handle.allSlidesFit,
          range: handle.visibleRange,
        }))
      }}>Read ref</button>
      <Icon name="arrowRight" carousel={carousel} />
      <Navigation carousel={carousel} />
      <Pagination carousel={carousel} paginateByItemsToShow />
      <output aria-label="Fixture selection">{selected}</output>
      <pre aria-label="Fixture measurements">{measurements}</pre>
      <pre aria-label="Fixture events">{log.join('\n')}</pre>
    </section>
    {showCarousel && <Carousel
      id="fixture-carousel" ref={carousel} label="Fixture carousel"
      itemsToShow={kind === 'wrap' ? 1 : fit ? 5 : 2}
      snapAlign="start"
      i18n={{ iconArrowRight: "Forward arrow" }}
      mouseWheel
      mouseScrollThreshold={100}
      disableWhenSlidesFit={kind !== 'wrap'}
      wrapAround={kind === 'wrap'}
      nativeCss={kind === 'native'}
      modelValue={selected}
      transition={180}
      ignoreAnimations="fixture-ignore"
      onModelValueChange={setSelected}
      onBeforeInit={() => record('before')}
      onInit={() => record('init')}
      onSlideRegistered={({ index, slide }) => record('register:' + index + ':' + slide.id)}
      onSlideUnregistered={({ index, slide }) => record('unregister:' + index + ':' + slide.id)}
      onSlideStart={({ from, to, slidingToIndex, slidesCount }) => record('start:' + from + ':' + to + ':' + slidingToIndex + ':' + slidesCount)}
      onSlideEnd={({ prevSlideIndex, currentSlideIndex }) => record('end:' + prevSlideIndex + ':' + currentSlideIndex)}
      onLoop={({ from, to }) => record('loop:' + from + ':' + to)}
      addons={(data) => <div aria-label="Addon data">{data.middleSlide}/{data.slidesCount}</div>}
      slides={(data) => <>
        <Slide key="second" id="second">Second</Slide>
        <Slide key="first" id="first" index={0}>First ({data.slidesCount})</Slide>
        <Slide key="third" id="third">Third</Slide>
        <Slide key="fourth" id="fourth">Fourth</Slide>
        {showExtra && <Slide key="final" id="final">Final</Slide>}
      </>}
    />}
  </main>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Fixture /></StrictMode>)
