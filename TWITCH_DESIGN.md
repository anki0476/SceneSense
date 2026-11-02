---
version: alpha
name: Twitch
description: "Light interface measured from twitch.tv: Inter type with Roobert, dark violet accents, tonal surfaces and pill-shaped controls."
colors:
  background: "#F7F7F8"
  surface: "#F7F7F8"
  on-surface: "#0E0E10"
  on-background: "#0E0E10"
  on-surface-variant: "#3B3B44"
  surface-container-low: "#FFFFFF"
  overlay: "#ADADB838"
  overlay-strong: "#00000099"
  primary: "#330C6E"
  on-primary: "#FFFFFF"
  secondary: "#5C16C5"
  tertiary: "#9147FF"
typography:
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.4
  body-lg:
    fontFamily: Roobert
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: -0.01em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.4
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.4
rounded:
  md: 2px
  full: 9999px
spacing:
  xs: 4px
  sm: 5px
  md: 12px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 0px
    height: 32px
  button-outline:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "#000000"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 0px
    height: 32px
  input-field:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: 8px
    padding: 0px 12px
  link:
    textColor: "{colors.on-surface}"
---

# Twitch Design System

## Overview

Twitch describes itself as: “Twitch is an interactive livestreaming service for content spanning gaming, entertainment, sports, music, and more.” The interface is light, built on **Snow (#F7F7F8)** with **Charcoal (#0E0E10)** text, and **Dark Violet (#330C6E)** as the main accent.

Type is set in **Inter** and **Roobert**. Headlines run large; body text is 14px. Depth comes from hairline borders and inset highlights rather than drop shadows. Controls are pill-shaped.

Measured from [twitch.tv](https://www.twitch.tv/) on October 28, 2026 at 1440×900 and 390×844 from 346 rendered elements. Values are computed styles from the live page, not the original source files.

## Colors

The palette has 10 roles.

- **Snow (#F7F7F8):** Page background, seen 1 time. Token `background`, CSS `--color-background-chat`.
- **Charcoal (#0E0E10):** Primary text and headings, seen 57 times. Token `on-surface`, CSS `--color-text-tab`.
- **Cool Graphite (#3B3B44):** Secondary text, seen 26 times. Token `on-surface-variant`, CSS `--color-fill-alt-2`.
- **White (#FFFFFF):** Raised areas one step from the page, seen 1 time. Token `surface-container-low`, CSS `--color-text-button-status-focus`.
- **Cool Gray 22% (#ADADB838):** Translucent fill for cards and controls, seen 42 times. Token `overlay`.
- **Near Black 60% (#00000099):** Stronger translucent fill, seen 3 times. Token `overlay-strong`.
- **Dark Violet (#330C6E):** Brand color on large areas. Token `primary`.
- **White (#FFFFFF):** Text and icons on primary. Token `on-primary`.
- **Violet (#5C16C5):** Brand accent (CSS variable), seen 52 times. Token `secondary`, CSS `--color-background-accent`.
- **Violet (#9147FF):** Secondary buttons, seen 50 times. Token `tertiary`, CSS `--color-border-tab-focus`.

## Typography

**Inter** and **Roobert** share the interface. Fallback stack: `Inter, Noto Sans Arabic, Roobert, Helvetica Neue`.

- **body-md:** Inter 14px at weight 400, line height 1.4. Body text.
- **body-lg:** Roobert 18px at weight 500, line height 1.1, tracking -0.01em. Lead paragraphs.
- **body-sm:** Inter 12px at weight 400, line height 1.4. Secondary and small text.
- **label-md:** Inter 14px at weight 600, line height 1.4. Buttons, navigation and labels.
- **label-sm:** Inter 12px at weight 600, line height 1.4. Small labels and badges.

## Layout

Spacing does not follow a strict grid: 65% of measured values are multiples of 4px, so match the measured steps rather than rounding to a grid.

- **Scale:** xs 4px, sm 5px, md 12px.
- **Breakpoints:** 480px, 768px, 919px, 920px, 1440px.

## Elevation & Depth

Depth comes mostly from hairline rings and inset highlights on tonal surfaces (#FFFFFF):

- `rgba(50, 50, 57, 0.62) 0px 0px 0px 1px inset`

A few raised panels add a soft drop shadow: `rgba(0, 0, 0, 0.13) 0px 1px 2px 0px, rgba(0, 0, 0, 0.08) 0px 0px 2px 0px`.

## Shapes

Interactive controls are pill-shaped. Measured radii, most used first:

- **full (9999px):** 160 elements.
- **md (2px):** 12 elements.

## Components

Measured from the rendered page. Token values reference the tokens above.

- **button-primary (“Sign Up”):** #9147FF fill, #FFFFFF text, 14px/600, 9000px radius, padding 0px.
- **button-outline (“Sign Up”):** #FFFFFF fill, #000000 text, 14px/600, 9000px radius, padding 0px.
- **input-field (“Search”):** #FFFFFF fill, #0E0E10 text, 14px/400, 8px 0px 0px 8px radius, padding 0px 12px, shadow `rgba(50, 50, 57, 0.62) 0px 0px 0px 1px inset`.
- **link:** transparent fill, #0E0E10 text, padding 0px.

## Do's and Don'ts

- Do use #F7F7F8 for the page and lift surfaces in small steps: #FFFFFF.
- Do keep text in 2 levels: #0E0E10, #3B3B44.
- Do use #330C6E as the brand accent: header, logo and key highlights.
- Do reuse the measured spacing steps (5px, 12px).
- Do make buttons and chips fully rounded (9999px); most other elements use 2px corners.
- Don't use heavy drop shadows; keep depth to hairline rings and tonal surfaces.
- Don't introduce new font families beyond Inter and Roobert.
- Don't use #330C6E for large backgrounds or body text.
- Don't make interface transitions slower than 0.1s.

## Motion

Interface transitions are quick: 0.1s.

- **Easing:** `ease-in`.

Generated by [Sitepeel](https://sitepeel.dev/design-md/twitch.tv/), the free DESIGN.md generator.
