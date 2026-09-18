import { expect, test } from '@playwright/test';

// Invalid requests are rejected before Auth/service calls and create no fixtures.
test('subscription rejects malformed shapes and lengths at the HTTP boundary', async ({ request }) => {
  for (const body of ['null','[]','{}','"email"','{',JSON.stringify({email:'a'.repeat(65)+'@example.com',locale:'en',source:'landing'}),JSON.stringify({email:'Kate@example.com',locale:'en',source:'landing'}),JSON.stringify({email:'a@x.com',locale:['en'],source:'landing'}),JSON.stringify({email:'a@x.com',locale:'en',source:{}})]) {
    const response=await request.post('/api/email/subscribe',{headers:{Authorization:'Bearer invalid', 'Content-Type':'application/json'},data:body});
    expect(response.status(),body).toBe(400);
  }
  const oversized=await request.post('/api/email/subscribe',{headers:{Authorization:'Bearer invalid'},data:' '.repeat(16385)});
  expect(oversized.status()).toBe(413);
});

test('unsubscribe rejects malformed tokens without touching subscription state',async({request})=>{
  for(const token of [null,[],{},'short','A'.repeat(44),'A'.repeat(42)+'B']) {
    const response=await request.post('/api/unsubscribe',{data:{token}});
    expect(await response.json()).toEqual({status:'invalid_token'});
  }
  expect((await request.post('/api/unsubscribe/one-click?token=invalid')).status()).toBe(400);
});
