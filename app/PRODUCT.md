# Product

<!-- impeccable:product-schema 1 -->

<!--
Most facts below are inferred from the repository README and existing app
implementation after the user asked to proceed with Impeccable setup. Confirm
or amend them before using this record to drive a redesign.
-->

## Platform

web

## Users

An individual managing personal tasks and habits from a phone, including in
offline or intermittently connected situations.

## Product Purpose

Tohab combines task management and habit tracking in an installable,
offline-first PWA. It helps a person capture and complete dated work, maintain
streak-based habits, review progress, and keep data synchronized across their
devices. Success means the user can reliably organize and act on their work
without depending on a network connection.

## Positioning

Tohab treats dated tasks and measured habits as complementary parts of one
personal operating system, while keeping the primary data experience local and
supporting a small self-hosted sync service.

## Operating Context

The primary use context is a portrait mobile PWA that can be installed to a
device and used throughout the day. Users capture tasks through a quick-add
composer, manage projects and recurrence, log habits, review activity and
progress, and configure sync, reminders, calendar feeds, export/import, theme,
and other settings. The app may be used across multiple devices and must remain
useful while offline.

## Capabilities and Constraints

- SvelteKit 3 and Svelte 5 frontend delivered as a static PWA.
- RxDB over IndexedDB provides local-first storage; a self-hosted Hono,
  Drizzle, and Postgres service synchronizes data.
- Tasks support natural-language quick add, dates, times, recurrence, four
  priorities, projects, notes, and swipe actions.
- Habits support binary and quantity tracking, multiple schedules, streaks,
  heatmap backfilling, per-habit statistics, and archiving.
- The product supports dark mode, sync status and recovery, JSON export/import,
  haptics, optional Web Push reminders, app badging, calendar feeds, and
  activity history with undo.
- The product is currently described as mobile-only, portrait-oriented, and
  single-account.
- Offline behavior, sync correctness, data safety, and clear recovery from
  connectivity or local-database failures are product constraints, not optional
  enhancements.

## Brand Commitments

- Product name: Tohab.
- Existing terminology includes tasks, habits, projects, activity, progress,
  sync, and quick add.
- Preserve the incumbent product behavior and established interface identity
  unless a later redesign request explicitly changes them.

## Evidence on Hand

- Product and deployment documentation: `../README.md`.
- Existing frontend routes and components under `src/routes/` and
  `src/lib/components/`.
- Existing light/dark tokens and responsive/PWA behavior in `src/app.css` and
  `src/app.html`.
- Automated unit, integration, browser, offline, and PWA hardening tests in
  `../app/test/`.
- No testimonials, external customer evidence, or marketing claims are
  established; future design work must not fabricate them.

## Product Principles

- Capture should be fast enough for the moment an intention appears.
- Core work must remain useful without connectivity.
- Tasks and habits should reinforce one another without becoming the same
  workflow.
- Sync and recovery should be understandable and safe.
- Personal data should remain under the user's control.
