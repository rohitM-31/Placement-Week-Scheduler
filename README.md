# Placement Week Scheduler — Mirai Labs Assignment A

A MERN app that replaces the placement coordinator's whiteboard: it generates a realistic
placement-week dataset, builds a feasible interview schedule under real resource constraints,
and replans it live when things go wrong — a company arrives late, a panel drops out, a student
withdraws, a room goes dark — without blowing up the rest of the day's schedule.

Stack: **MongoDB** (via Mongoose, with a zero-config in-memory fallback) · **Express** ·
**React** (Vite) · **Node.js**.

---

## 1. Running it

```bash
# from the project root
npm run install:all     # installs backend + frontend deps
npm run dev              # starts API on :4000 and the dashboard on :5173
```

Open `http://localhost:5173`, click **Generate + schedule**, then start triggering
disruptions from the right-hand panel.

No MongoDB install is required to try it out: if `MONGODB_URI` isn't set, the backend starts an
in-memory MongoDB automatically (`mongodb-memory-server`) — real Mongoose models, real query
semantics, just not persisted across restarts. For a real deployment, copy `backend/.env.example`
to `backend/.env` and point `MONGODB_URI` at a real instance (local `mongod` or Atlas); data will
persist normally.

> If your machine (or CI/sandbox) blocks the one-time MongoDB binary download the in-memory
> fallback needs, either install MongoDB locally and set `MONGODB_URI`, or run one via Docker:
> `docker run -d -p 27017:27017 mongo:7` then `MONGODB_URI=mongodb://localhost:27017/placement_scheduler`.

### Verifying the core logic without any of that

The scheduler and replanner are plain, DB-free JS modules. The fastest way to check they're
correct on your machine:

```bash
cd backend
npm install
npm run test:scheduler
```

This generates the dataset, builds the initial schedule, runs all four disruption types plus a
compound "live defense" scenario, and asserts **zero student/room/panel double-booking** at every
step. It prints the full metrics after each stage. This is also the fastest way to see the numbers
discussed below without standing up MongoDB.

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` (root) | Runs backend + frontend together |
| `npm run seed` (root) | Generates + schedules a dataset directly against the DB, no server needed |
| `npm run test:scheduler` (root) | The DB-free correctness check described above |
| `node backend/src/scripts/seed.js --seed=7 --companies=40 --students=900` | Seed with custom parameters |

---

## 2. Architecture

```
backend/
  src/
    generator/dataGenerator.js   — realistic companies/students/rooms
    scheduler/
      scheduler.js               — builds the initial feasible schedule
      replanner.js                — minimal-disturbance repair for disruptions
      resourceTracker.js          — shared interval-overlap bookkeeping
      metrics.js                  — the numbers that define "good"
      reasons.js                  — machine-readable "why unscheduled" codes
    models/                       — Mongoose schemas (Company, Student, Room, Interview, DisruptionLog)
    services/store.js             — DB <-> plain-object bridge (scheduler stays DB-agnostic)
    controllers/, routes/         — REST API
    tests/scheduler.test.js       — standalone correctness check (see above)
frontend/
  src/
    components/                   — dashboard widgets
    App.jsx                       — coordinator console layout
