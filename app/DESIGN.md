---
name: Tohab
description: "A quiet, offline-first workspace for tasks and habits."
colors:
  primary: "#c3392c"
  primary-muted: "#a92f24"
  primary-soft: "#fbe9e7"
  primary-text: "#ffffff"
  surface: "#fcfaf8"
  surface-raised: "#ffffff"
  surface-sunken: "#f2efed"
  surface-hover: "#f2efed"
  line: "#eeeeee"
  line-strong: "#d3d3d3"
  text: "#202020"
  text-dim: "#666666"
  text-faint: "#6f6f6f"
  danger: "#dc4c3e"
  positive: "#058527"
  selected-bg: "#ffefe5"
  selected-text: "#a81f00"
  priority-one: "#d1453b"
  priority-two: "#eb8909"
  priority-three: "#246fe0"
  priority-four: "#666666"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.125
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.6667
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  full: "9999px"
spacing:
  base: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "44px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-dim}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
    height: "44px"
  nav-item:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
    height: "40px"
  fab:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.full}"
    size: "56px"
  sheet:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "16px"
---

# Design System: Tohab

## Overview

**Creative North Star: "The Quiet Daily Workbench"**

This is an inferred name for the incumbent visual system, based on the existing
implementation. Tohab presents personal work as calm, immediate, and tactile:
warm paper-like surfaces, a single red action voice, and compact rows that keep
the user's attention on the next thing to do. The system is deliberately more
utility than dashboard. It gives structure to tasks and habits without making
the interface feel like a control room.

The visual language is mobile-first and touch-aware. Full-bleed bands hold
focused content, list rows are separated by quiet hairlines, and overlays use
tonal contrast plus restrained shadow rather than decorative framing. Desktop
adds a collapsible navigation rail while preserving the same compact, calm
content rhythm.

**Key Characteristics:**

- Warm, lightly tinted neutral surfaces instead of stark white everywhere.
- One red accent for creation, active state, and primary commitment.
- Compact system typography with clear metadata de-emphasis.
- Flat list rhythm with selective tonal elevation for transient UI.
- Touch-sized controls and motion that responds quickly without spectacle.

## Colors

The palette is a warm neutral field with a focused red action voice and small
semantic accents for priority, success, danger, and habit identity. Dark mode
keeps the same roles while shifting the surface and accent values for contrast.

### Primary

