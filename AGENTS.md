# HelpDesk 360: instructions for the coding agent

This repo is graded against an official handout. Before writing any code, read these two files in full:

1. `HANDOUT.md`: the official handout and marking scheme. It is the source of truth. Do not invent requirements.
2. `BUILD_SPEC.md`: the detailed build specification (stack, schema, API, rules, UI design system, tests, report).

If the two ever disagree, the handout wins. Anything the handout leaves open is an assumption: list it in REPORT.md.

## Hard rules (summary, full detail in BUILD_SPEC.md)

- Persistent SQL database only. Never in-memory arrays, JSON files, or browser storage for tickets.
- Backend enforces roles (employee, technician) and validates category, priority, status against fixed lists. Return 400/401/403/404 with `{ "error": "..." }`.
- created_at / updated_at set by the server in UTC.
- No fabricated tickets or invented numbers; every dashboard figure comes from a SQL query and the UI explains how it is counted.
- Secrets only in `.env` (git-ignored), commit `.env.example`. Passwords hashed.
- Fresh clone + `.env.example` copy + ONE command must work.
- Core first, extras only after the core quality gates pass. Never claim something works until you have run it.
- Work step by step, verify each step, commit after each step.
