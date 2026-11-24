# React Carousel

A React 19 and TypeScript port of [Vue 3 Carousel](https://github.com/ismail9k/vue3-carousel), based on [v0.19.0, commit 18bb2e9](https://github.com/ismail9k/vue3-carousel/commit/18bb2e9a509aa5916c8bfb40ceead9949a527c33).

[Open the live demo](https://port-shelf.github.io/react-carousel/)

## Development

Run the interactive demo from this repository.

    npm ci
    npm run dev -- --host 127.0.0.1

Build the library and the static demo, then run the browser tests.

    npm run build
    npm run build:demo
    npx playwright install chromium firefox webkit
    PLAYWRIGHT_ALL_BROWSERS=1 npm test

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
| External control | defaultIndex, modelValue, onModelValueChange and a ref exposing navigation, measurements and refresh methods |
| Events | onBeforeInit, onInit, onSlideRegistered, onSlideUnregistered, onSlideStart, onSlideEnd, onLoop, onDrag and onWheel |
| Styling and text | label, i18n, className, classPrefix, style, ignoreAnimations and CSS custom properties |

Use React nodes or render functions for children, slides and addons. The slide renderer receives the previous committed carousel data. Inside a Slide, use its render function for isActive, isVisible, isClone, isPrev, isNext, isSliding and currentIndex. Use stable keys for dynamic lists. An explicit Slide index inserts the slide at that position, as in Vue. Registration events report the index and slide element.

Pass the Carousel ref to Navigation or Pagination as its carousel prop to place controls elsewhere. The ref provides data, nav, the original slides and viewport elements, visibleRange, and the isNative, isVertical, isMarquee, isLocked and allSlidesFit flags. Call restartCarousel to refresh measurements and restart autoplay. The updateBreakpointsConfig, updateSlidesData and updateSlideSize methods refresh the corresponding derived data. Pass false as the final argument to next, prev or slideTo to ignore the call while a slide is in flight.

With classPrefix, supply a matching stylesheet. Transform-based loop and marquee render inert visual copies, so slide content that needs document IDs should generate an ID per mounted instance.

## Native scrolling and looping

Set nativeCss and wrapAround together for browser-driven scroll snap with continuous navigation. The carousel preserves slide DOM order and keys, repositions existing slides visually, and updates the current index when scrolling settles. Trackpad, touch, navigation buttons and arrow keys work with supported native layouts. Mouse drag and scripted wheel handling belong to the transform mode. CSS scroll snap support, available scroll space and direction determine the effective mode. Check isNative on the ref or the is-native class to see which mode is active.

Native looping extends upstream v0.19.0, which disables wrapAround in native CSS mode. As in upstream, marquee and bottom-to-top layouts use the transform mode. A wrapping track whose slides all fit also uses the transform mode. Fade uses the opacity effect. Native smooth scrolling uses the browser's duration and easing.

## License

MIT. The upstream copyright and license are retained in LICENSE and included in the packaged distribution.