```

The scheduler and replanner never talk to Mongoose directly — they take and return plain
`{companies, students, rooms, interviews}` objects. `services/store.js` is the only place that
knows about the database. This is what let the core logic be fully unit-tested in this sandbox
even where network access blocks running MongoDB itself, and it means the algorithm could be
lifted into a different persistence layer without changes.

---

## 3. The dataset generator

`POST /api/dataset/generate` (defaults: 35 companies, 800 students, 20 rooms, 4 days — the
assignment's own numbers).

**Companies** are split into three tiers, because a real placement week doesn't look like 35
interchangeable companies:

- **Mass recruiters** (~6 companies, all on Day 1): service-industry volume hirers. Low CGPA
  cutoff (5.5–6.5), broad branch eligibility, 4–6 panels, short 15–25 min interviews, and they
  shortlist **150–400 students each** — because that's what a mass recruiter actually does.
- **Core** (~17 companies, spread across all 4 days): mid-size product/engineering firms.
  Cutoff 6.5–7.5, 2–4 panels, 30–40 min interviews, target 2–4 branches, shortlist 60–150.
- **Niche** (~12 companies, spread across all 4 days): highly selective dream companies. Cutoff
  7.8–9.0, 1–2 panels, 45–60 min interviews, target CSE/ISE/AIML/ECE, shortlist only 15–50.

**Students** get a CGPA from a clipped normal distribution (mean 7.2, σ 0.85) and a branch from a
CS-skewed weighted pool. Shortlisting isn't uniform: each student gets a "desirability" score
(CGPA + noise), and **core/niche companies sample shortlists weighted toward desirability** —
this is what makes high-CGPA students land on many overlapping "dream company" lists, which is
the actual source of scheduling conflict in real placement weeks. Mass recruiters instead sample
near-uniformly from everyone who clears their (low) cutoff, because volume hiring isn't
selectivity-driven the same way. With the default seed, this produces students with up to 14
overlapping shortlists and ~9% of students with zero shortlists — both realistic.

Everything is seeded (`makeRng` — mulberry32), so `--seed=42` always reproduces the exact same
dataset — useful for a live defense session where you want to show the same numbers twice.

---

## 4. Building the initial schedule

`buildInitialSchedule` (`scheduler/scheduler.js`) is a single-pass, priority-ordered constructive
solver — not a full CSP backtracker or ILP. Companies are processed **day ascending, then
priority descending** (mass/Day-1 companies claim rooms and panel time first). Within a company,
students are ordered by **same-day shortlist demand** (how many other companies want them that
same day) descending, so the hardest-to-place students get first crack at open slots.

For each company/student pair, the solver walks the company's panel×time slot grid in time order
and commits the first slot where the student is free, the panel is free, and a room is free
(preferring the panel's already-assigned room, to avoid unrealistic room-hopping). If no slot
works, the interview is recorded as `unscheduled` with one of three specific reasons — the system
**never drops a requirement silently**:

- `CAPACITY_EXHAUSTED` — the company's own panel-hours ran out before this student's turn.
- `STUDENT_CONFLICT` — capacity existed, but the student was already booked at every remaining slot.
- `ROOM_SHORTAGE` — capacity and student time both existed, but no room was free at any of those times.

We chose a fast deterministic greedy pass over backtracking/ILP for three reasons: it handles
thousands of interviews in well under a second (matters for a live one-click replan), it's
reproducible and easy to reason about in front of a defense panel, and — most importantly — it
gives every interview a **stable identity** that the replanner can diff against later. A solver
that re-optimizes globally on every change would make "what changed" an expensive, fuzzy question
instead of a precise one.

### What the numbers actually look like (seed 42, default sizes)

```
Total interview requirements: 3,399
Scheduled:                    1,352  (39.8%)
Unscheduled:                  2,047
  CAPACITY_EXHAUSTED: 1,527   ROOM_SHORTAGE: 514   STUDENT_CONFLICT: 6