- **Warm Action Red** (#c3392c): Primary creation, confirmation, active navigation, and selection emphasis.
- **Deep Action Red** (#a92f24): Muted text-scale accent where the full primary needs less weight.
- **Soft Action Wash** (#fbe9e7): Light accent background for selected or active states.

### Secondary

- **Priority Coral** (#d1453b): Highest task priority.
- **Priority Amber** (#eb8909): Second task priority.
- **Priority Blue** (#246fe0): Third task priority.

### Neutral

- **Warm Paper** (#fcfaf8): App canvas and list-row surface.
- **Raised White** (#ffffff): Sheets, cards, and raised transient surfaces.
- **Quiet Stone** (#f2efed): Inputs, pressed states, and sunken controls.
- **Hairline Gray** (#eeeeee): Default dividers and borders.
- **Strong Hairline** (#d3d3d3): Higher-contrast borders where needed.
- **Ink** (#202020): Primary text.
- **Muted Ink** (#666666): Secondary text and metadata.
- **Faint Ink** (#6f6f6f): Tertiary text and low-emphasis labels.

### Named Rules

**The Single Accent Rule.** Keep the red accent reserved for action, active
state, and meaningful selection; let neutral tonal changes carry most of the
screen.

## Typography

**Display Font:** System sans (`-apple-system`, BlinkMacSystemFont, `Segoe UI`,
`Noto Sans`, system-ui)

**Body Font:** The same system sans stack.

**Character:** Compact, native-feeling, and readable at small sizes. Weight and
contrast do most of the hierarchy work; the system avoids a separate display
face or ornamental type treatment.

### Hierarchy

- **Display** (600, 2rem, 1.125): Large page or app identity moments; used sparingly.
- **Headline** (600, 1.5rem, 1.25): Desktop page titles and prominent headings.
- **Title** (600, 1.25rem, 1.2): Sheet titles and compact section headings.
- **Body** (400, 0.875rem, 1.5): Task names, form content, and everyday UI copy.
- **Label** (500, 0.75rem, 1.6667): Metadata, navigation labels, helper copy, and timestamps.

### Named Rules

**The Metadata Fade Rule.** Secondary information should recede through muted
color and smaller type, never through tiny unreadable text or unnecessary
decoration.

## Layout

Tohab uses a full-height application shell with a fixed document body and an
independently scrolling main region. Content bands remain full width while their
inner content is capped by the shared `measure` utility at 56rem (896px).
Mobile screens use a bottom tab bar and safe-area padding; from the `md`
breakpoint (768px), navigation becomes a 14rem panel or 4rem collapsed rail.

The dominant rhythm is a 4px base with common 8px, 12px, 16px, and 24px steps.
Task and habit rows use approximately 16px horizontal insets, 12px vertical
content padding, and a hairline bottom divider. Empty states use generous
vertical breathing room rather than decorative illustrations.

## Elevation & Depth

The system is flat by default and communicates hierarchy through tonal layering:
`surface`, `surface-sunken`, and `surface-raised` do most of the work. Borders
are hairline and quiet. Shadows are reserved for transient or floating elements
such as the FAB, sheets, and undo toast, where physical separation improves
orientation.

### Named Rules

**The Tonal Layer Rule.** Prefer a deliberate surface shift before adding a
shadow. Elevation should explain interaction state or transient presence, not
decorate ordinary content.

## Shapes

The shape language is gently rounded and touch-friendly. Common controls use
8px or 12px corners, grouped surfaces use 16px, sheets and larger containers
use 24px, and actions or status indicators use full pills and circles.

Hairline borders use the shared line tokens. Focus uses a 2px accent outline or
accent-tinted ring. Controls maintain a 44px minimum touch target on coarse
pointer devices, even when the visible icon or label is smaller.

## Components

### Buttons

- **Shape:** Gently rounded (8–12px), with circular icon-only actions where the action is spatially obvious.
- **Primary:** Warm Action Red with white text; compact 44px touch height and semibold label weight.
- **Hover / Focus:** Subtle tonal or opacity response; focus is a visible accent outline or ring.
- **Secondary / Ghost / Tertiary:** Sunken or transparent neutral controls, usually with a hairline border or muted text.

### Chips

- **Style:** Full-pill outline chips for task date, recurrence, priority, and project fields.
- **State:** Unselected chips stay neutral and muted; populated or selected chips adopt the accent text or a sunken accent-tinted state.

### Cards / Containers

- **Corner Style:** 16px for grouped settings and authentication surfaces; 24px for larger sheets on desktop.
- **Background:** Raised White over Warm Paper, with Quiet Stone for inset content.
- **Shadow Strategy:** Use the Elevation & Depth rules; transient containers may use a restrained shadow.
- **Border:** Hairline Gray or Strong Hairline when the boundary needs to be explicit.
- **Internal Padding:** Usually 12–16px, with 24px reserved for larger form groupings.

### Inputs / Fields

- **Style:** Quiet Stone fill, 8–12px radius, compact 10–12px internal padding, and no heavy default outline.
- **Focus:** 2px accent-tinted ring that remains visible against the sunken fill.
- **Error / Disabled:** Semantic danger color for errors; disabled controls reduce opacity without losing their layout or label.

### Navigation

- **Style:** Mobile bottom tab bar with four compact icon-label items; desktop uses a collapsible left rail.
- **Default:** Muted text and outline icons on the app surface.
- **Active:** Accent text, slightly stronger icon stroke, and selected background in the side rail.
- **Treatment:** Navigation respects safe-area insets and keeps touch targets at least 44px on coarse pointers.

### Task and Habit Rows

- **Style:** Full-width surface rows with a shared measure band and quiet bottom hairline.
- **Task behavior:** Circular priority-colored completion control, compact title, and de-emphasized metadata; swipe right completes and swipe left deletes on touch devices.
- **Habit behavior:** Emoji identity tile, streak or progress copy, and a progress ring as the primary logging affordance.

### Sheets and Transient Feedback

- **Style:** Bottom sheets on mobile, centered rounded dialogs on desktop, with a dimmed veil and focus trapping.
- **Behavior:** Sheets preserve context, lock background scroll, restore focus on close, and use short enter/exit motion. Undo appears as a raised toast or a compact sidebar status block.

## Do's and Don'ts

### Do:

- **Do** keep primary actions rare and visually unmistakable through the red accent.
- **Do** use the surface hierarchy to separate app chrome, editable controls, and transient overlays.
- **Do** preserve 44px touch targets and safe-area behavior on mobile.
- **Do** keep list metadata quiet so titles, completion, and logging actions remain scannable.
- **Do** honor dark mode, reduced motion, and Dynamic Type behavior already established in the app shell.

### Don't:

- **Don't** introduce decorative gradients, glossy treatments, or ornamental imagery into the utility surfaces without an explicit product reason.
- **Don't** turn every list row or setting into a floating card; the incumbent system relies on a calm continuous list surface.
- **Don't** use the accent as general decoration or apply multiple competing “primary” colors.
- **Don't** hide important state changes behind motion, hover-only affordances, or low-contrast text.
- **Don't** replace the system sans stack or warm neutral field casually; those are central to the current native, quiet character.
