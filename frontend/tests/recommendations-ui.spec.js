import { test, expect } from "@playwright/test";

const candidate = {
  id: 7,
  email: "candidate@example.com",
  full_name: "Nguyễn Minh Anh",
  role: "candidate",
};

const recommendations = [
  {
    job: {
      id: 101,
      title: "Backend Developer",
      company_name: "DataBridge Analytics",
      location: "Hà Nội",
      employment_type: "Full-time",
      description: "Phát triển API và dịch vụ dữ liệu cho nền tảng tuyển dụng thông minh.",
    },
    final_score: 34.47,
    skill_score: 51.25,
    experience_score: 30,
    semantic_score: 42.1,
    missing_skills: [],
    explanation: "",
  },
  {
    job: {
      id: 102,
      title: "DevOps Engineer",
      company_name: "TechNova Solutions",
      location: "TP. Hồ Chí Minh",
      employment_type: "Hybrid",
      description:
        "Xây dựng hạ tầng cloud, tự động hóa quy trình triển khai và duy trì độ ổn định của hệ thống trong môi trường sản xuất.",
    },
    final_score: 41.53,
    skill_score: 62.5,
    experience_score: 40,
    semantic_score: 48.75,
    project_score: 30.25,
    matched_skills: ["Docker", "Git", "Python"],
    missing_skills: ["Kubernetes", "AWS"],
    explanation: "Kinh nghiệm Docker và Python phù hợp với yêu cầu chính.\nCần bổ sung Kubernetes và AWS.",
  },
];

async function authenticateCandidate(page) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem("sra_token", "recommendation-ui-token");
    localStorage.setItem("sra_user", JSON.stringify(user));
  }, { user: candidate });
}

