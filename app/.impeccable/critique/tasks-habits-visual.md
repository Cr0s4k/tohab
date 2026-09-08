# Tasks and Habits visual review and polish

⚠️ DEGRADED: design assessment agent failed with a usage-limit error. Parent
performed the visual review; detector assessment completed independently.

## Scope and evidence

Reviewed real TaskRow and HabitRow components in isolated Chrome fixtures at
390px and 1280px, light and dark themes. Source review included task/habit routes.
This is a component review, not a completed authenticated-page critique. Full
navigation, empty states, data loading, and error recovery were not exercised;
a full Nielsen score would overstate this evidence and is intentionally omitted.

## Design verdict

Keep the existing list-based system. Compact task completion controls, explicit
date metadata and habit progress affordances suit daily task management. Tonal
surfaces and the shared content measure remain coherent between themes and
viewport sizes. The main opportunities are preserving legibility under real
content and keeping non-current states readable.

## Findings and resolution

- P1: Long unbroken project names ran beyond the mobile viewport and squeezed
  dates into multiple lines. Metadata now wraps as distinct pieces, dates stay
  together and project names truncate within the available width.
- P1: Habit edit links were invisible during keyboard focus. They now reveal
  themselves on focus-visible, matching the task edit behavior.
- P2: Whole-row rest-day opacity weakened text and control contrast and made
  available habits appear disabled. Removed the opacity; the existing Rest day
  label and schedule grouping convey the state.
- P3: Habit progress caption used an undocumented 0.7rem size. It now uses the
  shared caption utility. Detector assessment found this single advisory and
  zero anti-pattern failures across the reviewed targets.

## User implications

A mobile user can scan due dates without decoding broken lines. A keyboard user
can see the focused habit edit action. A low-vision user retains ordinary label
contrast for rest-day habits. These narrow repairs preserve the current visual
identity and interactions.

## Verification and remaining scope

App/server type checks passed. Browser fixture assertions passed for long-project
viewport containment and full rest-day opacity across both widths and themes.
Before/after screenshots were inspected. Screenshots live in temporary storage,
not the repository. The repeat icon may occupy a separate line for exceptionally
long project names; all metadata remains available without horizontal overflow.

Full-page composition, empty-state guidance, 200% zoom and authenticated
navigation remain outside the completed fixture verification. No live overlay
or full-page health score is claimed. The existing Vite server was reused;
Chrome profiles are cleaned up by the test helper.

Questions skipped: the user authorized a focused polish pass; no visual identity
decision was needed.
