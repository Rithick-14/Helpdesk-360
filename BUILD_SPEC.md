# HelpDesk 360: build specification

You are a senior full-stack engineer. Build "HelpDesk 360", a complete IT support ticketing web app, in this repository. It is graded against `docs/HANDOUT.md`, so follow every rule exactly. Do not invent requirements, do not use mock data, and do not claim anything works until you have run it.

## 0. Context and grading

Employees raise IT tickets; the support team prioritizes, assigns and resolves them; employees track progress.

Marks: fresh clone runs first time with no manual steps (15), separate frontend/backend/DB architecture (10), ticket submission and employee tracking end to end (15), support queue with prioritization, filtering and assignment (10), dashboard with open/urgent/assigned/completed views (10), persistence and data integrity with every figure traceable to a query (15), validation/roles/hostile input (5), report (20).

A simple, fully persistent, role-correct tracker beats a flashy one that forgets data. Build the core first and make it bulletproof. Only then add extras.

## 1. Non-negotiables

- Real persistent database. Never keep tickets in memory, a JSON file, localStorage or hard-coded arrays.
- Write first: save to DB, then respond. Every page reads fresh from the API. Browser state is only a cache.
- Roles enforced by the BACKEND: employee, technician. Employees create tickets and read ONLY their own. Only technicians may change status or assigned_to.
- Validate category, priority and status against fixed lists on the server. Return 400 for invalid input, 401 if not logged in, 403 if not permitted, 404 if not found, each with `{"error": "..."}`.
- created_at and updated_at are set by the server/DB in UTC.
- Never show fabricated tickets or invented numbers. An empty DB must show clean empty states and zero counts on every screen.
- Every count, chart or status shown must come from a SQL query, and the UI must show how it is counted.
- Secrets only from `.env` (git-ignored). Commit `.env.example` with no real secrets. Passwords hashed with bcrypt.
- A double-click on Submit must create exactly one ticket.
- Fresh clone + copied `.env.example` + ONE command must produce the same working app, schema and seed data.

Fixed lists:
- category: hardware | network | software | account-access
- priority: low | medium | high | urgent
- status: open | in-progress | resolved | closed

## 2. Stack and repo layout

- Frontend: React 18 + Vite, React Router, plain fetch (no UI kit). Icons: lucide-react. Font: @fontsource/ibm-plex-sans. Everything installed via npm so the app works offline, with no CDN links.
- Backend: Node 20 + Express, better-sqlite3 (raw parameterized SQL, no string concatenation), bcryptjs, jsonwebtoken, cookie-parser, helmet, express-rate-limit, zod, dotenv.
- Database: SQLite file in a Docker volume / `./data` folder.
- Run: `docker compose up` (backend, frontend, db volume) AND a no-Docker path: `npm run setup && npm run dev` from the repo root.

Layout:
```
frontend/  backend/  docker-compose.yml  .env.example  .gitignore  README.md  REPORT.md
backend/src: server.js, db.js, schema.sql, seed.js, routes/, middleware/ (auth, roles, validate, errors), services/ (tickets, dashboard, sla, notifications)
backend/test: integration tests (node:test + supertest)
scripts/: verify.sh (end-to-end smoke + restart test), hostile.sh, bench.js (p95 timing)
```

`.env.example` keys: PORT, DB_PATH, JWT_SECRET (placeholder text), COOKIE_SECURE, CORS_ORIGIN, SEED_DEMO=true. The backend must refuse to start with a clear message if JWT_SECRET is missing or still the placeholder in production mode.

## 3. Data model (everything in schema.sql from day one; no migrations needed)

- **users**: id, username UNIQUE, display_name, password_hash, role CHECK in (employee, technician), created_at.
- **tickets**: id, title TEXT NOT NULL CHECK length(trim(title)) 1..150, description TEXT NOT NULL CHECK length(trim(description)) 1..5000, category CHECK, priority CHECK, status CHECK default 'open', reported_by_id FK users, assigned_to_id FK users NULL, client_token TEXT UNIQUE NULL (idempotency key), rating INTEGER NULL CHECK 1..5, rating_comment TEXT NULL CHECK length <= 500, rated_at TEXT NULL, created_at and updated_at TEXT NOT NULL default `strftime('%Y-%m-%dT%H:%M:%SZ','now')`.
- **status_history**: id, ticket_id FK, event CHECK in (created, status_change, assignment), from_value, to_value, changed_by_id FK, changed_at default UTC now.
- **comments** (extras): id, ticket_id FK, author_id FK, body CHECK length 1..2000, created_at.
- **notifications** (extras): id, user_id FK, ticket_id FK, message, read_at NULL, created_at.
- Indexes on tickets(status), tickets(priority), tickets(category), tickets(reported_by_id), tickets(assigned_to_id), tickets(created_at), status_history(ticket_id).
- `PRAGMA foreign_keys=ON` and WAL mode.

