import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });

try {
  const { buildApplicationTimeline } = await server.ssrLoadModule("/src/components/CandidateDashboard.jsx");
  const date = (value) => new Date(value).toLocaleDateString("vi-VN");
  const event = (new_status, changed_at, reason = null) => ({ new_status, changed_at, reason });
  const stagesByKey = (application, history) => {
    const timeline = buildApplicationTimeline(application, history);
    return { timeline, stages: Object.fromEntries(timeline.stages.map((stage) => [stage.key, stage])) };
  };

  const appliedAt = "2026-01-01T08:00:00Z";
  const screeningAt = "2026-01-02T08:00:00Z";
  const interviewAt = "2026-01-03T08:00:00Z";
  const offerAt = "2026-01-04T08:00:00Z";
  const resultAt = "2026-01-05T08:00:00Z";

  let view = stagesByKey(
    { status: "interview", created_at: "2025-12-31T08:00:00Z" },
    [event("applied", appliedAt), event("screening", screeningAt), event("interview", interviewAt)]
  );
  assert.equal(view.stages.applied.date, date(appliedAt));
  assert.equal(view.stages.screening.date, date(screeningAt));
  assert.equal(view.stages.interview.date, date(interviewAt));
  assert.equal(view.stages.offer.date, "Chưa có thông tin");

  view = stagesByKey(
    { status: "rejected", created_at: appliedAt },
    [event("screening", screeningAt), event("interview", interviewAt), event("rejected", resultAt, "Thiếu kinh nghiệm thực tế")]
  );
  assert.equal(view.stages.applied.date, date(appliedAt));
  assert.equal(view.stages.offer, undefined);
  assert.deepEqual(
    view.timeline.stages.map((stage) => stage.key),
    ["applied", "screening", "interview", "result"]
  );
  assert.equal(view.stages.result.result, "Không phù hợp");
  assert.equal(view.stages.result.date, date(resultAt));
  assert.equal(view.timeline.rejectionReason, "Thiếu kinh nghiệm thực tế");

  view = stagesByKey(
    { status: "hired", created_at: appliedAt },
    [
      event("applied", appliedAt),
      event("screening", screeningAt),
      event("interview", interviewAt),
      event("offer", offerAt),
      event("hired", resultAt),
    ]
  );
  assert.equal(view.stages.offer.date, date(offerAt));
  assert.equal(view.stages.result.result, "Đã tuyển");
  assert.equal(view.stages.result.date, date(resultAt));
  assert.equal(view.timeline.rejectionReason, null);

  const legacyApplication = { status: "screening", created_at: appliedAt };
  const legacyHistory = [event("screening", screeningAt)];
  const firstRender = buildApplicationTimeline(legacyApplication, legacyHistory);
  const refreshedRender = buildApplicationTimeline(legacyApplication, legacyHistory);
  assert.deepEqual(refreshedRender, firstRender);
  assert.equal(firstRender.stages[0].date, date(appliedAt));
  assert.equal(firstRender.stages[2].date, "Chưa có thông tin");
} finally {
  await server.close();
}

console.log("application timeline: 8 assertions groups passed");
