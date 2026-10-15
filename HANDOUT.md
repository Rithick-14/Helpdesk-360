# HelpDesk 360 - official grading handout (verbatim text extracted from the PDF)

 IT HAPPENS @ RAALE #12
 HelpDesk 360


 Build a Full-Stack Web Application for Employee IT Support Requests, Urgent-Issue

 Prioritization and Resolution Tracking




 EMPLOYEE → TICKET → TECHNICIAN → RESOLUTION



 STUDENT HANDOUT




   PA R T 0 — W H AT T H I S P RO J E C T AC T UA L LY I S



 0.1 The problem in plain language



 A growing company receives IT support requests from its employees every day: a laptop that will not

 boot, a meeting-room network that keeps dropping, a software licence that has expired, an account

 that is locked out. Somewhere in that pile of messages is an urgent request nobody noticed, a

 promise that was never assigned to anyone, and an employee who has been waiting three days

 without knowing whether anyone is working on it. A support lead would spot all of this in thirty

 seconds of looking at a proper queue — but there is no queue, only scattered chats, so the urgent

 issue is buried and the small ones are forgotten.



 Right now this is manual. Employees ask through informal channels — a message here, a hallway

 request there — and the support team keeps track in their heads, or, more often, doesn’t, and the

 issue never gets fixed.



 Your job: build a full-stack web application that centralizes IT support requests, lets the support

 team prioritize and manage issues, and allows employees to track their resolution status — with

 nothing left to informal messages. The application must give a clear view of open issues, urgent

 requests, assigned technicians, and completed work.



 The brief at a glance:



      • Objective — build a functional minimum viable product (MVP) that improves issue tracking,

        accountability and communication between employees and the IT support team.


      • Duration — 3 hours.


      • Team size — 3–4 participants.


      • Expected deliverable — a working full-stack web application with a frontend, a backend and

        persistent database storage.




IT HAPPENS @ RAALE #12 HelpDesk 360                                                                  1 / 13
 A support request is not “a chat message” and it is not “free text in an email” — it’s a structured,

 trackable record with an owner, a category, a priority, a status and a history. That’s why every request

 lands as a ticket stored in a database, not as a message that scrolls out of sight. The database is

 the conveyor belt between “an employee reported a problem” and “a technician sees it, owns it and

 closes it.”



 0.2 What makes this different



 Most student web exercises end like this: build a form, save a row, print a list, close the terminal. That

 is homework.



 This project does not end there. You must deliver:



      • A running application. Someone must be able to open the app in a browser, raise a real

        ticket as an employee — with nobody from your team present — and see it appear in the

        support queue, get assigned, and change status on the employee’s tracking page.


      • Something another team can run on their own machine, with one command and one                   .env
        file, without phoning you for help. This is why the project ships with seed data and a single

        start-up command such as      docker compose up , not a “works on my laptop” setup.

      • Proof that it works. You must answer “did the data really persist and does every role see the

        right thing, or does it only work with hard-coded rows?” with evidence, not a feeling.



 There are two classic ways to fail this:



      • A tracker that is only a form and a list is a shared spreadsheet with extra steps — employees

        can submit, but the support team cannot prioritize, assign or follow progress, and employees

        see nothing back. That is the same informal chaos in a nicer font.


      • A tracker that looks finished but forgets — tickets held in browser state, a hard-coded array,

        or a dashboard of invented numbers — is worse than useless. The first restart wipes the

        queue and trains employees to go back to chat messages.



 You are marked on the whole path, from employee request to resolved ticket.




   PA R T 1 — I M P O R TA N T: T H E DATA M U ST B E T RU ST WO R T H Y




    ⚠ READ THIS SECTION CAREFULLY — teams lose marks every time by getting this wrong.



 Your application can be as simple as server-rendered pages talking to a SQL database, or — if your

 team prefers — a single-page frontend calling a REST API. Either approach is acceptable. What

 matters is that it is a real full-stack system: a frontend, a backend and persistent storage.



 What is not acceptable is a ticket that exists only in the browser, a status change the employee

 cannot see, an “assigned technician” typed in as free text instead of linked to a real user, or a




