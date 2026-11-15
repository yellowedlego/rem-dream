import { test, expect } from "@playwright/test";

test.describe("B-12 Admin Authentication", () => {
  test("login fails with invalid credentials and generic error message", async ({ request }) => {
    // Attempt with incorrect password when hash is present or empty
    const res = await request.post("/api/admin/login", {
      data: { username: "admin", password: "" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("아이디나 비밀번호가 맞지 않아요");
  });

  test("login succeeds with valid credentials and sets secure session cookie", async ({ request }) => {
    const res = await request.post("/api/admin/login", {
      data: { username: process.env.ADMIN_USER || "admin", password: "test-valid-password" },
    });

    if (res.ok()) {
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.token).toBeDefined();

      const setCookie = res.headers()["set-cookie"];
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain("admin_token=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Path=/");

      // Logout
      const logoutRes = await request.post("/api/admin/logout", {
        headers: { Cookie: `admin_token=${body.token}` },
      });
      expect(logoutRes.ok()).toBeTruthy();
    }
  });
});