## 4. Business rules (state each in code comments with where it is enforced)

- Status transitions are one step forward only: open -> in-progress -> resolved -> closed. Anything else returns 400 naming the allowed next status. Same-status updates return 400.
- Assigning does not change status. assigned_to must be an existing user with role technician (else 400). Unassign allowed with null.
- Every ticket creation, status change and assignment change writes a status_history row and updates updated_at inside ONE transaction with the ticket update.
- Rating: only the reporter, only when status is resolved or closed, 1-5, once per ticket (`UPDATE ... WHERE rating IS NULL`; zero rows changed means "already rated" -> 400). Rating must NOT change updated_at, status or status_history. It uses its own route so PATCH stays technician-only.
- Queue sort (server-side): active tickets (open, in-progress) before done (resolved, closed); then priority urgent, high, medium, low; then oldest created_at first.
- Idempotent create: the client sends a client_token (uuid) per form instance. If a ticket with that token exists, return the existing ticket with 200 instead of creating another.
- SLA targets (extras): urgent 1h, high 4h, medium 24h, low 72h from created_at. Overdue = active and past target, computed server-side.
- Stale flag: active ticket with no updated_at change for 48h.

## 5. API (all under /api, JSON, cookie auth)

- `POST /auth/login {username,password}`: sets httpOnly SameSite=Lax cookie; generic error on failure; rate limited.
- `POST /auth/logout`, `GET /auth/me`
- `POST /tickets` (employee) body `{title,description,category,priority,client_token?}` -> 201 ticket
- `GET /tickets`: employee gets only own; technician gets all. Query: status, priority, category, assigned (unassigned | me | user id), q (search title), sort. Response items EXACTLY:
  `{id,title,category,priority,status,reported_by,assigned_to,created_at,updated_at}` where reported_by and assigned_to are usernames (assigned_to null when unassigned). Additive extra fields allowed: reported_by_name, assigned_to_name, sla_due_at, sla_overdue, is_stale. Never remove or rename the contract fields.
- `GET /tickets/:id`: detail + description + history timeline + comments + rating (reporter and technicians only; another employee gets 403/404)
- `PATCH /tickets/:id` (technician) body `{status?, assigned_to?}`
- `POST /tickets/:id/rating` (reporter) `{rating, comment?}`
- `POST /tickets/:id/comments` (reporter or technician) (extras)
- `GET /tickets/similar?title=` (employee): own active tickets with similar titles (extras)
- `GET /users?role=technician` (technician)
- `GET /dashboard` (technician): counts by status, urgent active, unassigned active, completed (resolved and closed separately), per-technician active/completed, by priority, by category, overdue count, average resolution time, tickets created per day for the last 7 days, rating average and count. Each block returns the plain-language SQL filter in a "how" field.
- `GET /notifications`, `POST /notifications/read` (extras)
- `GET /health`

Validate with zod on every route. Central error handler: never return stack traces; malformed JSON returns 400; body limit 100kb. Parameterized queries only.

## 6. Security and hardening

helmet, CORS limited to CORS_ORIGIN with credentials, login rate limit, bcrypt cost 10+, JWT in httpOnly cookie, same message for unknown user or wrong password. Render all user text as escaped text in React (never dangerouslySetInnerHTML); use `white-space: pre-wrap` for descriptions. Treat these inputs as normal: empty title, 10,000-char description (reject with 400, no crash), `<script>` tags and SQL-like text (store safely, render escaped), duplicate titles (allowed), assigning to a non-existent or non-technician user (400), employee reading another's ticket (403/404), employee calling PATCH directly (403).