Room utilization:     91.9%
Panel utilization:    79.1%
Avg student wait:     66 min
Student clashes:      0
```

That ~40% completion rate is **not a bug** — it's what the assignment's own numbers imply. Day 1
alone (all 6 mass recruiters) generates ~1,460 interview requirements at ~20 minutes each — about
29,200 room-minutes of demand — against a 20-room, ~9-hour day, i.e. **10,800 room-minutes of
supply**. Even a perfect packing can only clear about a third of Day 1. This is exactly the
"it usually is [infeasible]" the brief warns about, and it's a direct, honest consequence of 20
rooms trying to serve mass recruiters that realistically shortlist hundreds of students — not
something to fudge away by shrinking the shortlists until the numbers look nicer.

---

## 5. Replanning under disruption

`replan()` (`scheduler/replanner.js`) implements **local repair**, not re-optimization. The
policy, stated once and applied consistently across all four disruption types:

> **A replan may only touch interviews that are directly invalidated by the disruption, plus (for
> a delay or panel drop) the rest of that same company's own remaining interviews that day. It
> never re-packs or moves another company's interviews, and it never touches an interview that
> already happened.**

This is the direct answer to "how much reshuffling is acceptable" — moving 200 unrelated
appointments to fix one company's 2-hour delay is exactly the failure mode the assignment calls
out, so the blast radius is capped by construction, not by an optimization budget we hope holds.

| Disruption | What's touched | Repair strategy |
|---|---|---|
| **Company delay** (`company_delay`) | Only that company's own scheduled interviews that day | Window shifts later by the delay, extends its own closing time to try to recover the lost interviews (capped at 19:00 campus close), then re-places its own interviews — same panel first, another of its own panels second. Anything that still doesn't fit is reported `NO_ALTERNATE_FOUND`, never silently dropped. |
| **Panel drop** (`panel_drop`) | Only that panel's scheduled interviews | Redistributed across the company's remaining active panels at the earliest free (student+room) slot. What doesn't fit is `PANEL_UNAVAILABLE`. |
| **Student withdrawal** (`student_withdraw`) | Only that student's own remaining interviews | Cancelled outright, freeing their slots. **No automatic backfill by default** — see §6. An opt-in `backfill` flag fills freed slots from the highest-demand previously-unscheduled student who's eligible and free at that exact time. |
| **Room unavailable** (`room_unavailable`) | Only interviews currently booked in that room (optionally scoped to a day) | Tries same time / different room first (cheapest possible fix); only if that fails does it try the same panel at a different time. What doesn't fit is `ROOM_UNAVAILABLE`. |

Every replan returns a **diff**, not just a new state:

```json
{
  "moved": [{ "interviewId": "...", "before": "Day 1 09:00-09:20 · R05 · C001-P1", "after": "..." }],
  "cancelled": [{ "interviewId": "...", "reasonCode": "NO_ALTERNATE_FOUND", "wasAt": "..." }],
  "reinstated": [ /* backfilled interviews */ ],
  "affectedStudents": ["S0001", "..."],
  "affectedCompanies": ["C001"],
  "coordinatorNotes": ["Wavelane Technologies delayed 120min on Day 1: ..."],
  "churn": { "previouslyScheduled": 27, "changedCount": 27, "churnRate": 1.0 }
}
```

`affectedStudents` / `affectedCompanies` are exactly "who needs to be informed." `churn` is
exactly "how much did this actually disturb" — see §6.

---

## 6. Decisions we made and why (the required defense)

### What does a "good" schedule mean?

We report six numbers, computed by `scheduler/metrics.js`, and treat them in this order of
importance:

1. **`studentClashCount` — must always be 0.** This is a hard constraint, not something we
   trade off. It's recomputed independently of the scheduler's own bookkeeping specifically so a
   bug in the solver would show up here rather than being hidden by its own assumptions.
2. **`completionRate`** — % of required interviews actually scheduled. The top-line number, but
   deliberately *not* the only one — see the next point.
3. **`roomUtilization` / `panelUtilization`** — booked-minutes ÷ available-minutes. Distinguishes
   "we're at 92% room utilization, this is a real room shortage" from "we're at 40% utilization
   with a low completion rate," which would point at a *scheduling* problem, not a *resource*
   problem, and would demand a different fix.
4. **`avgStudentWaitMinutes`** — average idle gap between a student's consecutive interviews the
   same day. A schedule can be 100% "feasible" and still leave students sitting around for four
   hours between two ten-minute interviews. We treat that as a quality defect, not a footnote.
5. **`unscheduledByReason`** — not a number, a breakdown. "60% didn't fit" is not actionable;
   "1,527 hit capacity, 514 hit room shortage, 6 were student conflicts" tells the coordinator
   exactly what lever to pull (more rooms? shorter interviews? smaller shortlists?).
6. **`replanChurn`** (only after a replan) — % of previously-scheduled interviews whose room,
   panel, or time actually changed. This is the number that keeps a 2-hour delay from becoming
   "200 appointments moved" — see below.

A schedule that's 100% complete but achieves it by giving every student a 3-hour wait, or a
replan that "succeeds" by quietly re-packing the whole day, would both score badly on this rubric
even though naive "did everything get scheduled?" would call them fine.

### When the schedule is infeasible, which constraint bends first — and who decides?

**The system decides the default, the coordinator can always override it.** Concretely:

- Companies are processed **Day-1-mass-recruiters first, by priority score**. When capacity runs
  out, it's the *last-processed* company/student pairs that fail to schedule — which, by
  construction, tends to be lower-priority-tier or later-day companies, not the marquee Day-1
  recruiters the coordinator is under the most pressure to keep happy. That's a policy choice, not
  an accident: we'd rather a niche company's 20th-choice candidate go unscheduled than have a mass
  recruiter's schedule silently full of gaps.
- We do **not** try to be clever about *which individual student* bends within a company — same-day
  demand ordering already gives the most contested students first crack at slots, so within a
  tier, students who are in genuine high demand across companies are protected before ones who
  aren't.
- Every bend is reported with a reason code (§4), never silently. The coordinator sees exactly
  who got dropped and why, and — because `priorityScore` and processing order are just data, not
  hardcoded — could re-run with different priorities if they disagree with the default ordering.
  We treat "the algorithm decides who bends by default, but the decision is visible and
  overridable" as the right split of responsibility: a stressed coordinator on the day needs a
  sane default, not a blank slate, but they also need to be able to say "no, actually, protect
  this company instead" without our opinion being buried in code.

### How much reshuffling is acceptable during a replan?

Stated in §5 and enforced structurally, not just as a target: **a replan only ever touches
interviews belonging to the thing that was disrupted** (that company's own interviews for a delay
or panel drop; that student's own interviews for a withdrawal; that room's own bookings for a
room outage). It is architecturally impossible for a company-delay replan to move another
company's interview, because the repair loop never even looks at other companies' bookings except
as fixed obstacles to route around.

We report the actual number as `churn.churnRate` on every replan response so this isn't just an
architectural promise — the coordinator can literally see "27/27 of this company's own interviews
moved (100% of *its own* schedule, 0% of everyone else's)" after a 2-hour delay, and compare it
against a full from-scratch rebuild (`POST /api/schedule/rebuild`) to see how much worse an
"optimal" re-solve would have been by comparison.

For student withdrawals specifically, we went further and made **backfilling the freed slot
opt-in, default off** — even though it's "free capacity going to waste" from a completion-rate
standpoint, automatically filling it means one more student and one more company now have to be
notified of a change they didn't ask for. We'd rather the coordinator explicitly decide "yes, use
this gap" (`backfill: true`) than have every withdrawal ripple outward by default.

---

## 7. The coordinator's dashboard

`frontend/` is a single-page React app (`App.jsx`) built around what a stressed person needs on
the day, not a general-purpose data browser:

- **Overview stat grid** — the six metrics from §6, color-coded (green/amber/red) so problems
  are visible at a glance, not something you have to compute yourself.
- **Why interviews couldn't be scheduled** — the reason breakdown, always visible, not buried in
  a log.
- **Companies by day** — tabbed by day, with per-company completion so you can spot "this
  company is in trouble" before it becomes a crisis.
- **Interview schedule table** — filterable by day/company/status, for looking up specifics.
- **One-click disruption panel** — the four disruption types as simple forms; hitting "Replan"
  is the one-click replan the assignment asks for.
- **Change summary (diff panel)** — moved / cancelled / backfilled counts, churn %, the
  human-readable coordinator note, and the actual before/after list — the artifact you'd screenshot
  and paste into a "here's what just happened" message to the placements office.
- **Recent disruptions log** — an audit trail, because "what did we already change today" is a
  question a coordinator will get asked.

---

## 8. Preparing for the live defense

The scenario the brief describes almost verbatim — *"the biggest Day-1 recruiter is 3 hours late,
one of its panels dropped, and 15 students just withdrew"* — is exactly what
`npm run test:scheduler` step 7 runs end to end, and it's easy to reproduce live in the dashboard:

1. Generate a dataset (seed 42 reproduces the numbers in §4 exactly).
2. **Disruption → Company delay**: pick the largest Day-1 mass recruiter, 180 minutes.
3. **Disruption → Panel drop**: pick one of that same company's panels.
4. **Disruption → Student withdraw** ×15 (or script it — the test file shows the pattern), with
   `backfill: true` to show the waitlist mechanism working.
5. Walk through the diff panel after each step, and the "Recent disruptions" log to show the full
   sequence stayed internally consistent (zero clashes throughout — the test asserts this).

### Known limitations (worth naming before someone else finds them)

- The solver is a single deterministic greedy pass, not a backtracking/ILP solver — it can leave
  a room-minute "on the table" in principle (a slightly different ordering might pack a few more
  interviews in). We traded a small amount of optimality for speed, determinism, and — critically
  — a schedule that has stable interview identities for the replanner to diff against. A solver
  that re-optimizes globally can't give you a meaningful "what changed."
- Company delay/panel-drop repairs prefer the original panel/room but will use another company
  panel or a different room if needed; we did not implement swapping two *different* companies'
  bookings to free up a slot — that would violate the "never touch another company's schedule"
  rule that answers §6's reshuffling question, so it's a deliberate omission, not an oversight.
- `interviewDurationMins` and panel counts are fixed per company for the whole day; real
  companies sometimes vary this by round. Extending the generator/scheduler to multi-round
  interviews (a screening slot feeding a technical slot) is a natural next step but wasn't in
  scope for this assignment's constraints.
