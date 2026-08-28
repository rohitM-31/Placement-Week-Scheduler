// Standalone correctness check — no MongoDB, no Express. Run with:
//   node src/tests/scheduler.test.js
// Exits non-zero on any failed assertion so it's CI-friendly.
import assert from "node:assert/strict";
import { generateDataset } from "../generator/dataGenerator.js";
import { buildInitialSchedule } from "../scheduler/scheduler.js";
import { replan } from "../scheduler/replanner.js";
import { computeMetrics } from "../scheduler/metrics.js";

function checkNoDoubleBooking(interviews, label) {
  const scheduled = interviews.filter((i) => i.status === "scheduled");

  for (const key of ["studentId", "roomId", "panelId"]) {
    const byKeyDay = new Map();
    for (const iv of scheduled) {
      const k = `${iv[key]}#${iv.day}`;
      if (!byKeyDay.has(k)) byKeyDay.set(k, []);
      byKeyDay.get(k).push(iv);
    }
    for (const [k, list] of byKeyDay) {
      list.sort((a, b) => a.startMin - b.startMin);
      for (let i = 1; i < list.length; i++) {
        assert.ok(
          list[i].startMin >= list[i - 1].endMin,
          `[${label}] double-booking on ${key}=${k}: ${JSON.stringify(list[i - 1])} vs ${JSON.stringify(
            list[i]
          )}`
        );
      }
    }
  }
  console.log(`  ok: no double-booking (student/room/panel) [${label}]`);
}

