---
title: Magic UI Installation
description: How to install Magic UI dependencies and structure your app.
date: 2024-09-16
---

<Callout>

**Note:** We have the exact same installation process as [shadcn/ui](https://ui.shadcn.com/docs/installation/).

</Callout>

<Steps>

### Create project

Run the `init` command to create a new Next.js project or to setup an existing one:

```bash
bunx shadcn@latest init
```

### Add components

You can now start adding components to your project.

```bash
bunx shadcn@latest add @magicui/globe
```

### Import component

The command above will add the `Globe` component to your project. You can then import it like this:

```tsx {1,6} showLineNumbers
import { Globe } from "@/components/ui/globe";

export default function Home() {
  return <Globe />;
}
```

# [Magic UI Components](https://magicui.design/docs/components)

20+ free and open-source animated components built with React, Typescript, Tailwind CSS, and Framer Motion.

## 📱 Device Mocks

- [Android](https://magicui.design/docs/components/android) - A mockup of an Android device.
- [iPhone](https://magicui.design/docs/components/iphone) - A mockup of an iPhone device.
- [Safari](https://magicui.design/docs/components/safari) - A mockup of the Safari browser.

## ✨ Special Effects

- [Animated Beam](https://magicui.design/docs/components/animated-beam) - An animated beam of light that connects two elements.
- [Confetti](https://magicui.design/docs/components/confetti) - A performance-ready confetti effect.
- [Globe](https://magicui.design/docs/components/globe) - An interactive 3D globe.
- [Meteors](https://magicui.design/docs/components/meteors) - A meteor shower effect.

## 🎬 Animations

- [Blur Fade](https://magicui.design/docs/components/blur-fade) - A blur and fade-in animation.
- [Box Reveal](https://www.google.com/search?q=https://magicui.design/docs/components/box-reveal) - Sliding box animation that reveals text.
- [Animated List](https://magicui.design/docs/components/animated-list) - A list that animates items in sequence.

## 🔤 Text Animations

- [Text Animate](https://magicui.design/docs/components/text-animate) - Various text animation presets.
- [Typing Animation](https://magicui.design/docs/components/typing-animation) - A typing effect for text.
- [Animated Shiny Text](https://magicui.design/docs/components/animated-shiny-text) - A shimmering text effect.
- [Words Pull Up](https://www.google.com/search?q=https://magicui.design/docs/components/words-pull-up) - Text that slides up word by word.

## 🖱️ Buttons

- [Rainbow Button](https://magicui.design/docs/components/rainbow-button) - A button with an animated rainbow border.
- [Shimmer Button](https://magicui.design/docs/components/shimmer-button) - A button with a shimmering light effect.
- [Shiny Button](https://magicui.design/docs/components/shiny-button) - A button with a reflective shine.

## 🖼️ Backgrounds

- [Dot Pattern](https://magicui.design/docs/components/dot-pattern) - A customizable dot pattern background.
- [Grid Pattern](https://magicui.design/docs/components/grid-pattern) - A customizable grid pattern background.
- [Flickering Grid](https://magicui.design/docs/components/flickering-grid) - A grid with flickering squares.
- [Hexagon Pattern](https://magicui.design/docs/components/hexagon-pattern) - An animated hexagon pattern.
- [Warp Background](https://magicui.design/docs/components/warp-background) - A space-warp style background effect.

## 🛠️ Misc / UI

- [Bento Grid](https://magicui.design/docs/components/bento-grid) - A flexible grid layout for showcasing features.
- [Dock](https://magicui.design/docs/components/dock) - A macOS-style dock navigation.
- [Marquee](https://magicui.design/docs/components/marquee) - A scrolling ticker for logos or testimonials.
- [Magic Card](https://magicui.design/docs/components/magic-card) - A spotlight-effect card component.
- [Terminal](https://magicui.design/docs/components/terminal) - An animated terminal emulator.
- [File Tree](https://magicui.design/docs/components/file-tree) - A component to display folder structures.
