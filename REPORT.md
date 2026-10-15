# HelpDesk 360 build report

## 1. What we built

HelpDesk 360 is a ticket tracker for employees and the IT support team. Employees get a light help center with request cards, summary counts, category shortcuts, conversation, and ratings. Technicians get a dark operations console with saved queue views, dashboard drill-downs, assignment, status controls, internal notes, and service metrics. Tickets, users, history, comments, notifications, and ratings are stored in SQLite and survive backend restarts. The frontend is React 18 with Vite, and the backend is an Express API with cookie sessions and role checks; container instructions are in README, though containers were not run in this environment.

**Architecture:** React/Vite frontend → Express JSON API → SQLite database (`data/helpdesk.sqlite`, or the `helpdesk_data` Docker volume). Browser state is only form/view state; ticket lists and details load from the API.

### Audit bugs found and fixed

- The top-right profile control did not open a menu and had no account stats. It now opens an accessible menu with role-specific SQL stats, navigation, keyboard shortcuts, and logout.
- Opening the notification bell marked every alert read. Read state now changes only when an alert is opened or the user chooses **Mark all as read**; rows are newest first.
- Employee replies did not notify the assigned technician. Notifications now go to the other participant and are inserted with the comment transaction.
- Dashboard figures had no drill-down, and the average-resolution join could count more than one resolved history event per ticket. Dashboard counts and GET `/tickets` now share one SQL filter builder; the average uses each ticket's first resolved event.
- The health indicator was hard-coded and technician navigation exposed New ticket. Health now polls every 30 seconds; the technician route, navigation item, and `n` shortcut are restricted.
- Page content could scroll underneath the sticky header. The app now uses one page scroll area and keeps page headings below the header.

## 2. Ticket logic and enforcement

| Area | Rule | Enforcement |
|---|---|---|
| Submission | Title is 1–150 trimmed characters; description is 1–5,000 trimmed characters; category and priority use the fixed lists. | Frontend field checks and counters; Zod in `POST /api/tickets`; SQLite `NOT NULL`, `CHECK`, and category/priority constraints. |
| Submission | Employee must be authenticated; reporter comes from the cookie session, never the submitted body. | Backend `requireAuth` and `requireRole('employee')`; ticket foreign key. |
| Submission | A UUID `client_token` makes a repeated submission return the existing ticket instead of inserting another row. | Frontend creates one token per form instance; unique SQLite constraint and backend lookup. |
| Priority and assignment | Queue order is active before completed, then urgent/high/medium/low, then oldest created time. Search and filters are applied by the API. | Parameterized SQL in `services/tickets.js`; URL query filters in the queue. |
| Assignment | Only technicians can change assignment; a non-null assignee must be an existing technician. Unassigning is allowed and never changes status. | Backend route role guard and technician lookup; user foreign key; assignment, `updated_at`, history, and notification share a SQLite transaction. |
| Status tracking | Status can move only open → in-progress → resolved → closed. Same-state and skipped transitions return HTTP 400 with the allowed next status. | Backend `changeTicket`; fixed status enum in Zod and SQLite `CHECK`; status, `updated_at`, history, and notification are transactional. |
| Dashboard drill-down | Counts and list filters use one shared SQL filter builder; list filters accept status lists, active, overdue, assignee, priority, and category. | `services/tickets.js` parameterized builder; dashboard response filters, GET `/api/tickets`, queue URL chips. |
| Claim | Opening an unassigned active ticket claims it once; competing technicians get 409. Claim does not change status, records the username in assignment history, and notifies the reporter transactionally. | Technician-only `POST /api/tickets/:id/claim`, immediate SQLite transaction, detail-page claim, Undo toast action. |
| Conversation privacy | Employees can send replies only. Technicians can reply or add internal notes. Resolution summaries are written with the resolved status when supplied. | `comments.kind` constraint and additive startup upgrade; comment API role checks; employee detail SQL filter; technician resolution dialog. Resolution notes remain optional to the API. |
| User stats and health | Menu totals are scoped SQL counts; server status is checked every 30 seconds. | `GET /api/me/stats`, `GET /api/health`, frontend profile menu and health poll. |
| Tracking and privacy | Employees can list, detail-read, comment on, and rate only tickets they reported. Technicians can read all tickets and make management changes. | Backend cookie authentication, role checks, reporter filter in the ticket list, and ownership check in the detail/comment/rating routes. |
| Rating | Reporter only, resolved/closed only, integer 1–5, once. Rating leaves status, `updated_at`, and history unchanged. | Dedicated backend route; conditional SQL `UPDATE ... WHERE rating IS NULL`; database rating check. |