IT HAPPENS @ RAALE #12 HelpDesk 360                                                                       2 / 13
 dashboard number that was never computed from the database.



 Why this matters



      • Trust — an employee who sees a wrong or stale status stops using the system, and the

        informal chat channels come straight back.


      • Accountability — every ticket must show who reported it, who owns it, what state it is in and

        when that last changed.


      • It costs nothing to show an empty state — if there are no open issues, “No open issues” is

        the correct screen, not invented sample tickets to look busy.


      • The point of the exercise — wiring a      form → an API → a table is a thirty-minute task.
        Making every ticket survive a restart, every role see the right view, and every dashboard

        number match the database is the skill being taught.



 If you display a count, a chart or a status anywhere in the application, you must be able to show, for

 each one: the table(s) it reads, the query or API call that produces it, and the filter (status / priority /

 assignee) it applies. A number with no traceable query scores zero on the data integrity component.



 Ask your organisers whether a particular framework, UI library or hosted database is required or

 banned at this event before assuming you can pick any.




   PA R T 2 — B E FO R E T H E S E S S I O N



 You will not be given time to debug installs, database setup or environment errors during the build.

 Arrive ready.




 2.1 Set up a scratch project and environment



      • A throwaway Git repository you control, with separate      frontend/ and backend/ folders (any
        stack works — React with Node/Express, Django, Flask, ASP.NET or Spring).


      • A database you can start with one command — PostgreSQL, MySQL or SQLite — with the

        connection string stored in a   .env file and a committed .env.example that contains no real
        secrets.


      • Seed scripts for demo accounts only: at least one      employee , one technician and a handful of
        tickets.




 2.2 Pre-pull what you’ll need



      • Confirm your runtime ( node ,   python or dotnet ) and package manager work, and that a hello-

        world API returns JSON to a hello-world page.


      • Confirm your ORM or migration tool ( Prisma ,     Sequelize , SQLAlchemy or EF Core ) can create
        a table and read it back.




IT HAPPENS @ RAALE #12 HelpDesk 360                                                                         3 / 13
      • If using containers: pull your images ( postgres:16 ,     node:20 ) at home.


 2.3 Bring test data



 Prepare three datasets at home so you’re not scrambling on the night:



      • A small, clean set (two employees, one technician, five tickets) to sanity-check the pipe end to

        end.


      • A larger set (20+ tickets across all four categories, every priority and every status) to see how

        the queue, filters and dashboard behave at realistic volume.


      • A deliberately hostile set — empty titles, a 10,000-character description,        <script> tags,

        SQL-looking text, duplicate titles — to test that your application rejects or safely stores it

        instead of crashing.




 2.4 A stack that fits the clock



 You may build this in any stack your team already knows. One combination known to finish inside

 three hours:




   Layer                               Suggested                            Note



   Frontend                            React (Vite) calling the API with    Forms and lists are fast to build;


                                       fetch                                reuse one layout for the queue,

                                                                            tracking and dashboard views



   Backend API                         Node 20 + Express (or Flask /        Routes, validation and role


                                       ASP.NET)                             checks live here — never only in

                                                                            the UI



   Database                            PostgreSQL or SQLite                 Persistent storage is mandatory;


                                       through an ORM                       a single-file SQLite database is

                                                                            fine for an MVP



   Authentication                      Login with two roles:   employee ,   The role decides which tickets


                                       technician                           and actions a user may see;

                                                                            hash passwords with    bcrypt

   Dashboard queries (strong for       SQL aggregates with     GROUP BY     Open, urgent, assigned and

   data integrity)                     status, priority                     completed counts come straight

                                                                            from the database, not from

                                                                            browser state



   Run & deploy (optional)             docker compose up with               One command and one       .env
                                       frontend , backend , db              file starts everything for another

                                                                            team




IT HAPPENS @ RAALE #12 HelpDesk 360                                                                              4 / 13
 Three notes worth knowing before you start:



      • Status and priority must be validated against a fixed list on the server — a dropdown in the

          browser is a convenience, not validation. Check that the value is one of   open , in-progress ,

          resolved or closed before saving.

      •   created_at and updated_at must be set by the server or database, not the browser, and

          stored in UTC — otherwise your ticket timeline will lie across time zones and clocks.


      • Decide early whether you build user registration or only seeded accounts (simpler), and say

          which you chose in the report. Either way, role checks must be enforced by the backend.




   PA R T 3 — W H AT YO U A R E B U I L D I N G



 Three moving parts, one repository.




   Employee / Technician opens the browser
           ↓
       http://localhost:3000
            ↓
     ┌──────────────────────────┐
     │ frontend                 │           Forms, queue, dashboard
     │ → role-based views       │
     └──────────────────────────┘
           ↓
     ┌──────────────────────────┐
     │ backend API              │           REST: /api/tickets, /api/users
     │     → validation, roles,         │   status + priority checked
     │       assignment                 │   on the server
     └──────────────────────────┘
           ↓
     ┌──────────────────────────┐
     │     database                     │   users, tickets, status_history
     │     → persistent storage         │   survives restart (never in memory)
     └──────────────────────────┘


     1. frontend — the browser application: employees get a ticket form and a “My tickets” tracking

          page; technicians get the full queue with filters, assignment and status controls, plus the

          dashboard.


     2. backend API — the only door to the data: validates every request, checks the caller’s role,

          applies the status rules, assigns technicians and writes every change to the database before it

          responds.


     3. database — persistent storage for users, tickets and status history, so nothing is lost on restart

          and every figure on the dashboard can be traced back to a query.




