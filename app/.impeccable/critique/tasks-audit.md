# Task screen technical audit

Date: 2026-09-08. Scope: task route, rows, composer, metadata pickers,
shared sheet, CSS and motion helpers. Source inspection and calculated contrast;
no browser, screen-reader, reflow or frame-time verification was performed.

## Implementation integrity verdict

Pass with documentation gaps. The implementation consistently uses semantic
surfaces, shared sheets, priority controls and responsive navigation. The bundled
detector reported zero anti-pattern failures and two advisories. Both advisories
are documentation omissions: existing copy (0.8125rem) and subtitle (1rem) tokens
are absent from DESIGN.md. They do not justify changing the UI type scale.

## Health score

These are provisional source-review scores, not accessibility certification.

| Dimension | Score / 4 | Evidence |
| --- | --- | --- |
| Accessibility | 2 | Low-contrast semantic text and an invisible keyboard focus stop |
| Performance | 3 | List animation thresholds, content visibility and lazy settings; no profiling |
| Responsive design | 3 | Coarse-pointer target minimums, safe areas and desktop variants; reflow untested |
| Theming | 3 | Shared light/dark tokens; light-theme semantic colors need attention |
| Implementation integrity | 3 | Consistent components; documentation differs from code |
| Total | 14 / 20 | Good, with specific accessibility work required |

## Findings

### P1: Low-contrast overdue and priority text

Locations: `src/app.css` light-theme danger and priority tokens;
`src/lib/components/TaskRow.svelte:180`,
`src/lib/components/task/TaskPriorityPicker.svelte:23`, and composer priority chip.
Danger text (#dc4c3e) against the canvas (#fcfaf8) measures 3.92:1.
P2 amber (#eb8909) against the raised composer (#ffffff) measures 2.59:1.
Both are below 4.5:1 for their small text (WCAG 1.4.3).
Users can miss overdue dates and struggle to distinguish priority labels.
Use separate accessible text colors where needed, preserving identity colors
for decorative marks. Verify light/dark, selected and unselected backgrounds.
Suggested command: `$impeccable harden`.

### P1: Keyboard focus lands on an invisible edit button

Location: `src/lib/components/TaskRow.svelte:197`.
The edit button remains keyboard-focusable on fine pointers, but opacity is zero
until the row is hovered. Focus does not reveal it, and opacity also hides its
outline. Keyboard users encounter an invisible stop (WCAG 2.4.7).
Reveal the action on focus-visible or group focus-within, as well as hover.
Suggested command: `$impeccable harden`.

### P1: A cancelled swipe can execute an action

Location: `src/lib/components/TaskRow.svelte:77` and `:126`.
Both pointerup and pointercancel call `up()`, which commits completion or deletion
when the stored horizontal displacement exceeds 88px. A browser-cancelled gesture
therefore still executes an action. This is confirmed control-flow behavior;
the frequency of real-device cancellation was not measured.
Give cancellation a reset-only handler that removes listeners and clears gesture
state without invoking task mutations. Suggested command: `$impeccable harden`.

### P2: Project chips omit their selected state for assistive technology

Location: `src/lib/components/task/TaskProjectPicker.svelte`, chips branch.
Selection is expressed only through background classes. Unlike date and recurrence
chips, project buttons do not expose aria-pressed. Screen-reader users cannot
identify the current choice from the picker buttons.
Add aria-pressed consistently to Inbox and project choices.
Suggested command: `$impeccable harden`.

### P2: Generated design documentation is not a faithful token inventory

Locations: `DESIGN.md` typography, navigation and color definitions;
`.impeccable/design.json` previews.
Beyond the two detector advisories, page headers use font-bold while the document
specifies 600, the sidebar uses a 0.7rem radius rather than the documented 8px,
and dark-theme values are not inventoried. Preview shadow values are approximations.
Future agents could wrongly change correct UI to match these descriptions.
Refresh documentation against code, distinguishing illustrative previews from
normative tokens. Suggested command: `$impeccable document`.

## Positive findings and limits

Shared sheets trap and restore keyboard focus and support Escape. Inputs have a
visible accent focus ring. Touch styles establish 44px minimum control dimensions.
The app preserves safe-area insets and opts into iOS Dynamic Type. Motion helpers
respect reduced-motion preferences and retain final state. Large lists disable
expensive animation above a threshold and use content-visibility.

No measured performance regression was established. Long task metadata, large
text, modal background isolation and actual device gesture behavior still need
browser testing before making stronger claims. The detector's clean result does
not cover the verified accessibility and gesture issues above.

## Recommended sequence

1. `$impeccable harden`: address the three P1 issues and project selection semantics.
2. `$impeccable document`: correct the documented scale and component values.
3. `$impeccable audit`: verify fixes with keyboard, contrast and browser checks.
4. `$impeccable polish`: final consistency pass after the functional fixes.

Issue count: P0 0, P1 3, P2 2, P3 0.
