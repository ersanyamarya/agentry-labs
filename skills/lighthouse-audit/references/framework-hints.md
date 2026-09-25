# Where findings usually trace to, by stack

Detect the stack from `package.json` dependencies and config files, then use the matching section as a starting point. Always confirm in the source before citing a cause.

## Any JS/TS app

- **Unused JavaScript**: the opportunity's `items[].url` names the chunk. Map it back with the build's source maps or bundle analyzer, then grep for the heavy import (charts, animation, date, icon libraries imported whole).
- **LCP render delay**: the LCP element is behind client-side data fetching, a hydration-gated component, an animation that starts hidden, or `loading="lazy"` on the hero image.
- **LCP resource load**: oversized hero image, missing `width`/`height`, no `srcset`, wrong format, or no `fetchpriority="high"`.
- **CLS**: images or embeds without dimensions, fonts swapping late, banners or consent bars injected above content.
- **TBT**: large third-party scripts (analytics, chat, tag managers) loaded synchronously, or heavy work in the first render.

## Next.js

Check `next/image` usage and `priority` on the hero image, `next/font` vs external font links, `"use client"` boundaries pulling large trees into the client bundle, and `next.config.*` for image and bundle settings. `@next/bundle-analyzer` maps chunks to imports.

## Gatsby

Check `gatsby-plugin-image` (`loading="eager"` on the hero), `gatsby-browser.*` and `gatsby-ssr.*` for global imports and wrappers, and page queries that ship large data to the client.

## Vite, React, Vue, Svelte SPAs

Everything renders client-side, so LCP waits for JS. Check route-level code splitting (`React.lazy`, dynamic `import()`), `index.html` for render-blocking links, and `vite.config.*` `build.rollupOptions` for manual chunks. `rollup-plugin-visualizer` maps chunks to imports.

## Astro, SvelteKit, Nuxt, Remix

Check which components hydrate (`client:*` directives in Astro), the image integration in use, and server-side data loading that delays the first byte (compare TTFB in the metrics table).

## Static sites and CMS themes

Check theme or plugin scripts in the page head, unoptimized uploaded images, and web font loading.