IT HAPPENS @ RAALE #12 HelpDesk 360                                                                     5 / 13
 Why centralize everything in one database instead of chat threads?



       • It gives every request an owner, a priority and a status, which is the whole accountability

           requirement in Part 1.


       • It lets the support team see open and urgent work in one place instead of searching through

           message history.


       • It lets employees check progress themselves, which is the fastest way to end the “any update?”

           messages.




   PA R T 4 — T H E I N T E R FAC E CO N T R AC T



 Your application’s layers should agree on these shapes so the pieces compose cleanly.



 Ticket (backend → frontend)




   [
       {
           "id": 42,
           "title": "Laptop does not boot after update",
           "category": "hardware",
           "priority": "urgent",
           "status": "in-progress",
           "reported_by": "priya.nair",
           "assigned_to": "arjun.mehta",
           "created_at": "2026-10-15T09:12:00Z",
           "updated_at": "2026-10-15T10:03:00Z"
       }
   ]



 New ticket (frontend → backend API)




   {
       "title": "Wi-Fi drops in meeting room 3",
       "description": "Connection fails every few minutes since this morning.",
       "category": "network",
       "priority": "high"
   }



 category must be one of hardware , network , software or account-access ; priority one of low ,
 medium , high or urgent ; and status one of open , in-progress , resolved or closed — never
 free text. Employees may create tickets and read only their own; only a technician may change

 status or assigned_to . If a request is invalid or not permitted, return 400 or 403 with a clear
 message rather than saving it — and never show a fabricated ticket just to make an empty screen

 look busy.




IT HAPPENS @ RAALE #12 HelpDesk 360                                                                    6 / 13
   PA R T 5 — T H E P E R S I ST E N C E RU L E ( M A N DATO RY )



 Because browsers refresh and servers restart, a naive application keeps its tickets in a JavaScript

 array, in browser storage or in server memory — and loses all of them the first time anything restarts.



 Before the demo, restart the backend and refresh the browser. Every ticket, assignment and status

 change must still be there. That means:



        • Write first — save to the database, then return success; never return   200 and write later, or

         not at all


        • Read fresh — every page loads its data from the API when it opens; browser state is a cache,

         never the source of truth




    ⚠ NO PARTIAL CREDIT ON THIS ONE Create a ticket, assign it and change its status, then restart
    the backend and refresh the browser. If any ticket, assignment or status change is missing

    afterwards, you score zero on the persistence component of Part 11 — no partial credit.




   PA R T 6 — H OW TO AC T UA L LY D O T H I S



 Read this whole part before coding.



 6.1 Keep the data model boring



 Three core tables —      users , tickets and status_history — each with a short, fixed list of columns
 (add   comments only if you reach the stretch goals). Three fixed lists drive everything: category

 ( hardware ,   network , software , account-access ), priority ( low to urgent ) and status ( open to
 closed ). You are marked on a persistent, role-correct tracker, not on how many features it has. If you
 finish early, widen the feature list.



 6.2 Build the pipe before the logic



 This is the single most important paragraph in the document. The most common way to fail is to

 have a beautiful dashboard at hour 2 and no ticket that actually survives a refresh. Build the plumbing

 with fake logic first:



        • the frontend form posts to the backend, and the backend returns one hardcoded dummy ticket


        • the backend inserts that dummy ticket as a real row in the database


        • the frontend reads the rows back from the API and lists them



 Once you see a ticket created in the browser survive a backend restart, replace the dummy logic with

 real logic. From that moment on, every minute you spend improves something that already works.




