# React Carousel

A React 19 and TypeScript port of [Vue 3 Carousel](https://github.com/ismail9k/vue3-carousel), based on [v0.19.0, commit 18bb2e9](https://github.com/ismail9k/vue3-carousel/commit/18bb2e9a509aa5916c8bfb40ceead9949a527c33).

## Development

Run the interactive demo from this repository.

    npm ci
    npm run dev -- --host 127.0.0.1

Build the library and the static demo, then run the browser tests.

    npm run build
    npm run build:demo
    npx playwright install chromium
    npm test

Set PLAYWRIGHT_CHANNEL=chrome when using an existing Google Chrome installation.

## Local package

Run npm pack in this repository. Install the resulting react-carousel-port-0.1.0.tgz from your React app.

    npm install /absolute/path/to/react-carousel-port-0.1.0.tgz

The package provides ESM, CommonJS, TypeScript declarations and a CSS entry.

~~~tsx
import { Carousel, Navigation, Pagination, Slide } from 'react-carousel-port'
import 'react-carousel-port/carousel.css'

export function ProductGallery() {
  return (
    <Carousel
      label="Product photos"
      itemsToShow={1}
      gap={12}
      wrapAround
      breakpoints={{ 720: { itemsToShow: 2.5 } }}
      addons={<><Navigation /><Pagination /></>}
    >
      <Slide>Front</Slide>
      <Slide>Side</Slide>
      <Slide>Back</Slide>
    </Carousel>
  )
}
~~~

## API

| Use case | Props |
| --- | --- |
| Slide layout | itemsToShow, itemsToScroll, gap, edgeSpacing, clamp, snapAlign, height, adaptiveHeight |
| Responsive layout | breakpoints and breakpointMode with viewport or carousel sizing |
| Interaction | wrapAround, keyboardNavigation, mouseDrag, touchDrag, mouseWheel, preventExcessiveDragging, enabled, disableWhenSlidesFit, autoScrollOnFocus |
| Motion | slideEffect with slide or fade, autoplay, pauseAutoplayOnHover, marquee, marqueeSpeed, transition, transitionEasing |
| Reading direction | dir with ltr, rtl, ttb or btt |
| External control | defaultIndex, modelValue, onModelValueChange and a ref exposing prev, next and slideTo |
| Events | onSlideStart, onSlideEnd, onLoop, onDrag and onWheel |
| Styling and text | label, i18n, className, classPrefix, style and CSS custom properties |

Use a React node or render function in addons. Pass a render function to Slide to read isActive, isVisible, isClone, isPrev, isNext, isSliding and currentIndex. Navigation accepts custom prev and next content. Pagination can group markers with paginateByItemsToShow.

React elements preserve their identity through keys. Use stable keys and the desired child order for dynamic lists. The transform-based loop and marquee render inert visual copies, so slide subtrees with document IDs should generate distinct IDs for each rendered instance. With classPrefix, supply a matching copy of the stylesheet or your own styles.

The nativeCss option uses CSS scroll snap for finite carousels in supported directions. Wrapped, bottom-to-top, fade and marquee configurations use the transform or effect implementation. Vue-specific slot payloads, component lifecycle and registration events, and ignoreAnimations are outside the React API.

## License

MIT. The upstream copyright and license are retained in LICENSE and included in the packaged distribution.
