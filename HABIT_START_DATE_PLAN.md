# Habit start dates and historical schedules

Status: implemented in the working tree. See implementation notes below.

## Intended behavior

- A habit has an editable local-calendar `startDate`, separate from its immutable `createdAt` timestamp. New habits default to today, including when created while browsing an earlier journal date.
- Before the start date, the habit is absent from the journal and excluded from due counts, completion rates, and streaks. This applies to build and break habits.
- The editor shows “Starts today” with an accessible date control using the existing native date-input styling. Past and future dates are supported.
- Future habits remain discoverable and editable from the habit management/progress surface, labeled with their start date and without earned progress.
- Backdating explicitly includes those days in tracking. Explain this beside the field when a past date is selected.
- Do not permit moving the start date beyond an existing log. Show the earliest recorded date and preserve all logs. Dates before the start are disabled in the heatmap, with guidance to edit the start date to backfill.
- Distinguish “No habits yet” from “No habits scheduled for this date.”
- Proposed weekly rule: show the first partial week's logged progress, but exclude that partial week from streaks and completion-rate calculations. Normal weekly scoring begins with the first full calendar week, respecting the user's week-start setting. A habit starting exactly on the week boundary counts immediately.

## Stage 1: start dates

1. **Storage and compatibility.** Extend `app/src/lib/db/schemas.ts`, habit inputs, database migration registration, backup handling, and sync validation/normalization. Start with an optional schema field for old records; new habits always persist a `YYYY-MM-DD` calendar date. The server stores generic JSON documents, so no SQL column migration is needed. Server writes must preserve an existing explicit date when an older client's full-document replacement omits it. Activity undo must similarly preserve the field when restoring an old snapshot that lacks it.
2. **Legacy records.** Preserve existing backfilled history: while `startDate` is absent, resolve the earlier of creation day and earliest recorded day. Use the UTC calendar day of the old creation timestamp as a deterministic legacy fallback; the original creator's timezone was not stored, so this may differ by one day from the old local display. New habits and explicitly edited dates always use the user's chosen local date. Keep legacy dates inferred until explicitly saved, allowing late-arriving logs to extend legacy history without overriding any explicit start date. A per-document schema migration cannot safely assume all related logs are present. Import must consider the complete backup, including logs, before validating start-date constraints.
3. **Shared date rules.** Introduce one availability predicate and one start-date resolver in the habit domain. Apply them across `streaks.ts`, `habitProgress.ts`, the journal, detail heatmap, and log writes. Filter the journal before separating due and rest-day habits: changing `isDue` alone would leave pre-start habits visible in the rest list.
4. **Editor and browsing.** Extend `HabitEditor.svelte` and the journal/detail/progress routes. Reuse the existing date-field conventions, preserve mobile sheet behavior, and show inline validation. Ensure a newly created future habit remains reachable even when absent from today's journal.
5. **Verification.** Cover date before/on/after start, local-midnight boundaries, backdated logs, future dates, build and break habits, both week-start settings, initial partial weeks, old backups, sync ordering, and activity undo. Run relevant existing unit suites, habit browser workflows, sync checks, type checks, and the app build. Inspect editor and journal on mobile and desktop in one bounded visual pass.

## Stage 2: preserve goals and schedules over time

- Store dated tracking-rule revisions containing goal, kind, target, unit, schedule, weekdays, and weekly frequency. Display-only name, emoji, and color edits do not need revisions.
- Resolve the applicable revision for the date being viewed. Historical results use the rules in effect then; future edits do not rewrite them.
- Seed legacy habits from their currently stored rules. Previous overwritten settings cannot reliably be reconstructed from activity history, which can be cleared.
- Daily changes take effect today by default. Changes involving weekly periods take effect at the next week boundary, with the effective date visible before saving; avoid mixing two targets in one scored week.
- Define deterministic ordering and conflict handling for concurrent revisions, include revisions in sync and backup/restore, and preserve activity undo behavior.
- Use a dedicated replicated revision collection and update the collection allowlists on both client and server. Require compatible clients for this stage: older clients cannot preserve historical rule semantics merely by retaining unknown fields.
- Test a goal increase, weekday change, and daily/weekly transition across the effective date, including offline edits and sync conflicts.

## Delivery order and ownership

- Storage/sync contract first.
- Domain date logic and editor/routes can then be implemented in parallel against that contract.
- Integrate and verify Stage 1 before implementing revision history in Stage 2.
- Planning and implementation were delegated across domain calculations and editor UX, with storage/sync integration handled by the primary agent.

Review decisions: keep future habits reachable in Progress, reject edits that move the start beyond recorded logs, and exclude the first partial week from scoring. These are deliberate product choices where the reviews identified viable alternatives.

The existing Impeccable product/design context informs the editor plan: retain the compact native controls and current sheet layout.

## Implementation notes

- Habit schema v2 preserves legacy documents without manufacturing start dates. Explicit dates always win; legacy starts remain inferred from UTC creation day and known logs. Legacy inferred partial weeks retain their prior scoring behavior, while explicit partial starts are unscored.
- New habits store an original-rule baseline immediately. Existing habits receive one when first editing their rules. Revisions have separate ids; concurrent offline edits are retained and ordered by effective date, creation time, then id.
- Daily/weekly switches restart streaks in the new unit. Completion history still uses each period's original rules. Weeks that straddle different rules after a week-start setting change are excluded from scoring and do not break streaks.
- Undo and backup/restore include revisions. Undo cannot move a start date past an existing entry. Baselines survive undoing a rule edit, and deleting/undoing deletion includes the complete history.
- Deploy the updated server and client together, and update other devices. The sync protocol rejects older clients editing or logging a habit with versioned rules; this protects history from whole-document overwrites.
- Verification includes the full unit/persistence suite, type checks, production build, isolated server sync tests, two-device replication with concurrent offline revisions, and mobile/desktop habit browser workflows.