## 3. Methods and data

| Decision | Method |
|---|---|
| Frontend | React 18, Vite, React Router declarative routes, plain `fetch`, lucide-react, and locally bundled IBM Plex Sans. No UI kit, CDN, or chart package. |
| Backend | Node 20, Express, Zod, bcryptjs, jsonwebtoken, cookie-parser, Helmet, CORS, and express-rate-limit. SQLite access uses `better-sqlite3` and parameterized statements. |
| Database | SQLite schema is created from `backend/src/schema.sql`; foreign keys and WAL are enabled. No migrations are needed for the initial schema. |
| Authentication | Seeded accounts only; there is no user registration. Passwords are stored as bcrypt hashes; the JWT is an httpOnly SameSite=Lax cookie. Backend role checks remain authoritative. |
| Demo records | The idempotent seed creates five demo users and 24 synthetic tickets, with histories and ratings. These are invented demo records, not real support incidents. |

Dashboard figures use `GET /api/dashboard`. The API returns a `how` explanation for each group, and the UI exposes it under “How this is counted.” Representative SQL filters are:

```sql
-- Open / in progress / resolved / closed
SELECT status, COUNT(*) FROM tickets GROUP BY status;

-- Urgent active and unassigned active
SELECT COUNT(*) FROM tickets
WHERE priority='urgent' AND status IN ('open','in-progress');
SELECT COUNT(*) FROM tickets
WHERE assigned_to_id IS NULL AND status IN ('open','in-progress');

-- Technician workload
SELECT u.id,
  SUM(CASE WHEN t.status IN ('open','in-progress') THEN 1 ELSE 0 END) AS active,
  SUM(CASE WHEN t.status IN ('resolved','closed') THEN 1 ELSE 0 END) AS completed
FROM users u LEFT JOIN tickets t ON t.assigned_to_id=u.id
WHERE u.role='technician' GROUP BY u.id;

-- Priority and category charts
SELECT priority, COUNT(*) FROM tickets GROUP BY priority;
SELECT category, COUNT(*) FROM tickets GROUP BY category;
```

Overdue is a SQL count of active tickets where `created_at` plus the priority target (urgent 1h, high 4h, medium 24h, low 72h) is earlier than SQLite's current time. Average resolution time uses `tickets.created_at` and the first resolved `status_history.changed_at`. The seven-day chart groups ticket creation timestamps by UTC date. Average rating and rating count use `AVG(rating)` and `COUNT(rating)` over non-null ratings. On an empty database these queries return zero counts, null averages, and empty lists; the frontend displays an explicit empty state.

## 4. Results

Verified on Node 20.20.2. `npm test` reported 22 tests, 22 passed, 0 failed. `npm run build` completed with Vite 6.4.4. `npm run verify` created a ticket, claimed it, advanced it to in-progress, restarted the backend, and checked the result through both the employee API and a direct SQLite query, including claim history.

| Scenario | Observed result | Correct? |
|---|---|---|
| Employee submits a new ticket with a client token | HTTP 201 and a persisted row; repeating the same token returned HTTP 200 with the same ID and one matching row. | Yes |
| Urgent ticket and queue filtering | Urgent ticket was returned by the urgent filter; queue order kept active work before completed work and sorts priority inside those groups. | Yes |
| Technician assignment and reassignment validation | Existing technician assignment succeeded; unknown user and employee IDs returned HTTP 400. | Yes |
| Employee attempts to change status | Backend returned HTTP 403. A technician's skipped status transition returned HTTP 400 naming the next state. | Yes |
| Backend restart | The verification script confirmed ticket, assignment, and status remained after restart through an employee detail read and a direct SQL row check. | Yes |
| Hostile input | Empty/whitespace title, empty description, and 10,000-character description returned HTTP 400. Script and SQL-looking text round-tripped unchanged as text. | Yes |
| Dashboard count traceability | API open and urgent-active values matched direct SQL counts in the integration test; each dashboard section includes a query/filter explanation. | Yes |
| Dashboard drill-down filters | Tests compared every status, urgent, unassigned, completed split, overdue, priority, category, and technician workload count against GET `/api/tickets` with the returned filter. | Yes |
| Concurrent claim | Two technicians claimed one unassigned ticket concurrently; one received 200, the other 409, with one assignment history row. | Yes |
| Claim behavior | Repeat claim produced no extra history; employee claim returned 403; resolved claim returned 400; ticket status remained open. | Yes |
| Internal-note privacy and replies | Raw employee detail JSON omitted an internal note; replies created notifications for the reporter or assigned technician as appropriate. | Yes |
| Resolution summary | A resolution note appeared as a `resolution` comment after the PATCH that moved the ticket to resolved. | Yes |
| Empty ticket database | Queue returned an empty list; dashboard returned zero open/urgent/unassigned counts, null rating average, and `empty: true`. | Yes |
| Frontend production build | Vite transformed 1,596 modules and completed the production build successfully. | Yes |
| Dependency audit | `npm run setup` completed with “found 0 vulnerabilities.” | Yes |

