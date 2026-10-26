import { test, expect } from "@playwright/test";

const admin = {
  id: 1,
  email: "admin@smartrecruit.ai",
  full_name: "System Admin",
  role: "admin",
};

const initialUsers = [
  { ...admin, is_active: true },
  ...Array.from({ length: 22 }, (_, index) => {
    const id = index + 2;
    return {
      id,
      email: `user${String(id).padStart(2, "0")}@example.com`,
      full_name: `Người dùng ${String(id).padStart(2, "0")}`,
      role: id % 4 === 0 ? "recruiter" : "candidate",
      is_active: id % 5 !== 0,
    };
  }),
];

async function signInAsAdmin(page) {
  await page.addInitScript(({ user }) => {
    localStorage.setItem("sra_token", "admin-users-test-token");
    localStorage.setItem("sra_user", JSON.stringify(user));
  }, { user: admin });
}

test("admin users supports filters, pagination and confirmed mutations", async ({ page }, testInfo) => {
  const errors = [];
  const patchCalls = [];
  let users = initialUsers.map((user) => ({ ...user }));
  let releasePatch;

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: admin });
    if (path === "/api/stats/admin") {
      return route.fulfill({
        json: {
          total_users: users.length,
          total_jobs: 0,
          open_jobs: 0,
          total_companies: 0,
          total_applications: 0,
          users_by_role: {},
          applications_by_status: {},
        },
      });
    }
    if (path === "/api/admin/users" && route.request().method() === "GET") {
      return route.fulfill({ json: users });
    }
    const userMatch = path.match(/^\/api\/admin\/users\/(\d+)$/);
    if (userMatch && route.request().method() === "PATCH") {
      const id = Number(userMatch[1]);
      const payload = route.request().postDataJSON();
      patchCalls.push({ id, payload });
      await new Promise((resolve) => {
        releasePatch = resolve;
      });
      users = users.map((user) => (user.id === id ? { ...user, ...payload } : user));
      return route.fulfill({ json: users.find((user) => user.id === id) });
    }
    return route.fulfill({ json: [] });
  });
  await signInAsAdmin(page);

  await page.goto("/admin/dashboard");
  await page.locator(".admin-nav").getByRole("link", { name: "Người dùng", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Quản lý người dùng" })).toBeVisible();
  await expect(page.getByText("Theo dõi tài khoản, vai trò và trạng thái hoạt động trên hệ thống.")).toBeVisible();
  await expect(page.locator(".admin-users-table tbody tr")).toHaveCount(10);
  await expect(page.getByText("Hiển thị 1–10 / 23 tài khoản")).toBeVisible();

  const currentUserRow = page.getByTestId("admin-user-1");
  await expect(currentUserRow.getByRole("combobox")).toBeDisabled();
  await expect(currentUserRow.getByText("Tài khoản hiện tại")).toBeVisible();
  await expect(currentUserRow.getByRole("button")).toHaveCount(0);

  await page.getByRole("button", { name: "Tiếp theo" }).click();
  await expect(page.getByText("Hiển thị 11–20 / 23 tài khoản")).toBeVisible();
  await page.getByRole("searchbox", { name: "Tìm kiếm người dùng" }).fill("user22@example.com");
  await expect(page.getByText("Hiển thị 1–1 / 1 tài khoản")).toBeVisible();
  await expect(page.getByText("Người dùng 22", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
  await page.getByRole("combobox", { name: "Lọc theo vai trò" }).selectOption("recruiter");
  await expect(page.locator(".admin-users-table tbody tr")).toHaveCount(5);
  await expect(page.getByText("Hiển thị 1–5 / 5 tài khoản")).toBeVisible();
  await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
  await page.getByRole("combobox", { name: "Lọc theo trạng thái" }).selectOption("locked");
  await expect(page.locator(".admin-users-table tbody tr")).toHaveCount(4);
  await expect(page.getByText("Hiển thị 1–4 / 4 tài khoản")).toBeVisible();
  await page.getByRole("button", { name: "Xóa bộ lọc" }).click();

  const userRow = page.getByTestId("admin-user-2");
  const roleSelect = userRow.getByRole("combobox");
  await roleSelect.selectOption("recruiter");
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Xác nhận đổi vai trò" })).toBeVisible();
  await expect(dialog).toContainText("Ứng viên");
  await expect(dialog).toContainText("Nhà tuyển dụng");
  await dialog.getByRole("button", { name: "Hủy" }).click();
  expect(patchCalls).toEqual([]);
  await expect(roleSelect).toHaveValue("candidate");

  await roleSelect.selectOption("recruiter");
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Xác nhận đổi vai trò" }).click();
  await expect(dialog.getByRole("button", { name: "Đang xử lý..." })).toBeDisabled();
  await expect(roleSelect).toHaveValue("candidate");
  expect(patchCalls).toEqual([{ id: 2, payload: { role: "recruiter" } }]);
  releasePatch();
  await expect(dialog).toHaveCount(0);
  await expect(userRow.getByRole("combobox")).toHaveValue("recruiter");

  await userRow.getByRole("button", { name: "Khóa", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("có thể không đăng nhập được");
  await dialog.getByRole("button", { name: "Hủy" }).click();
  expect(patchCalls).toHaveLength(1);
  await expect(userRow.getByRole("button", { name: "Khóa", exact: true })).toBeVisible();

  await userRow.getByRole("button", { name: "Khóa", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Khóa tài khoản" }).click();
  await expect(dialog.getByRole("button", { name: "Đang xử lý..." })).toBeDisabled();
  await expect(userRow.getByRole("button", { name: "Khóa", exact: true })).toBeVisible();
  expect(patchCalls[1]).toEqual({ id: 2, payload: { is_active: false } });
  releasePatch();
  await expect(dialog).toHaveCount(0);
  await expect(userRow.getByRole("button", { name: "Mở khóa", exact: true })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("admin-users-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("admin-user-2")).toHaveCSS("display", "block");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("admin-users-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("admin users shows an API loading failure without exposing stale data", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: admin });
    if (path === "/api/stats/admin") {
      return route.fulfill({ json: { total_users: 0, total_jobs: 0, total_companies: 0, total_applications: 0 } });
    }
    if (path === "/api/admin/users") {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return route.fulfill({ status: 503, json: { detail: "Không thể tải danh sách người dùng." } });
    }
    return route.fulfill({ json: [] });
  });
  await signInAsAdmin(page);

  await page.goto("/admin/dashboard");
  await page.locator(".admin-nav").getByRole("link", { name: "Người dùng", exact: true }).click();
  await expect(page.locator(".admin-users-loading")).toBeVisible();
  await expect(page.getByText("Không thể tải danh sách người dùng.")).toBeVisible();
  await expect(page.locator(".admin-users-table")).toHaveCount(0);
});

test("a failed user mutation stays in the dialog and keeps server data unchanged", async ({ page }) => {
  const users = [initialUsers[0], initialUsers[1]];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: admin });
    if (path === "/api/stats/admin") {
      return route.fulfill({ json: { total_users: users.length, total_jobs: 0, total_companies: 0, total_applications: 0 } });
    }
    if (path === "/api/admin/users" && route.request().method() === "GET") {
      return route.fulfill({ json: users });
    }
    if (path === "/api/admin/users/2" && route.request().method() === "PATCH") {
      return route.fulfill({ status: 403, json: { detail: "Thao tác này không được phép." } });
    }
    return route.fulfill({ json: [] });
  });
  await signInAsAdmin(page);

  await page.goto("/admin/dashboard");
  await page.locator(".admin-nav").getByRole("link", { name: "Người dùng", exact: true }).click();
  const roleSelect = page.getByTestId("admin-user-2").getByRole("combobox");
  await roleSelect.selectOption("recruiter");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Xác nhận đổi vai trò" }).click();
  await expect(dialog.getByText("Thao tác này không được phép.")).toBeVisible();
  await expect(roleSelect).toHaveValue("candidate");
  await expect(dialog.getByRole("button", { name: "Xác nhận đổi vai trò" })).toBeEnabled();
});
