---
name: Deferred tasks
description: Tasks intentionally postponed from their original phase with rationale for deferral.
type: project
---

## Task 3.5 — Audit client vs server components (deferred from Phase 3, 2026-03-29)

**Why deferred:** Highest risk with lowest payoff at ~1,000 DAU. Removing `"use client"` from 95+ components requires testing each one — easy to break silently with no component tests. Real bundle size wins already achieved via lazy-loading (3.4) and Phase 2 deduplication.
**When to revisit:** After component tests exist (post-Phase 4), or if bundle size becomes a measurable problem.

## Task 4.4 — Add pagination to table API endpoints (deferred from Phase 4, 2026-03-29)

**Why deferred:** Breaking API change — every frontend table/hook expects full array responses. Requires changing both API and frontend simultaneously. Current ~1,000 DAU doesn't hit payload size issues. Better to have test coverage first as a safety net.
**When to revisit:** After Phase 4 test coverage is in place. Consider adding to Phase 5 alongside React Query migration (5.1), which would naturally handle paginated responses.