## 7. Seed data (idempotent, runs automatically on first start; wipe-and-reseed command available)

- Demo accounts (document demo passwords in README only): employees priya.nair, rahul.verma, sana.khan; technicians arjun.mehta, meera.iyer.
- Seed 24 realistic tickets covering all four categories, priorities and statuses, with matching status_history rows, several urgent, several unassigned, some resolved with 2-3 seeded ratings, a couple past their SLA. Timestamps spread over the last 10 days and consistent with history.
- Also: `npm run seed:large` (500 tickets for performance), and fixtures for a clean small set and a hostile set.
- Seeded data is demo data only; REPORT.md must say so.

## 8. Frontend design system (professional dark-navy ITSM, built for scanning under time pressure)

Tokens in `theme.css`: bg #0A1020, surface #101A2E, raised #172440, border #253556, text #E8EEF8, text-dim #9DB0CF, text-faint #7288AD, primary #5B9DFF, danger #FF6B7A, success #3DD6A0, focus #9CC4FF. Priority: urgent #FF5C6C, high #FF9F43, medium #F2C94C, low #7F92B3. Status: open #5B9DFF, in-progress #B58CFF, resolved #3DD6A0, closed #7F92B3. IBM Plex Sans, 4px spacing scale, radius by role (control 6, panel 10, pill 999), tabular-nums for IDs, counts and times.

Style rules: sentence case, no glassmorphism, no gradients or glow, no chart libraries (CSS bars), no animated counters. Hover/focus transitions about 120ms only; respect prefers-reduced-motion. WCAG AA contrast, visible focus ring, 40px minimum touch targets.

Priority is shown as a coloured left rail on table rows PLUS a text badge. Status is icon + text, never colour alone (open: hollow circle, in-progress: half circle, resolved: check, closed: lock).

App shell: 232px sidebar showing only the role's items (convenience only; backend enforces roles), collapsing to an icon rail under 1024px and a top bar with menu under 768px. Header shows user name, role, notification bell, and a Log out menu.

