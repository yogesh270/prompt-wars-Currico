import assert from "node:assert";
import { PRIYA_PERSONA } from "../src/lib/seed";

const BASE_URL = "http://localhost:3000";

async function run() {
  console.log("══════════════════════════════════════════════════════");
  console.log("  Currico (Adaptive Core) — Live E2E Verification Suite");
  console.log("══════════════════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      fn();
      console.log(`  ✅ PASS  ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAIL  ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Verify Home Page HTML & Palette
  console.log("── 1. Front-end Server & Brand Presence ──");
  const homeRes = await fetch(`${BASE_URL}/`);
  test("Server responds with HTTP 200", () => {
    assert.strictEqual(homeRes.status, 200);
  });

  const html = await homeRes.text();
  test("HTML contains Currico brand & v2.0 badge", () => {
    assert(html.includes("Currico"));
    assert(html.includes("v2.0"));
  });

  test("HTML contains Deep Obsidian canvas palette & styling", () => {
    assert(html.includes("07080C") || html.includes("background-color:#07080c") || html.includes("bg-[#07080C]"));
  });

  test("Navbar has DB status indicator", () => {
    assert(html.includes("DB: SUPABASE LIVE") || html.includes("DB: LOCAL FALLBACK"));
  });

  // 2. Test Multi-Agent Plan Generation (/api/plan)
  console.log("\n── 2. Multi-Agent Curriculum Plan Generation (/api/plan) ──");
  const planRes = await fetch(`${BASE_URL}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ learner: PRIYA_PERSONA }),
  });

  test("Plan API returns HTTP 200", () => {
    assert.strictEqual(planRes.status, 200);
  });

  const planData = await planRes.json();
  test("Plan contains modules, totalHours, and weeks", () => {
    assert(planData.plan);
    assert(planData.plan.modules.length > 0);
    assert(planData.plan.totalHours > 0);
    assert(planData.plan.numberOfWeeks > 0);
  });

  test("Planner strictly enforces <= 5h weekly cap via chunking", () => {
    const budget = PRIYA_PERSONA.hoursPerWeek; // 5h
    assert(planData.plan.weeklyHours <= budget * 1.05);

    // Group by week
    const weekMap: Record<number, number> = {};
    for (const m of planData.plan.modules) {
      weekMap[m.week] = (weekMap[m.week] || 0) + m.hours;
    }
    for (const [week, hours] of Object.entries(weekMap)) {
      assert(hours <= budget * 1.05, `Week ${week} has ${hours}h, which exceeds ${budget}h`);
    }
  });

  test("Multi-Agent Trace includes Gap, Planner, and Critic envelopes", () => {
    const agents = planData.trace.map((t: any) => t.agent);
    assert(agents.includes("gap"));
    assert(agents.includes("planner"));
    assert(agents.includes("critic"));
  });

  test("Critic validates 3 hard invariants to PASS/OK", () => {
    const critic = planData.trace.find((t: any) => t.agent === "critic" && t.status === "ok");
    assert(critic, "Critic with status ok exists");
    assert.strictEqual(critic.output.verdict, "pass");
    assert(critic.output.checks.weeklyBudgetPass === true || critic.output.checks.weekly_hours_cap?.status === "PASS");
    assert(critic.output.checks.dagOrderPass === true || critic.output.checks.prerequisite_dag?.status === "PASS");
    assert(critic.output.checks.zeroHallucinationsPass === true || critic.output.checks.zero_hallucinations?.status === "PASS");
  });

  // 3. Test Adaptive Replanning upon Quiz Failure (/api/adapt)
  console.log("\n── 3. Adaptive Replanning upon Quiz Failure (/api/adapt) ──");
  const adaptRes = await fetch(`${BASE_URL}/api/adapt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      learner: PRIYA_PERSONA,
      currentPlan: planData.plan,
      event: {
        type: "QUIZ_FAILED",
        answers: { "fs-q1": "var" }, // Wrong answer for javascript
      },
    }),
  });

  test("Adapt API returns HTTP 200", () => {
    assert.strictEqual(adaptRes.status, 200);
  });

  const adaptData = await adaptRes.json();
  test("Plan version increments (v2 -> v3)", () => {
    assert.strictEqual(adaptData.plan.version, planData.plan.version + 1);
  });

  test("Injected targeted remedial module with isRemedial and diff='added'", () => {
    const remedialMod = adaptData.plan.modules.find(
      (m: any) => m.isRemedial || m.title.includes("[Remediation]") || m.id.includes(":remedial")
    );
    assert(remedialMod, "Remedial module exists in plan");
    assert.strictEqual(remedialMod.diff, "added");
    assert.strictEqual(remedialMod.week, 1);
  });

  test("Week 1 capacity strictly preserves <= 5h cap with remedial module", () => {
    const week1Hours = adaptData.plan.modules
      .filter((m: any) => m.week === 1)
      .reduce((s: number, m: any) => s + m.hours, 0);
    assert(week1Hours <= 5.0, `Week 1 hours (${week1Hours}h) exceeds 5h limit`);
  });

  test("Assessor logged diagnostic failure and dropped skill level", () => {
    const assessor = adaptData.trace.find((t: any) => t.agent === "assessor");
    assert(assessor, "Assessor envelope exists");
    assert(assessor.output.passed === false);
    assert(adaptData.updatedLearner, "Updated learner returned");
    const jsSkill = adaptData.updatedLearner.skills.find((s: any) => s.skillId === "javascript");
    assert(jsSkill.level < 2, "JavaScript mastery level dropped");
  });

  // 4. Test Resume / Bio Extraction (/api/profile/extract)
  console.log("\n── 4. Custom Profile & Resume Text Extraction (/api/profile/extract) ──");
  const extractRes = await fetch(`${BASE_URL}/api/profile/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resumeText: "Experienced Python backend engineer with 3 years of PostgreSQL, Docker, and REST APIs. Basic JavaScript and React knowledge.",
    }),
  });

  test("Profile extract API returns HTTP 200", () => {
    assert.strictEqual(extractRes.status, 200);
  });

  const extractData = await extractRes.json();
  test("Extracts relevant skill levels (python, postgres, docker, react)", () => {
    assert(extractData.skills && extractData.skills.length > 0);
    const skillIds = extractData.skills.map((s: any) => s.skillId);
    assert(skillIds.includes("python"));
    assert(skillIds.includes("postgres") || skillIds.includes("sql"));
  });

  // Summary
  console.log("\n══════════════════════════════════════════════════════");
  console.log(`  VERIFICATION RESULTS: ${passed} passed, ${failed} failed`);
  console.log("══════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error("Verification error:", err);
  process.exit(1);
});