test("candidate recommendations show ranked AI data in a responsive two-column layout", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: candidate });
    if (path === "/api/recommendations") return route.fulfill({ json: recommendations });
    if (path === "/api/notifications") return route.fulfill({ json: [] });
    if (path === "/api/notifications/unread-count") return route.fulfill({ json: { count: 0 } });
    if (path === "/api/jobs/102") return route.fulfill({ json: recommendations[1].job });
    return route.fulfill({ json: [] });
  });
  await authenticateCandidate(page);

  await page.goto("/candidate/recommendations");
  await expect(page).toHaveURL(/\/candidate\/recommendations$/);
  await expect(page.getByRole("heading", { level: 1, name: "Gợi ý việc làm bằng AI" })).toBeVisible();
  await expect(
    page.getByText("Khám phá những công việc phù hợp nhất với CV, kỹ năng và kinh nghiệm của bạn."),
  ).toBeVisible();
  await expect(page.locator(".recommendations-summary")).toContainText("2");
  await expect(page.locator(".recommendations-summary")).toContainText("Xếp hạng theo mức độ phù hợp");
  await expect(page.locator(".site-nav a")).toHaveCount(6);
  await expect(page.locator('.site-nav a[href="/candidate/recommendations"]')).toHaveAttribute("aria-current", "page");

  const cards = page.locator(".recommendation-card");
  await expect(cards).toHaveCount(2);
  expect(await cards.evaluateAll((items) => items.map((item) => item.getAttribute("data-testid")))).toEqual([
    "recommendation-card-102",
    "recommendation-card-101",
  ]);
  const desktopPositions = await cards.evaluateAll((items) =>
    items.map((item) => ({ x: item.getBoundingClientRect().x, y: item.getBoundingClientRect().y })),
  );
  expect(desktopPositions[0].y).toBe(desktopPositions[1].y);
  expect(desktopPositions[0].x).not.toBe(desktopPositions[1].x);

  const topCard = page.getByTestId("recommendation-card-102");
  await expect(topCard).toContainText("DevOps Engineer");
  await expect(topCard).toContainText("TechNova Solutions");
  await expect(topCard).toContainText("TP. Hồ Chí Minh");
  await expect(topCard).toContainText("Hybrid");
  await expect(topCard.locator(".recommendation-match-score strong")).toHaveText("41.53%");
  await expect(topCard.getByRole("progressbar", { name: "Mức độ phù hợp với DevOps Engineer" })).toHaveAttribute(
    "aria-valuenow",
    "41.53",
  );
  await expect(topCard.locator(".recommendation-score-track > span")).toHaveAttribute("style", "width: 41.53%;");
  await expect(topCard.locator(".recommendation-description")).toHaveCSS("-webkit-line-clamp", "3");
  for (const skill of ["Docker", "Git", "Python", "Kubernetes", "AWS"]) {
    await expect(topCard.getByText(skill, { exact: true })).toBeVisible();
  }
  for (const value of ["62.5%", "40%", "48.75%", "30.25%"]) {
    await expect(topCard.getByText(value, { exact: true })).toBeVisible();
  }

  const lowerCard = page.getByTestId("recommendation-card-101");
  await expect(lowerCard.locator(".recommendation-matched-skills")).toHaveCount(0);
  await expect(lowerCard).toContainText("Không có kỹ năng cần bổ sung trong kết quả AI.");
  await expect(lowerCard.locator(".recommendation-score-row")).toHaveCount(3);
  await expect(lowerCard.locator(".recommendation-explanation")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("recommendations-desktop.png"), fullPage: true });

  const explanation = topCard.locator(".recommendation-explanation");
  expect(await explanation.evaluate((element) => element.open)).toBeFalsy();
  await explanation.getByText("Xem giải thích chi tiết từ AI", { exact: true }).click();
  expect(await explanation.evaluate((element) => element.open)).toBeTruthy();
  await expect(explanation).toContainText("Kinh nghiệm Docker và Python phù hợp với yêu cầu chính.");

  const detailLink = topCard.getByRole("link", { name: "Xem chi tiết công việc" });
  await expect(detailLink).toHaveAttribute("href", "/jobs/102");
  await detailLink.click();
  await expect(page).toHaveURL(/\/jobs\/102$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/candidate/recommendations");
  await expect(cards).toHaveCount(2);
  const mobilePositions = await cards.evaluateAll((items) =>
    items.map((item) => ({ x: item.getBoundingClientRect().x, y: item.getBoundingClientRect().y })),
  );
  expect(new Set(mobilePositions.map((item) => Math.round(item.x))).size).toBe(1);
  expect(mobilePositions[1].y).toBeGreaterThan(mobilePositions[0].y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("recommendations-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("recommendations preserve loading, empty and error states without fake jobs", async ({ page }) => {
  let mode = "loading";
  let releaseRecommendations;
  const pendingRecommendations = new Promise((resolve) => {
    releaseRecommendations = resolve;
  });

  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: candidate });
    if (path === "/api/notifications") return route.fulfill({ json: [] });
    if (path === "/api/notifications/unread-count") return route.fulfill({ json: { count: 0 } });
    if (path === "/api/recommendations") {
      if (mode === "loading") {
        await pendingRecommendations;
        return route.fulfill({ json: [] });
      }
      return route.fulfill({ status: 503, json: { detail: "Không thể tải gợi ý lúc này." } });
    }
    return route.fulfill({ json: [] });
  });
  await authenticateCandidate(page);

  await page.goto("/candidate/recommendations");
  await expect(page.getByText("Đang tải...", { exact: true })).toBeVisible();
  releaseRecommendations();
  await expect(page.getByText("Chưa có gợi ý — hãy tải CV lên để nhận đề xuất từ AI.", { exact: true })).toBeVisible();
  await expect(page.locator(".recommendation-card")).toHaveCount(0);
  await expect(page.locator(".recommendations-summary")).toContainText("0");

  mode = "error";
  await page.reload();
  await expect(page.getByText("Không thể tải gợi ý lúc này.", { exact: true })).toBeVisible();
  await expect(page.locator(".recommendation-card")).toHaveCount(0);
  await expect(page.locator(".recommendations-summary")).toHaveCount(0);
});