IT HAPPENS @ RAALE #12 HelpDesk 360                                                                      7 / 13
 6.3 “The page loaded” is not “the data saved”



 A list that renders on screen only means your frontend didn’t throw. It does not mean the rows came

 from the database — they may be a hard-coded array or leftover browser state, and a            200 response
 can still hide a failed insert if you don’t check the result. Check the response status of every    POST

 and   PATCH call explicitly, log it, and open the database to confirm the row really exists.


 6.4 Keep credentials out of the repo



 Any database password, session secret or JWT key goes into an         .env file, read as
 process.env.DB_PASSWORD (or your language’s equivalent), never hard-coded — and .env itself
 goes in   .gitignore . User passwords are stored hashed, never as plain text. Be ready to explain

 why: a secret committed to a public repo’s history is compromised the moment it’s pushed, full stop

 — rotation doesn’t undo the exposure window.




 6.5 Status rules will lie to you if you let them



 A ticket moves    open → in-progress → resolved → closed . The buttons in your UI show what is
 allowed, but only the backend can enforce it. Validate every status change on the server, reject

 impossible jumps, and write each change to      status_history with who made it and when. Don’t

 assume the value the browser sends is a valid status, or that the person sending it is a technician.



 6.6 Make it repeatable



 A fresh clone, a copied   .env.example and one start-up command must produce the same working
 application with the same schema and the same seed data. Judges will restart the backend, refresh

 the browser and double-click Submit — nothing may be lost, and a single click must create exactly

 one ticket.



 6.7 Assume hostile input



 Before the freeze, throw these at your application and make sure it responds sensibly instead of

 crashing or corrupting data:



       • a ticket with an empty title, an empty description or no category


       • a ticket with a 10,000-character description, or one containing   <script> tags or SQL-like text

       • an employee trying to open another employee’s ticket, or to change a status by calling the API

        directly


       • assigning a ticket to a user who does not exist or is not a technician


       • an empty database — no tickets, no technicians — where every screen and dashboard count

        must still load



 A clean validation error or a tidy empty state is a pass. A crashed server, a lost ticket or an

 unescaped script in the page is not.




IT HAPPENS @ RAALE #12 HelpDesk 360                                                                         8 / 13
   PA R T 7 — R E Q U I R E M E N T S



 7.1 Must-have — this is your pass




   #                                                       Requirement



   1                                                       Employees can submit a ticket (   title ,
                                                           description , category , priority ) through a
                                                           web form with zero help from the support team



   2                                                       Every ticket is saved in a persistent database and

                                                           survives a backend restart



   3                                                       The support team sees all tickets in one queue,

                                                           filterable by status, priority and category



   4                                                       Urgent requests are clearly highlighted and listed

                                                           first in the queue



   5                                                       A technician can be assigned to a ticket, and the

                                                           employee can see who it is



   6                                                       Technicians can update the status (   open / in-
                                                           progress / resolved / closed ); every change is
                                                           timestamped and recorded



   7                                                       Employees can see only their own tickets and track

                                                           status, technician and updates



   8                                                       A dashboard shows open issues, urgent requests,

                                                           assigned technicians and completed work,

                                                           computed from the database



   9                                                       Invalid or unauthorized requests are rejected by the

                                                           server, not crashed on



   10                                                      Secrets are read from environment variables, never

                                                           hard-coded, and passwords are stored hashed




 7.2 Stretch — this is how you win



        • A comment thread on each ticket so employees and technicians can communicate without

         leaving the system


        • Automatic notification (email or in-app) when a ticket is assigned or its status changes


        • SLA timers that highlight tickets waiting longer than a target time for their priority


        • Search, sorting and a full history timeline for every ticket


        • p95 response time for the ticket list under 300 ms with 500 tickets in the database, actually

         measured




IT HAPPENS @ RAALE #12 HelpDesk 360                                                                             9 / 13
      • Packaged so another team can start it with a single       docker compose up and zero manual
        setup




   PA R T 8 — T I M E L I N E ( 3 H O U R S )



   Time                                 Phase                                You are done when



   0:00 – 0:10                          Read, agree architecture, split      Everyone knows what they own

                                        work



   0:10 – 0:35                          Skeleton — form → API →              A ticket created in the browser is

                                        database → list, with dummy          still listed after a refresh

                                        logic



   0:35 – 1:05                          Real data model — schema,            A   SELECT on tickets shows
                                        seed data, login and roles           the correct reporter, status and

                                                                             priority



   1:05 – 1:45                          Real ticket management —             A technician can prioritize, assign

                                        queue, filters, assignment, status   and update; the employee sees it

                                        updates



   1:45 – 2:15                          Real dashboard and employee          Counts match the database after

                                        tracking page                        a restart



   2:15 – 2:35                          Hardening — validation, hostile      The Part 10 checklist passes

                                        input, secrets hygiene, empty

                                        states



   2:35 – 2:40                          BUILD FREEZE — commit and            Nothing further is edited

                                        push



   2:40 – 3:00                          Report                               REPORT.md committed


 Nominate one person as timekeeper and have them call out each checkpoint aloud.




    ⏱ THE 2:40 FREEZE IS HARD Work that is not committed does not exist.




   PA R T 9 — T H E R E P O R T ( 2 0 M I N U T E S )



 One file:   REPORT.md , in your repository.


     1. What we built — five sentences plus the architecture. State honestly what works and what

        doesn’t.




