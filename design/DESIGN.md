# Design System Specification: LLM Gateway Management

## 1. Overview & Creative North Star
**The Creative North Star: "The Orchestrator’s Console"**

This design system moves away from the generic, boxy "Admin Dashboard" aesthetic toward a high-end, editorial experience tailored for the modern developer. The goal is to balance the high-density information requirements of an LLM Gateway with a sophisticated, layered visual language. 

We achieve this through **Organic Precision**: a combination of ultra-sharp typography and fluid, tonal depth. We reject the "standard" use of heavy borders and rigid grids in favor of intentional asymmetry and nested surfaces that guide the eye naturally through complex data streams. It is technical yet breathable—designed to feel like a high-performance instrument.

---

## 2. Colors & Surface Architecture

The palette is rooted in deep slates and professional blues, utilizing a Material Design-inspired tiered system to create depth without visual clutter.

### The "No-Line" Rule
Sectioning must be achieved through **background color shifts**, not 1px solid borders. To separate the navigation from the main workspace or a table from a header, use a transition from `surface` to `surface-container-low`. 

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use the following hierarchy to define importance:
*   **Base Layer:** `surface` (#f7f9fb) – The primary canvas.
*   **Secondary Content Areas:** `surface-container-low` (#f0f4f7) – Used for sidebars or secondary navigation.
*   **Actionable Cards/Panels:** `surface-container-lowest` (#ffffff) – Used to "lift" primary interactive elements off the background.
*   **Overlay/Utility:** `surface-container-highest` (#d9e4ea) – Reserved for high-contrast utility zones or inactive states.

### The "Glass & Gradient" Rule
For floating modals, tooltips, or "Active" status cards, use Glassmorphism. Implement a `backdrop-blur` of 12px-20px combined with a semi-transparent `surface-container-lowest` (alpha 80%). To provide "visual soul," use a subtle linear gradient on primary CTAs: `primary` (#0053db) to `primary_dim` (#0048c1).

---

## 3. Typography: The Editorial Edge

The typography system relies on the interplay between the technical precision of **Inter** and the architectural character of **Space Grotesk**.

*   **Display & Headline (Space Grotesk):** These levels are designed to feel authoritative. The slightly eccentric terminals of Space Grotesk reflect the "modern" developer ethos.
    *   *Headline-lg (2rem):* Use for page titles and high-level dashboard metrics.
*   **Title & Body (Inter):** Inter provides maximum legibility for high-density data.
    *   *Body-md (0.875rem):* The workhorse for table data and descriptions.
    *   *Label-sm (0.6875rem):* Used for metadata, API keys, and status indicators.
*   **The Mono Accent:** While not in the primary scale, use a monospaced font (JetBrains Mono) exclusively for code snippets, API endpoints, and raw JSON outputs to reinforce the technical nature of the tool.

---

## 4. Elevation & Depth

We eschew traditional shadows in favor of **Tonal Layering**.

*   **The Layering Principle:** Depth is achieved by "stacking." A white card (`surface-container-lowest`) placed on a cool grey background (`surface-container-low`) creates a natural, soft lift.
*   **Ambient Shadows:** If a floating element (like a dropdown) requires a shadow, it must be highly diffused: `box-shadow: 0 10px 30px rgba(42, 52, 57, 0.06)`. Use a tinted version of `on-surface` rather than pure black.
*   **The Ghost Border:** If a boundary is strictly required for accessibility, use `outline-variant` at 15% opacity. Never use a 100% opaque border.
*   **Active States:** Indicate "Active" models or providers not just with color, but with a subtle inner glow using `primary_container`.

---

## 5. Components

### Tables & Data Grids (The Core)
*   **Styling:** Forbid horizontal and vertical divider lines. Use `surface-container-low` on alternating rows (zebra striping) or simply rely on generous vertical white space.
*   **Headers:** Use `label-md` in `on-surface-variant`, all-caps with 0.05em letter spacing for a "technical manual" feel.

### Buttons & Chips
*   **Primary Button:** Gradient fill (`primary` to `primary_dim`) with `DEFAULT` (0.25rem) roundedness. 
*   **Status Chips:** Use `secondary_container` for inactive/neutral states and `tertiary_fixed_dim` for active/healthy states. Text inside chips should use `label-sm`.

### Input Fields
*   **Style:** Minimalist. No bottom border or full enclosure. Use a `surface-container-high` background with a `md` (0.375rem) corner radius. On focus, transition the background to `surface-container-highest` and add a 1px "Ghost Border" of `primary`.

### Gateway-Specific Components
*   **Endpoint Badge:** A pill-shaped component using `tertiary_container` to highlight model endpoints (e.g., `gpt-4o`, `claude-3.5`).
*   **Latency Sparkline:** Small, simplified charts embedded in tables using `primary` for the line color, indicating gateway performance over time.

---

## 6. Do’s and Don’ts

### Do
*   **Use Asymmetry:** Align primary navigation to the left but allow metrics cards to vary in width to create a dynamic, custom feel.
*   **Embrace High Density:** Developers prefer seeing more data at once. Use `body-sm` for table rows but ensure line-height is at least 1.5x to maintain readability.
*   **Prioritize Tonal Contrast:** Use `on-surface-variant` for secondary text to create a clear visual hierarchy against the primary `on-surface` text.

### Don’t
*   **Don't use pure black (#000):** It breaks the sophisticated "SaaS" feel. Use `on-background` (#2a3439) for high-contrast text.
*   **Don't use heavy shadows:** They feel dated. Let background color shifts do the heavy lifting for hierarchy.
*   **Don't overcrowd with icons:** Use icons only where they provide immediate functional recognition (e.g., "Copy API Key"). Let the typography lead the way.