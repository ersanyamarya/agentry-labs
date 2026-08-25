# Layout Presets and Dimensions

Options to offer the user in phase 3, plus the CSS frame the presets build on.

## Contents

- [Dimension table](#dimension-table)
- [Layout presets](#layout-presets)
- [The shared frame](#the-shared-frame)
- [Depth and 3D](#depth-and-3d)
- [Making a set feel like a set](#making-a-set-feel-like-a-set)

## Dimension table

Offer the standard for the purpose rather than inventing a size. Most platforms crop to their own aspect ratio, so the safe move is the canonical size with important content away from the edges.

| Purpose                                    | Size            | Notes                                                                                       |
| ------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------- |
| Open Graph / Twitter `summary_large_image` | **1200×630**    | The default. ~1.91:1. Works on Facebook, LinkedIn, Slack, Discord, X.                       |
| Twitter `summary` (square)                 | 1200×1200       | Only if the site sets `summary` rather than `summary_large_image` — check the meta tag.     |
| README / GitHub social preview             | 1280×640        | GitHub's own field wants 1280×640; a README banner can be anything but this doubles safely. |
| On-page card / tile art                    | match the frame | Measure the rendered container and render at 2× its CSS width.                              |
| Blog hero                                  | 1600×900        | 16:9 sits well above article text.                                                          |
| App Store screenshot (6.7")                | 1290×2796       | Portrait. Apple rejects wrong sizes, so don't approximate.                                  |
| Play Store feature graphic                 | 1024×500        | Exact; no alpha channel permitted.                                                          |
| Favicon / icon source                      | 1024×1024       | Render once, downscale with sharp.                                                          |

**Safe area**: platforms crop OG images differently, and some overlay UI on the bottom edge. Keep meaningful content inside a ~60px inset, and never put the only copy of important text in a corner.

**Legibility check**: an OG card renders about 500px wide in a feed — under half its native size. Anything below ~24px in the source becomes unreadable. This is the single most common reason generated cards look worse in the wild than in review: at native size everything is legible, and at feed size half of it is mud. When in doubt, fewer and larger elements.

## Layout presets

Offer two or three of these with a one-line sketch, plus a recommendation and the reason.

### A. Split — type left, motif right

```
┌────────────────────────────────┐
│ ● CATEGORY                     │
│                        ╭────╮  │
│ Big Serif Title        │ ✦  │  │
│                        ╰────╯  │
│ One line of description        │
│ ▔▔▔▔                           │
└────────────────────────────────┘
```

The workhorse. Type carries the information, the motif carries identity. Scales down well because the type is large and the art is simple. Best default for a set of many cards.

### B. Showcase — type left, app screenshots stacked in 3D right

```
┌────────────────────────────────┐
│ ╭──╮                 ┌──────┐  │
│ │✦ │            ┌──────┐   │   │
│ ╰──╯            │ live UI  │   │
│ Big Title       │ screens  │───┘
│ description     └──────────┘   │
│ ┌ author ┐                     │
└────────────────────────────────┘
```

Most persuasive for anything selling a UI, because it proves the thing exists and works. Needs the live-showcase flavor: a running dev server and a fill recipe per route. Read `capture-pitfalls.md` first.

### C. Centred — stacked and symmetrical

```
┌────────────────────────────────┐
│            ╭────╮              │
│            │ ✦  │              │
│            ╰────╯              │
│         Big Serif Title        │
│      one line of description    │
│           domain.com           │
└────────────────────────────────┘
```

Calm and easy to make consistent. Good for brand or section cards, and when titles vary wildly in length. Wastes horizontal room, so it fits fewer words.

### D. Editorial — full-bleed image with a type overlay

```
┌────────────────────────────────┐
│▓▓▓▓▓▓▓▓ photo / gradient ▓▓▓▓▓▓│
│▓▓                            ▓▓│
│▓▓ Big Title over a scrim     ▓▓│
│▓▓ description                ▓▓│
└────────────────────────────────┘
```

For blog posts with a hero image. Needs a scrim (a gradient over the image) or the text becomes unreadable against unpredictable photos — that's not optional, it's what makes the preset work.

## The shared frame

Every preset above sits on the same background so a set reads as one system. What each layer is for:

- **A near-black base** in the project's exact background token.
- **One or two large blurred radial glows** in the accent colour at low opacity (`filter: blur(150px)`, `opacity: 0.06–0.13`). This is what stops a dark card looking like a flat rectangle.
- **A faint grid** from two repeating linear-gradients, masked with a radial gradient so it fades at the edges. Very low contrast (~0.03 alpha) — it should read as texture, not as a grid.
- **A bottom rule**: a hard-stop gradient, accent for the first ~26% then a hairline neutral. A cheap, distinctive signature that ties a set together.
- **A signature**: the domain in mono, or an author card (name, location, tagline, circular portrait).

`assets/card-renderer.ts` implements all of this, parameterised by a `Theme`.

For a light-themed product, invert: a near-white base, a soft tint instead of glows, and a heavier bottom rule since glows don't read on white.

## Depth and 3D

To sit a screenshot in perspective:

```css
.stage {
  perspective: 1600px;
}
.panel {
  transform: rotateY(-26deg) rotateX(7deg) rotateZ(-1.5deg);
  transform-origin: left center;
  border: 1px solid rgb(255 255 255 / 0.14);
  box-shadow: -34px 44px 96px -20px #000;
  /* Panels running past the edge should dissolve, not get guillotined. */
  mask-image: linear-gradient(90deg, #000 0%, #000 72%, transparent 99%);
}
```

Two panels stacked — one behind and higher at ~0.6 opacity, one in front and lower at full opacity — reads as a product showcase. More than two reads as clutter, which is what made hand-made collages messy.

**The flattening trap**: a clipping ancestor (`overflow: hidden`, and also `filter`, `mask`, `opacity < 1`, `clip-path`) forces `transform-style` back to `flat`. Per-layer `translateZ` parallax inside a rounded, clipped card therefore does nothing at all — no error, just no effect. Either do the clipping on an inner element, or carry the effect with rotation alone.

## Making a set feel like a set

- **One rotation angle** across every card. Varying it per card is what made the hand-made versions look inconsistent.
- **One aspect ratio** for embedded art. If the source art and the frame share a ratio, `object-fit: cover` never actually crops anything.
- **One vertical rhythm.** Constrain title and description line counts (see SKILL.md) so every card's content block occupies the same box.
- **Distinct art per card.** If identity comes from an icon, check for collisions first — two pages sharing an icon produce two near-identical cards, which defeats the purpose. Count distinct icons against the number of artifacts and raise it with the user if they don't match.
- **Harmonise borrowed colour.** If a card embeds third-party art (a real `og:image`, a logo in someone else's brand colour), it will fight the palette. Recolour a logo to the accent, or accept the clash deliberately — but decide, and tell the user which you chose and why.