IT HAPPENS @ RAALE #12 HelpDesk 360                                                                             10 / 13
     2. The ticket logic — for each of the three areas (submission, prioritization and assignment,

        status tracking), exactly which rules you enforce and where (frontend, backend or database

        constraint).


     3. Methods — one line per row: stack chosen vs rejected; database schema; authentication and

        role approach; how the dashboard counts are computed.


     4. Results — a table of at least six real scenarios you tested (new ticket, urgent ticket,

        reassignment, restart, hostile input…), what happened, whether it was correct, and — most

        important — your explanation of any bug or gap you found.


     5. How we worked — planned vs actual at each Part 8 checkpoint, one dead end you

        abandoned and why.


     6. Limitations and next steps — be specific. “Send an email when a ticket is assigned” earns

        more than “add more features.”


     7. How to run it — exact steps to start this application on a fresh machine, from this section

        alone.




   PA R T 1 0 — P R E - F R E E Z E C H E C K L I ST



 At 2:30, stop adding features and verify every line.




        Employees can submit a ticket and see it under “My tickets”




        Tickets survive a backend restart and a browser refresh




        The support queue shows open and urgent issues, with working filters




        Every ticket shows its assigned technician, or “Unassigned”




        Status changes are saved, timestamped and visible to the employee




        Dashboard counts match the database (checked with a direct query, not assumed)




        Invalid, empty and unauthorized requests are rejected without crashing




        Secrets come from    .env , not hard-coded, and .env is git-ignored



        REPORT.md committed



        Everything pushed




IT HAPPENS @ RAALE #12 HelpDesk 360                                                                   11 / 13
   PA R T 1 1 — M A R K I N G



   Component                                                Marks



   Application runs clean from a fresh clone, first time,   15

   no manual steps



   Correct architecture — separate frontend, backend        10

   API and persistent database



   Ticket submission and employee tracking (status,         15

   technician, updates) works end to end



   Support queue — prioritization, filtering and            10

   technician assignment



   Dashboard — open, urgent, assigned and                   10

   completed views all represented



   Persistence and data integrity — every figure            15

   traceable to the database



   Validation, roles and hostile-input handling             5



   Report: methods and decisions                            10



   Report: results interpretation                           6



   Report: process and honesty                              4



   Total                                                    100




 A team with a simple tracker that is fully persistent, correctly role-restricted and loses zero tickets will

 beat a team with a polished dashboard that forgets everything on restart. That is not an accident — it

 is the point of the exercise.




   PA R T 1 2 — F R E Q U E N T LY A S K E D



 Do we need a specific framework to pass? No. Any frontend, backend and database combination

 is fine, as long as it is a real full-stack application with persistent storage. A single-file   SQLite

 database counts.



 Can we use a UI library, an ORM or a backend-as-a-service? UI libraries and ORMs: yes. For a

 hosted service such as Firebase or Supabase, ask your organisers for the rule in force at this event.

 If permitted, you must still be able to show the data model, the validation and the role rules you built

 — not just “the platform handles it.”




IT HAPPENS @ RAALE #12 HelpDesk 360                                                                        12 / 13
 Do we need real user registration? No. Seeded      employee and technician accounts with a login
 are enough. A role switcher that only hides buttons in the UI is not — the backend must enforce who

 can see and change what.



 What if the database is empty or the backend is down? Show a clear empty state or error

 message — don’t display fake sample tickets, don’t crash the page, and don’t leave the employee

 guessing whether a submission went through.



 Can we keep tickets in memory, a JSON file or browser storage instead of a database? No —

 Requirement 2 is persistent database storage. Data held in an array, in   localStorage or in server
 memory doesn’t meet the contract, even if everything else works.



 Our application is missing some features. Are we finished? No, but don’t panic either — stretch

 features are bonus marks. A narrow tracker that is 100% persistent, correctly role-restricted and

 honest about its gaps, scores well. Report the gaps honestly — that explanation earns marks.



 Good luck — and build the pipe first.




IT HAPPENS @ RAALE #12 HelpDesk 360                                                                  13 / 13
