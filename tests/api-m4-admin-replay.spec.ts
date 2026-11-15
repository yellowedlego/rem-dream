import { test, expect } from '@playwright/test';

test.describe('Admin auth and replay integration', () => {
  test('admin login returns token', async ({ request }) => {
    const response = await request.post('/api/admin/login', {
      data: { username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASSWORD || 'password' },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('token');
    const token = body.token;
    // logout using token cookie
    const logoutRes = await request.post('/api/admin/logout', {
      headers: { Cookie: `admin_token=${token}` },
    });
    expect(logoutRes.ok()).toBeTruthy();
  });

  test('replay loading returns list of replays', async ({ request }) => {
    const res = await request.get('/api/rem/replay');
    expect(res.ok()).toBeTruthy();
    const list = await res.json();
    expect(Array.isArray(list)).toBeTruthy();
  });
});