Screens:
1. **Login**: centred 400px panel, inline error, button disabled and labelled "Signing in..." while pending. Collapsible "Demo accounts" helper listing seeded usernames (not passwords).
2. **New ticket**: title with counter (0/150), category, priority (help text: Urgent means work is blocked for several people), description with counter (0/5000). Inline field errors; counters turn amber at 90%. Submit disabled and labelled "Submitting..."; on success show confirmation with ticket number and link; on failure keep the form content and show "Couldn't reach the server. Your ticket was not submitted."
3. **My tickets**: table (#, Title, Priority, Status, Technician or dim italic "Unassigned", Updated relative with exact local time on hover). Empty state with a New ticket button.
4. **Ticket details** (both roles): header with number, title, badges; reported by, technician, created; progress stepper using real history timestamps; description (70ch); history timeline from the API; comments thread (extras); rating control for the reporter on resolved/closed tickets; technician controls (assign select + single button for the only valid next status).
5. **Queue** (technician, signature screen): search, filters for status, priority, category, plus Unassigned and Mine toggles, all synced to the URL query string. An "Urgent now" strip above the table listing active urgent tickets oldest first with waiting time; hidden if none. Dense table with priority rails, resolved/closed rows dimmed, inline assign select per row (dashed attention style when unassigned; on failure revert and toast the server message), "Assign to me" quick action, SLA overdue badge, stale marker. Empty states: "No tickets yet." and "No tickets match these filters." with a Clear filters button. With no technicians, the assign control is disabled with "No technicians available".
6. **Dashboard** (technician): wide red-tinted "Urgent active" block, then Open, In progress, Unassigned active, Completed (resolved and closed split), Overdue, Average resolution time, rating average with count ("4.2 from 6 ratings" or "No ratings yet"); workload by technician (active/completed bars); by priority; by category; 7-day created-per-day mini bars. Under every block a collapsible "How this is counted" showing the plain-language filter and the endpoint/table it reads. All values 0 with "No tickets yet" on an empty DB.

Shared states: skeleton rows while loading, toast (role=status, 4s) after success, persistent banner when the API is unreachable, inline validation with aria-describedby. One verb per action everywhere: Submit ticket, Assign, Update status, Sign in, Log out.

Responsive: tables become stacked rows under 768px (title, badges, technician, time, rail kept); filters in a drawer.

Keyboard extras: "/" focuses search, "g q" goes to Queue, "g d" to Dashboard, "n" opens New ticket; Esc closes menus; a "?" shortcuts popover.

## 9. Innovations (build ONLY after the section 10 gates pass; additive, must not alter the contract or any marked behavior)

Tier 1 (low risk):
- Smart suggestions on the New ticket form: a deterministic keyword rule set (no external API) suggests category and priority from title and description (e.g. "wifi", "vpn" -> network; "locked out", "password" -> account-access; "cannot work", "everyone" -> raise priority). Shown as a dismissible "Suggested: Network, High" chip. The employee always decides; the server ignores suggestions.
- Duplicate warning via `GET /tickets/similar`: non-blocking "You already have an open ticket that looks similar" with a link.
- SLA countdown badges and overdue count, stale flag, full history timeline, search and sort.
- In-app notifications bell: written in the same transaction when a ticket is assigned or its status changes (to the reporter) or a comment is added.
- Comment thread on tickets.
- Rating after resolution, with technician-only visibility of ratings.

Tier 2 (only if time remains):
- Printable ticket summary view; CSV export of the queue (technician only, escaped against CSV injection by prefixing cells starting with = + - @ with an apostrophe).
- Benchmark script measuring p95 of GET /tickets with 500 tickets (target under 300 ms); record results for the report.

## 10. Quality gates (run them; put REAL output in REPORT.md, never invent results)

Automated tests (node:test + supertest) covering: login success/failure; employee creates ticket; employee cannot see another's ticket; employee PATCH returns 403; invalid status/priority/category return 400; impossible status jump returns 400; assign to non-technician or unknown user returns 400; empty/whitespace title, empty description, 10,000-char description return 400; `<script>` and SQL-like text stored safely and returned unmodified; duplicate client_token returns one ticket; rating rules (reporter only, resolved only, once only, 401/403/404/400 cases); dashboard counts equal direct SQL counts; empty database returns zeros and empty lists without errors; persistence across server restart (start server, create + assign + change status, restart, fetch).

`scripts/verify.sh`: start from a fresh state, migrate and seed, create a ticket via the API, assign it, change status, restart the backend process, confirm the data is still there, print PASS/FAIL per step.

Manual checklist in README: submit as employee, see it in My tickets, see it in the queue as technician, assign, change status, employee sees technician and updated status, restart backend, refresh browser, everything still present.

## 11. Docker and run

`docker compose up` builds and starts frontend (http://localhost:3000) and backend (http://localhost:4000) with the SQLite file on a named volume. Seed runs automatically on first start. Provide healthchecks. The no-Docker path must also work. README "How to run it" must be exact enough for a fresh machine, including copying `.env.example` to `.env`.

## 12. REPORT.md (write from real results; be honest about gaps)

Sections: 1 What we built (five sentences plus architecture; what works and what doesn't); 2 The ticket logic (for submission, prioritization/assignment, status tracking: each rule and where it is enforced: frontend, backend or DB constraint); 3 Methods (stack chosen vs rejected, schema, auth/roles approach, how each dashboard count is computed with its SQL); 4 Results (table of at least six real tested scenarios: new ticket, urgent ticket, reassignment, restart, hostile input, unauthorized access; what happened, whether correct, explanation of any bug or gap); 5 How we worked (planned vs actual per checkpoint, one abandoned dead end) as TODO placeholders for the team to fill in truthfully; 6 Limitations and next steps (specific); 7 How to run it.

Mark seed data as demo data and list assumptions made (one-step-forward status rule, assignment does not change status, queue sort order, rating counts toward the current assignee).

## 13. How to work

Build in this order and stop to verify at each step:
1. Skeleton pipe: form -> API -> real DB row -> list, surviving a restart.
2. Schema, seed, login, roles.
3. Queue, filters, assignment, status rules and history.
4. My tickets tracking and ticket details.
5. Dashboard with traceable queries.
6. Hardening and the full test suite.
7. Docker and README.
8. Tier 1 innovations.
9. REPORT.md.

Commit after each step with a clear message. Do not move on while a gate fails.

At the end, output: the exact commands to run, what was verified with real command output, known gaps, and any assumption you made that the handout did not specify.