function main() {
  console.log("=== 1. Generate dataset ===");
  const { companies, students, rooms, meta } = generateDataset({ seed: 42 });
  assert.equal(companies.length, 35);
  assert.equal(students.length, 800);
  assert.equal(rooms.length, 20);
  const totalShortlists = students.reduce((sum, s) => sum + s.shortlistedBy.length, 0);
  console.log(
    `  companies=${companies.length} students=${students.length} rooms=${rooms.length} totalShortlistPairs=${totalShortlists}`
  );
  assert.ok(totalShortlists > 1000, "expected substantial overlap volume");
  const zeroShortlist = students.filter((s) => s.shortlistedBy.length === 0).length;
  console.log(`  students with 0 shortlists: ${zeroShortlist} (realistic - not everyone gets picked)`);
  const maxShortlist = Math.max(...students.map((s) => s.shortlistedBy.length));
  console.log(`  max shortlists for one student: ${maxShortlist} (overlap conflict source)`);

  console.log("\n=== 2. Build initial schedule ===");
  const { interviews } = buildInitialSchedule({ companies, students, rooms });
  console.log(`  total interview requirements: ${interviews.length}`);
  checkNoDoubleBooking(interviews, "initial");

  const metrics = computeMetrics({ companies, students, rooms, interviews });
  console.log("  metrics:", JSON.stringify(metrics, null, 2));
  assert.equal(metrics.studentClashCount, 0, "must have zero student clashes");
  assert.ok(metrics.completionRate > 0 && metrics.completionRate <= 1);

  console.log("\n=== 3. Replan: company_delay ===");
  {
    const dayOneCompanies = companies.filter((c) => c.day === 1 && c.tier === "mass");
    const target = dayOneCompanies[0];
    const before = interviews.filter((iv) => iv.companyId === target.companyId && iv.status === "scheduled").length;
    const result = replan(
      { companies, students, rooms, interviews },
      { type: "company_delay", payload: { companyId: target.companyId, delayMinutes: 120 } }
    );
    checkNoDoubleBooking(result.interviews, "after company_delay");
    const touchedOutsideCompany = result.diff.moved
      .concat(result.diff.cancelled)
      .filter((x) => x.companyId !== target.companyId);
    assert.equal(touchedOutsideCompany.length, 0, "delay must not touch other companies' interviews");
    console.log(
      `  ${target.name} delayed 120min: before=${before} scheduled, moved=${result.diff.moved.length}, cancelled=${result.diff.cancelled.length}, churnRate=${result.diff.churn.churnRate}`
    );
    console.log("  note:", result.diff.coordinatorNotes[0]);
    const m2 = computeMetrics({ companies, students, rooms, interviews: result.interviews });
    assert.equal(m2.studentClashCount, 0);
  }

  console.log("\n=== 4. Replan: panel_drop ===");
  {
    const withPanels = companies.find((c) => c.panels.filter((p) => p.active).length > 1);
    const panel = withPanels.panels.find((p) => p.active);
    const result = replan(
      { companies, students, rooms, interviews },
      { type: "panel_drop", payload: { companyId: withPanels.companyId, panelId: panel.panelId } }
    );
    checkNoDoubleBooking(result.interviews, "after panel_drop");
    console.log(
      `  ${withPanels.name} panel ${panel.panelId} dropped: moved=${result.diff.moved.length}, cancelled=${result.diff.cancelled.length}, churnRate=${result.diff.churn.churnRate}`
    );
    console.log("  note:", result.diff.coordinatorNotes[0]);
  }

  console.log("\n=== 5. Replan: student_withdraw (with backfill) ===");
  {
    const withMultiple = students.find((s) => s.shortlistedBy.length >= 2 && s.status === "active");
    const result = replan(
      { companies, students, rooms, interviews },
      {
        type: "student_withdraw",
        payload: { studentId: withMultiple.studentId, reason: "Accepted offer elsewhere", backfill: true },
      }
    );
    checkNoDoubleBooking(result.interviews, "after student_withdraw");
    console.log(
      `  ${withMultiple.studentId} withdrew: cancelled=${result.diff.cancelled.length}, reinstated(backfilled)=${result.diff.reinstated.length}`
    );
    console.log("  note:", result.diff.coordinatorNotes[0]);
  }

  console.log("\n=== 6. Replan: room_unavailable ===");
  {
    const busyRoom = rooms[0];
    const result = replan(
      { companies, students, rooms, interviews },
      {
        type: "room_unavailable",
        payload: { roomId: busyRoom.roomId, reason: "AC failure", day: 1 },
      }
    );
    checkNoDoubleBooking(result.interviews, "after room_unavailable");
    console.log(
      `  ${busyRoom.roomId} unavailable Day 1: moved=${result.diff.moved.length}, cancelled=${result.diff.cancelled.length}, churnRate=${result.diff.churn.churnRate}`
    );
    console.log("  note:", result.diff.coordinatorNotes[0]);
  }

  console.log("\n=== 7. Live-defense-style compound disruption ===");
  {
    // "the biggest Day-1 recruiter is 3 hours late, one of its panels
    // dropped, and 15 students just withdrew" — run all three back to back
    // and confirm the schedule stays internally consistent throughout.
    const massSorted = [...companies].filter((c) => c.day === 1 && c.tier === "mass");
    const big = massSorted[0];
    let state = { companies, students, rooms, interviews };
    let r1 = replan(state, { type: "company_delay", payload: { companyId: big.companyId, delayMinutes: 180 } });
    checkNoDoubleBooking(r1.interviews, "compound step 1 (delay)");
    const droppablePanel = big.panels.find((p) => p.active);
    let r2 = replan(state, { type: "panel_drop", payload: { companyId: big.companyId, panelId: droppablePanel.panelId } });
    checkNoDoubleBooking(r2.interviews, "compound step 2 (panel drop)");
    const withdrawing = students.filter((s) => s.status === "active").slice(0, 15);
    for (const s of withdrawing) {
      replan(state, { type: "student_withdraw", payload: { studentId: s.studentId, reason: "Offer accepted", backfill: true } });
    }
    checkNoDoubleBooking(state.interviews, "compound step 3 (15 withdrawals)");
    const finalMetrics = computeMetrics({ companies, students, rooms, interviews: state.interviews });
    console.log("  final metrics after compound disruption:", JSON.stringify(finalMetrics, null, 2));
    assert.equal(finalMetrics.studentClashCount, 0);
  }

  console.log("\nALL CHECKS PASSED");
}

main();
