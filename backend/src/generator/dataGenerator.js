import { makeRng, randInt, randFloat, pick, pickN, weightedPick, randNormal } from "../utils/random.js";

const BRANCHES = [
  { code: "CSE", weight: 22 },
  { code: "ISE", weight: 14 },
  { code: "AIML", weight: 10 },
  { code: "ECE", weight: 16 },
  { code: "EEE", weight: 10 },
  { code: "MECH", weight: 12 },
  { code: "CIVIL", weight: 8 },
  { code: "CHEM", weight: 4 },
  { code: "BIOTECH", weight: 4 },
];

const MASS_PREFIXES = ["Vertex", "Nimbus", "Orbis", "Quanta", "Trident", "Meridian", "Wavelane"];
const MASS_SUFFIXES = ["Technologies", "Consulting Services", "Global Solutions", "Systems"];

const CORE_PREFIXES = [
  "Ironclad",
  "Redshift",
  "Halcyon",
  "Skyforge",
  "Ampere",
  "Cobalt",
  "Northbridge",
  "Solstice",
  "Granite",
  "Beacon",
  "Cinder",
  "Palladium",
  "Fathom",
  "Anchorpoint",
  "Vellum",
  "Cascade",
  "Argon",
];

const NICHE_PREFIXES = [
  "Zenaris",
  "Kestrel",
  "Obsidian",
  "Lumenary",
  "Trueform",
  "Voltaic",
  "Nightwing",
  "Crestline",
  "Pinnacle",
  "Emberlab",
  "Driftwood",
  "Starlight",
];
const NICHE_SUFFIXES = ["Labs", "AI", "Robotics", "Studio", "Quant", "Research"];
const CORE_SUFFIXES = ["Systems", "Industries", "Networks", "Corp", "Group", "Manufacturing", "Energy"];

function weightedBranchPick(rng) {
  const codes = BRANCHES.map((b) => b.code);
  const weights = BRANCHES.map((b) => b.weight);
  return weightedPick(rng, codes, weights);
}

function makeCompanyName(rng, tier, usedNames) {
  let name;
  let tries = 0;
  do {
    if (tier === "mass") {
      name = `${pick(rng, MASS_PREFIXES)} ${pick(rng, MASS_SUFFIXES)}`;
    } else if (tier === "core") {
      name = `${pick(rng, CORE_PREFIXES)} ${pick(rng, CORE_SUFFIXES)}`;
    } else {
      name = `${pick(rng, NICHE_PREFIXES)} ${pick(rng, NICHE_SUFFIXES)}`;
    }
    tries++;
  } while (usedNames.has(name) && tries < 50);
  usedNames.add(name);
  return name;
}

/**
 * Generates a realistic placement-week dataset.
 *
 * Design choices (see README "Decisions" section for the full defense):
 *  - Company tiers: "mass" (high-volume service recruiters, concentrated on
 *    Day 1, low CGPA cutoff, broad branch eligibility, short interviews,
 *    many panels), "core" (mid-size product/core-engineering firms, spread
 *    across all 4 days), "niche" (highly selective dream/product companies,
 *    small headcount, long interviews, high cutoff).
 *  - Shortlisting uses a desirability-weighted sample so that high-CGPA
 *    students land on many overlapping "core"/"niche" lists (the real
 *    source of scheduling conflict), while mass recruiters sample broadly
 *    for volume rather than only the toppers.
 */