Direct read-only SQL on `data/helpdesk.sqlite` returned 5 open, 6 in-progress, 6 resolved, and 8 closed tickets; 0 urgent active, 3 unassigned active, 10 overdue, and a 3.8-hour average from 14 resolved tickets. The overdue and average queries match the dashboard definitions. The in-app browser was unavailable, so I could not click through both roles at desktop and 390px or inspect browser-console errors. Docker was unavailable for Compose verification. This checkout has no `.git` metadata, so I could not run a clean-clone flow or make per-part commits.

## 5. How we worked

Fill the timeline in truthfully during the team review; no team timekeeper or shared session log was available for this implementation.

| Part 8 checkpoint | Planned | Actual |
|---|---|---|
| Read and agree architecture | TODO — team to fill in | Read handout and build spec; chose React/Vite, Express, and SQLite. |
| Skeleton pipe | TODO — team to fill in | Built API/database/frontend layers and verified real database writes and reads. |
| Schema, seed, login, roles | TODO — team to fill in | Added constraints, demo seed, cookie login, and backend role checks. |
| Queue and tracking | TODO — team to fill in | Added filters, assignment, status transitions, history, comments, and ratings. |
| Dashboard and hardening | TODO — team to fill in | Added SQL dashboard aggregates and exercised hostile, unauthorized, and empty-state cases. |
| Build freeze | TODO — team to fill in | No Git metadata was present in the supplied folder, so no commits or push were made. |
| Report | TODO — team to fill in | Recorded command results from this run; container and visual browser checks remain open. |

**Dead end:** the first dependency install used the machine's Node 26 runtime and could not build `better-sqlite3` because matching prebuilt binaries and Visual Studio C++ tools were unavailable. The setup, dev, start, seed, verify, and test scripts now explicitly select Node 20 through npm; installation and tests then succeeded. This preserves the requested Node 20 and SQLite stack.

## 6. Limitations and next steps

- Run `docker compose up --build` on a machine with Docker Desktop to verify image builds, proxying, persistent named-volume behavior, and healthchecks.
- Open the app in a browser and complete the README manual checklist; browser control was unavailable in this session.
- The app uses seeded demonstration identities and has no employee account provisioning flow.
- Email notifications, printable summaries, CSV export, and a measured 500-ticket p95 benchmark are not implemented. In-app notifications are implemented.
- Demo data is synthetic and should be reset or replaced before connecting a real organization directory or importing real requests.

## 7. How to run it

From the repository root on a fresh machine with Node 20 and npm:

```sh
cp .env.example .env
npm run setup && npm run dev
```

On Windows PowerShell, copy the environment file with `Copy-Item .env.example .env`. The development app opens at `http://localhost:5173` and the API at `http://localhost:4000`. Sign in with a demo username and the password listed in README.md.

For containers, create `.env` from `.env.example`, then run `docker compose up --build`; the frontend is at `http://localhost:3000`. The SQLite database is persisted in the `helpdesk_data` volume.

### Assumptions

- Status transitions move one step forward only: open → in-progress → resolved → closed.
- Assigning or unassigning a technician does not alter status.
- Queue order is active before completed, then priority urgent/high/medium/low, then oldest first.
- A rating is counted against the ticket's current assignee, as returned by the workload query.
- A technician claims a ticket only when opening its detail page and only if it is unassigned and active; claiming leaves status unchanged.
- The technician UI requires a 10-to-1,000-character resolution summary, while the API keeps the field optional for compatibility.
