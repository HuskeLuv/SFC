---
name: SFC Work Plan
description: Comprehensive work plan with 5 phases covering security fixes, code deduplication, performance, testing, and architecture improvements. Tracked in CLAUDE.md.
type: project
---

A full work plan was created on 2026-03-28 and inserted into CLAUDE.md. It contains 23 tasks across 5 phases:

- **Phase 1 — Security:** Secret rotation, zod validation, rate limiting, consultant impersonation hardening, security headers
- **Phase 2 — Deduplication:** Generic asset hook (9 hooks → 1), generic table component (9 tables → 1), type consolidation, Pages Router migration, error handling standardization, mega-component splitting
- **Phase 3 — Performance:** N+1 query fixes, AuthContext re-render fix, Prisma indexes, lazy loading, server component audit, memory leaks
- **Phase 4 — Testing:** Expand from 7% to broader API coverage, error boundaries, loading states, pagination
- **Phase 5 — Architecture:** React Query migration, service consolidation, Neon → AWS RDS

**Why:** Project has significant code duplication (~7,000 lines across hooks+tables+types), security gaps (no rate limiting, exposed secrets), and only 7% test coverage.

**How to apply:** Always check CLAUDE.md for current task statuses before starting work. Update task status as work progresses.