export function generateDataset(opts = {}) {
  const {
    seed = 42,
    numCompanies = 35,
    numStudents = 800,
    numRooms = 20,
    numDays = 4,
  } = opts;

  const rng = makeRng(seed);
  const usedNames = new Set();

  // ---- Company tier split -------------------------------------------------
  // Roughly: 6 mass, 17 core, 12 niche for 35 companies (scales proportionally
  // for other totals). Day-1 is deliberately loaded with mass recruiters.
  const massCount = Math.max(1, Math.round(numCompanies * (6 / 35)));
  const nicheCount = Math.max(1, Math.round(numCompanies * (12 / 35)));
  const coreCount = Math.max(0, numCompanies - massCount - nicheCount);

  const tierPlan = [
    ...Array(massCount).fill("mass"),
    ...Array(coreCount).fill("core"),
    ...Array(nicheCount).fill("niche"),
  ];

  // Day assignment: all mass on Day 1, core/niche spread across remaining
  // capacity with a slight taper (fewer companies as the week goes on).
  const dayTargets = distributeDays(tierPlan.length, massCount, numDays);

  const companies = [];
  let dayCursor = 0;
  const dayFill = Array(numDays + 1).fill(0);

  // place mass first (day 1), then core/niche round-robin across remaining days
  const massCompanies = tierPlan.filter((t) => t === "mass");
  const others = tierPlan.filter((t) => t !== "mass").sort(() => (rng() < 0.5 ? -1 : 1));

  let idx = 0;
  for (const tier of massCompanies) {
    companies.push(buildCompany(rng, idx++, tier, 1, usedNames));
    dayFill[1]++;
  }
  let day = numDays > 1 ? 2 : 1;
  for (const tier of others) {
    // keep placing on current day until its target is hit, then advance
    while (day <= numDays && dayFill[day] >= dayTargets[day]) day++;
    if (day > numDays) day = numDays; // overflow safety
    companies.push(buildCompany(rng, idx++, tier, day, usedNames));
    dayFill[day]++;
  }

  // ---- Rooms ---------------------------------------------------------------
  const buildings = ["Block A", "Block B", "Block C"];
  const rooms = [];
  for (let i = 0; i < numRooms; i++) {
    const building = buildings[i % buildings.length];
    const floor = 1 + (Math.floor(i / buildings.length) % 3);
    rooms.push({
      roomId: `R${String(i + 1).padStart(2, "0")}`,
      name: `${building} - Room ${100 * floor + (i % 6) + 1}`,
      building,
      floor,
      capacity: 1,
      unavailable: false,
    });
  }

  // ---- Students --------------------------------------------------------------
  const students = [];
  for (let i = 0; i < numStudents; i++) {
    const cgpa = Math.round(randNormal(rng, 7.2, 0.85, 5.0, 9.9) * 100) / 100;
    const branch = weightedBranchPick(rng);
    students.push({
      studentId: `S${String(i + 1).padStart(4, "0")}`,
      name: `Student ${i + 1}`,
      branch,
      cgpa,
      shortlistedBy: [],
      status: "active",
    });
  }

  // desirability: mostly CGPA-driven with noise, this is what makes top
  // students land on many overlapping "dream company" shortlists
  const desirability = new Map();
  for (const s of students) {
    const noise = randFloat(rng, -0.6, 0.6, 2);
    desirability.set(s.studentId, s.cgpa + noise);
  }

  for (const company of companies) {
    const eligible = students.filter((s) => {
      if (s.cgpa < company.cgpaCutoff) return false;
      if (company.branchesTargeted.length > 0 && !company.branchesTargeted.includes(s.branch))
        return false;
      return true;
    });

    if (eligible.length === 0) continue;

    const targetCount = Math.min(eligible.length, company._plannedShortlist);

    let chosen;
    if (company.tier === "mass") {
      // volume play: broad, near-uniform sample across all eligible students
      chosen = pickN(rng, eligible, targetCount);
    } else {
      // selectivity play: weighted heavily toward desirability so top
      // students stack up on multiple overlapping lists
      chosen = weightedSampleWithoutReplacement(
        rng,
        eligible,
        (s) => Math.max(0.05, desirability.get(s.studentId) ** 3),
        targetCount
      );
    }

    for (const s of chosen) {
      s.shortlistedBy.push(company.companyId);
    }
    delete company._plannedShortlist;
  }

  // Students who ended up with zero shortlists are realistic (not everyone
  // gets shortlisted) — leave them in the dataset as "active, no interviews".

  return { companies, students, rooms, meta: { seed, numCompanies, numStudents, numRooms, numDays } };
}

