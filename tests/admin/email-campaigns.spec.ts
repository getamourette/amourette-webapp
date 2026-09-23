import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { CAMPAIGN_PREFERENCE_URL, type Campaign, type CampaignNight } from '../../lib/email-campaigns';

// Isolated UI contract tests. All Auth, database and campaign requests are intercepted;
// no fixture creation, shared database changes, provider requests or real mail.
const night: CampaignNight = { id:'00000000-0000-0000-0000-000000000010',venue_id:'00000000-0000-0000-0000-000000000009',name:'Le Très Long Nom du Bar Amourette',city:'Paris',timezone:'Europe/Paris',waiting_opens_at:'2030-10-26T19:00:00Z',guaranteed_launch_at:'2030-10-26T20:00:00Z',closes_at:'2030-10-27T02:00:00Z' };
const audience={eligible:3,en:1,fr:1,es:1,frequency:2,suppressed:1};
async function setup(page: Page, enabled = true, empty = false) {
  const {en,fr,es}=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','scripts/render-campaign-test-fixture.mjs'],{input:JSON.stringify({nights:[night],preferencesUrl:CAMPAIGN_PREFERENCE_URL}),encoding:'utf8'}));
  let campaign: Campaign | null=null;
  let confirmed=0;
  let refuse=false;
  let retries=0;
  await page.route('**/auth/v1/**',async route=>{
    if(route.request().url().includes('/token')) await route.fulfill({json:{access_token:'isolated-token',refresh_token:'isolated-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:'00000000-0000-0000-0000-000000000001',aud:'authenticated',role:'authenticated',email:'founder@example.invalid',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}}});
    else await route.fulfill({json:{}});
  });
  await page.route('**/rest/v1/**',async route=>{
    if(route.request().url().includes('/rpc/am_i_admin')) await route.fulfill({json:route.request().headers().authorization==='Bearer isolated-token'});
    else await route.fulfill({json:[]});
  });
  await page.route('**/api/admin/email-campaigns**',async route=>{
    if(route.request().method()==='GET') return route.fulfill({json:{nights:empty?[]:[night],campaigns:campaign?[campaign]:[],hasMore:false,sendingEnabled:enabled}});
    const command=route.request().postDataJSON();
    if(command.action==='preview') campaign={id:'00000000-0000-0000-0000-000000000020',created_at:new Date().toISOString(),confirmed_at:null,nights:[night],messages:{en,fr,es},counts:{queued:0,sending:0,sent:0,delivered:0,skipped:0,failed:0,unknown:0}};
    if(command.action==='retry') { retries++; return route.fulfill({json:{retried:1}}); }
    if(command.action==='confirm') {
      if(refuse) return route.fulfill({status:409,json:{error:'audience_changed'}});
      confirmed++;
      campaign={...campaign!,confirmed_at:new Date().toISOString(),counts:{queued:3,sending:0,sent:0,delivered:0,skipped:0,failed:0,unknown:0}};
      return route.fulfill({json:campaign});
    }
    return route.fulfill({json:{campaign,audience}});
  });
  await page.goto('/admin');
  await page.getByLabel('Email',{exact:true}).fill('founder@example.invalid');
  await page.getByLabel('Password',{exact:true}).fill('isolated-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:/Email.*Invite|Invite.*Email/}).click();
  return { confirms:()=>confirmed, retries:()=>retries, refuse:()=>{refuse=true;}, outcomes:(failed:number)=>{ if(campaign) campaign={...campaign,confirmed_at:new Date().toISOString(),counts:{queued:0,sending:0,sent:1,delivered:0,skipped:0,failed,unknown:1}}; } };
}

test('campaign selection, three actual templates, text preview and irreversible confirmation',async({page})=>{
  const state=await setup(page);
  await expect(page.getByRole('button',{name:'Create preview'})).toBeDisabled();
  await page.getByRole('checkbox',{name:/Le Très Long/}).check();
  await page.getByRole('button',{name:'Create preview'}).click();
  await expect(page.getByText('3 eligible · EN 1 · FR 1 · ES 1')).toBeVisible();
  await page.getByRole('button',{name:'FR',exact:true}).click();
  await expect(page.getByText('Votre prochaine soirée Amourette',{exact:false})).toBeVisible();
  await expect(page.frameLocator('iframe').getByText('On se retrouve au bar.')).toBeVisible();
  await page.getByRole('button',{name:'ES',exact:true}).click();
  await expect(page.frameLocator('iframe').getByText('Nos vemos en el bar.')).toBeVisible();
  await page.locator('iframe').scrollIntoViewIfNeeded();
  await page.locator('iframe').screenshot({path:test.info().outputPath('campaign-email-frame.png')});
  await page.screenshot({path:test.info().outputPath('campaign-preview.png'),fullPage:true});
  await page.getByRole('button',{name:'Show plain text'}).click();
  await expect(page.locator('pre')).toContainText('Paris');
  await page.getByRole('button',{name:'Review send'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox')).toBeFocused();
  await page.screenshot({path:test.info().outputPath('campaign-confirmation.png')});
  await expect(dialog.getByRole('button',{name:'Send to 3 subscribers'})).toBeDisabled();
  await dialog.getByRole('button',{name:'Cancel'}).click();
  expect(state.confirms()).toBe(0);
  await page.getByRole('button',{name:'Review send'}).click();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button',{name:'Send to 3 subscribers'}).click();
  await expect(page.getByRole('status')).toContainText('Campaign queued');
  expect(state.confirms()).toBe(1);
  await expect(page.getByRole('button',{name:'Review send'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('a changed audience refuses sending and preserves the draft',async({page})=>{
  const state=await setup(page);state.refuse();
  await page.getByRole('checkbox',{name:/Le Très Long/}).check();
  await page.getByRole('button',{name:'Create preview'}).click();
  await page.getByRole('button',{name:'Review send'}).click();
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('button',{name:'Send to 3 subscribers'}).click();
  await expect(page.getByRole('region',{name:'Email',exact:true}).getByRole('alert')).toContainText('eligible audience changed');
  await expect(page.getByRole('heading',{name:'Preview and audience'})).toBeVisible();
  await page.screenshot({path:test.info().outputPath('campaign-error.png'),fullPage:true});
  expect(state.confirms()).toBe(0);
});

test('preview environment prevents sending and supports an empty upcoming-night list',async({page})=>{
  await setup(page,false,true);
  await expect(page.getByText(/Preview mode: sending/)).toBeVisible();
  await expect(page.getByText(/No upcoming nights/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Create preview'})).toBeDisabled();
});

test('campaign HTTP endpoints refuse unauthenticated callers',async({request})=>{
  expect((await request.get('/api/admin/email-campaigns')).status()).toBe(401);
  for(const action of ['preview','review','confirm','retry']) expect((await request.post('/api/admin/email-campaigns',{data:{action}})).status()).toBe(401);
});


test('preview mode cannot confirm an otherwise eligible campaign',async({page})=>{
  const state=await setup(page,false);
  await page.getByRole('checkbox',{name:/Le Très Long/}).check();
  await page.getByRole('button',{name:'Create preview'}).click();
  await expect(page.getByText('3 eligible · EN 1 · FR 1 · ES 1')).toBeVisible();
  await expect(page.getByRole('button',{name:'Review send'})).toBeDisabled();
  expect(state.confirms()).toBe(0);
});

test('history retries definite failures with confirmation and offers no unknown resend',async({page})=>{
  const state=await setup(page);
  await page.getByRole('checkbox',{name:/Le Très Long/}).check();
  await page.getByRole('button',{name:'Create preview'}).click();
  await expect(page.getByRole('heading',{name:'Preview and audience'})).toBeVisible();
  state.outcomes(1);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Retry definite failures'}).click();
  await expect(page.getByRole('status')).toContainText('1 definite failures queued for retry');
  expect(state.retries()).toBe(1);
  state.outcomes(0);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry definite failures'})).toHaveCount(0);
  await expect(page.getByText('unknown',{exact:true})).toBeVisible();
});
