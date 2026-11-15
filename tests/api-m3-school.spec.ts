import { test, expect } from '@playwright/test';

test.describe('School API integration', () => {
  test('anonymize endpoint returns anonymized text', async ({ request }) => {
    const response = await request.post('/api/school/anonymize', {
      data: { text: 'Contact: 010-1234-5678, email@example.com' },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('anonymized');
  });

  test('pool endpoint can store and retrieve meaning', async ({ request }) => {
    // post a meaning
    const postRes = await request.post('/api/school/pool', {
      data: { key: 'testKey', meaning: 'testMeaning' },
    });
    expect(postRes.ok()).toBeTruthy();
    // get the pool list
    const getRes = await request.get('/api/school/pool');
    expect(getRes.ok()).toBeTruthy();
    const list = await getRes.json();
    expect(Array.isArray(list)).toBeTruthy();
    const found = list.find((e: any) => e.key === 'testKey');
    expect(found).toBeDefined();
  });
});
