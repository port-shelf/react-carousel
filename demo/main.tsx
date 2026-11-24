import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Carousel, Navigation, Pagination, Slide } from '../src/index.js'
import type { CarouselOptions } from '../src/index.js'
import '../src/carousel.css'
import './demo.css'

const studies = [
  { title: 'Afterglow', figure: 'Sun below the horizon', ink: '#f7b961', sky: '#a33b29', base: '#581d27' },
  { title: 'Neap tide', figure: 'Moon over a shallow sea', ink: '#cedaaf', sky: '#285246', base: '#182f2c' },
  { title: 'Cold front', figure: 'Blue light on the ice', ink: '#c7daf5', sky: '#3a4f83', base: '#26324e' },
  { title: 'Dust line', figure: 'Light through a sandstorm', ink: '#f3daba', sky: '#ae613b', base: '#6f3d32' },
  { title: 'New moon', figure: 'Dark sky above the ridgeline', ink: '#dfa2ae', sky: '#684652', base: '#342938' },
]

const modes = {
  loop: { wrapAround: true },
  finite: {},
  native: { nativeCss: true },
  fade: { wrapAround: true, slideEffect: 'fade' },
  vertical: { dir: 'ttb', height: 310 },
  rtl: { dir: 'rtl' },
  marquee: { marquee: true, marqueeSpeed: 90 },
} satisfies Record<string, CarouselOptions>
type Mode = keyof typeof modes

function Demo() {
  const [mode, setMode] = useState<Mode>('loop')
  const [active, setActive] = useState(0)
  const [autoplay, setAutoplay] = useState(false)
  const [adaptive, setAdaptive] = useState(false)
  const [count, setCount] = useState(studies.length)
  const [viewport, setViewport] = useState('single')
  const current = Math.min(active, count - 1)
  return <main className="site">
    <header className="site-header">
      <span className="wordmark">Port Shelf</span>
      <a href="https://github.com/ismail9k/vue3-carousel" target="_blank" rel="noreferrer">Vue source ↗</a>
    </header>

    <div className="intro">
      <h1>React<br />Carousel<span>.</span></h1>
      <p>A React port of Vue 3 Carousel.<br />Drag the slides or use the controls.</p>
    </div>

    <div className="stage">
      <Carousel
        key={mode}
        className="preview"
        label="Atmospheric studies"
        modelValue={current}
        onModelValueChange={setActive}
        transition={260}
        autoplay={autoplay ? 1700 : 0}
        pauseAutoplayOnHover
        adaptiveHeight={adaptive}
        gap={12}
        mouseWheel={{ ignoreCrossAxis: true }}
        breakpoints={viewport === 'responsive' ? { 640: { itemsToShow: 2.5 } } : undefined}
        {...modes[mode]}
        addons={<div className="controls">
          <Navigation />
          <Pagination />
          <output className="counter" aria-label="Selected slide">{current + 1} / {count}</output>
        </div>}
      >
        {studies.slice(0, count).map((study, index) =>
          <Slide key={study.title}>
            <div className={'study study-' + index} style={{
              '--ink': study.ink, '--sky': study.sky, '--base': study.base,
            } as React.CSSProperties}>
              <h2>{study.title}</h2>
              <p>{study.figure}</p>
            </div>
          </Slide>
        )}
      </Carousel>

      <form className="settings" onSubmit={(event) => event.preventDefault()}>
        <label>Mode<select value={mode} onChange={(event) => { setMode(event.target.value as Mode); setActive(0) }}>
          <option value="loop">Loop</option>
          <option value="finite">Finite</option>
          <option value="native">Native scroll</option>
          <option value="fade">Fade</option>
          <option value="vertical">Vertical</option>
          <option value="rtl">Right to left</option>
          <option value="marquee">Marquee</option>
        </select></label>
        <label>Slides<select value={count} onChange={(event) => setCount(Number(event.target.value))}>
          <option value="5">Five</option><option value="3">Three</option><option value="1">One</option>
        </select></label>
        <label>Layout<select value={viewport} onChange={(event) => setViewport(event.target.value)}>
          <option value="single">Single</option><option value="responsive">Responsive</option>
        </select></label>
        <label className="checkbox"><input type="checkbox" checked={autoplay}
          onChange={(event) => setAutoplay(event.target.checked)} />Autoplay</label>
        <label className="checkbox"><input type="checkbox" checked={adaptive}
          onChange={(event) => setAdaptive(event.target.checked)} />Adaptive height</label>
      </form>
    </div>
  </main>
}

const target = document.getElementById('root')
if (target) createRoot(target).render(<StrictMode><Demo /></StrictMode>)