function distributeDays(totalCompanies, massCount, numDays) {
  // targets[1..numDays]; day 1 always absorbs all mass companies plus a
  // small share of the rest; remaining days split what's left with a taper.
  const remaining = totalCompanies - massCount;
  const targets = Array(numDays + 1).fill(0);
  targets[1] = massCount;
  if (numDays === 1) {
    targets[1] += remaining;
    return targets;
  }
  // taper weights e.g. for 4 days -> day2:0.34, day3:0.33, day4:0.33 of remainder,
  // but let day1 also soak a little of the remainder for realism.
  const day1Extra = Math.round(remaining * 0.12);
  targets[1] += day1Extra;
  const left = remaining - day1Extra;
  const restDays = numDays - 1;
  const base = Math.floor(left / restDays);
  let extra = left - base * restDays;
  for (let d = 2; d <= numDays; d++) {
    targets[d] = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
  }
  return targets;
}

function buildCompany(rng, idx, tier, day, usedNames) {
  const companyId = `C${String(idx + 1).padStart(3, "0")}`;
  const name = makeCompanyName(rng, tier, usedNames);

  let cgpaCutoff, durationMins, panelCount, plannedShortlist, priorityBase, branchesTargeted;

  if (tier === "mass") {
    cgpaCutoff = randFloat(rng, 5.5, 6.5, 1);
    durationMins = pick(rng, [15, 20, 20, 25]);
    panelCount = randInt(rng, 4, 6);
    plannedShortlist = randInt(rng, 150, 400);
    priorityBase = 300;
    branchesTargeted = []; // any branch
  } else if (tier === "core") {
    cgpaCutoff = randFloat(rng, 6.5, 7.5, 1);
    durationMins = pick(rng, [30, 30, 35, 40]);
    panelCount = randInt(rng, 2, 4);
    plannedShortlist = randInt(rng, 60, 150);
    priorityBase = 200;
    branchesTargeted = pickN(
      rng,
      BRANCHES.map((b) => b.code),
      randInt(rng, 2, 4)
    );
  } else {
    cgpaCutoff = randFloat(rng, 7.8, 9.0, 1);
    durationMins = pick(rng, [45, 45, 60]);
    panelCount = randInt(rng, 1, 2);
    plannedShortlist = randInt(rng, 15, 50);
    priorityBase = 100;
    branchesTargeted = pickN(
      rng,
      ["CSE", "ISE", "AIML", "ECE"],
      randInt(rng, 1, 3)
    );
  }

  const panels = Array.from({ length: panelCount }).map((_, i) => ({
    panelId: `${companyId}-P${i + 1}`,
    name: `Panel ${String.fromCharCode(65 + i)}`,
    active: true,
  }));

  // Working window: mass recruiters that need volume tend to run longer days.
  const startHour = tier === "mass" ? 9 : 9;
  const endHour = tier === "mass" ? 18 : tier === "core" ? 17.5 : 17;
  const windowStart = `${String(startHour).padStart(2, "0")}:00`;
  const endH = Math.floor(endHour);
  const endM = endHour % 1 === 0 ? "00" : "30";
  const windowEnd = `${String(endH).padStart(2, "0")}:${endM}`;

  return {
    companyId,
    name,
    tier,
    priorityScore: priorityBase + randInt(rng, 0, 50),
    day,
    cgpaCutoff,
    interviewDurationMins: durationMins,
    panels,
    windowStart,
    windowEnd,
    status: "scheduled",
    delayMinutes: 0,
    branchesTargeted,
    _plannedShortlist: plannedShortlist, // stripped before return
  };
}

// Weighted sample without replacement (efficient-ish for our sizes: a few
// hundred candidates, a few hundred picks).
function weightedSampleWithoutReplacement(rng, items, weightFn, n) {
  const pool = items.map((item) => ({ item, w: weightFn(item) }));
  const out = [];
  n = Math.min(n, pool.length);
  for (let k = 0; k < n; k++) {
    const total = pool.reduce((a, b) => a + b.w, 0);
    let r = rng() * total;
    let pickIdx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].w;
      if (r <= 0) {
        pickIdx = i;
        break;
      }
    }
    out.push(pool[pickIdx].item);
    pool.splice(pickIdx, 1);
  }
  return out;
}
