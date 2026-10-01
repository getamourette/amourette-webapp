import { test, expect } from '@playwright/test';
import { mockNameUi, nameUiState, nameIds } from '../helpers/name-ui-fixture';
import { loadDraft, saveDraft } from '../../app/profile/draft';
import { MATCHING_CONSENT_WORDING, purgeStoredMatchingAnswers } from '../../lib/matching-consent';
import { matchingConsentStrings } from '../../lib/matching-consent-strings';

test('drafts never persist matching answers or restore historic agreement', () => {
  const records = new Map<string,string>();
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable:true, value:{localStorage:{
    getItem:(key:string)=>records.get(key)??null,setItem:(key:string,value:string)=>records.set(key,value),
    get length(){return records.size;},key:(index:number)=>[...records.keys()][index]??null,removeItem:(key:string)=>records.delete(key),
  }} });
  try {
    const draft={firstName:'Alice',bio:'Hello',gender:'woman' as const,interestedIn:['man' as const],adultConfirmed:true,step:5};
    saveDraft(nameIds.alice,draft);
    const saved=JSON.parse(records.get(`amourette-onboarding-draft:${nameIds.alice}`)!);
    expect(saved).toEqual({firstName:'Alice',bio:'Hello',adultConfirmed:true,step:2});
    records.set(`amourette-onboarding-draft:${nameIds.alice}`,JSON.stringify({...draft,matchingConsent:true}));
    expect(loadDraft(nameIds.alice)).toMatchObject({gender:'',interestedIn:[]});
    expect(JSON.parse(records.get(`amourette-onboarding-draft:${nameIds.alice}`)!)).toEqual(saved);
    records.set(`amourette-onboarding-draft:${nameIds.bob}`,JSON.stringify({...draft,matchingConsent:true}));
    records.set('unrelated','keep');purgeStoredMatchingAnswers();
    expect(JSON.parse(records.get(`amourette-onboarding-draft:${nameIds.bob}`)!)).toEqual(saved);
    expect(records.get('unrelated')).toBe('keep');
  } finally {
    if(windowDescriptor)Object.defineProperty(globalThis,'window',windowDescriptor);
    else Reflect.deleteProperty(globalThis,'window');
  }
});

test('final onboarding requires two separate confirmations and an information link never grants consent',async({context,page})=>{
  await mockNameUi(context,nameUiState());
  await context.route('**/rest/v1/profiles?*',route=>route.fulfill({json:null}));
  const writes:Record<string,unknown>[]=[];
  await page.route('**/api/profile-photo/upload',route=>{
    writes.push(route.request().postDataJSON());
    return route.fulfill({status:503,json:{error:'synthetic_upload_unavailable'}});
  });
  await page.setViewportSize({width:320,height:740});
  await page.goto('/profile');
  const next=page.getByRole('button',{name:'Continue',exact:true});
  await page.getByPlaceholder('First name',{exact:true}).fill('Alice');await next.click();
  await page.locator('input[type=file]').setInputFiles({name:'synthetic.png',mimeType:'image/png',
    buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=','base64')});
  await page.getByRole('dialog',{name:'Crop your photo'}).getByRole('button',{name:'Confirm crop',exact:true}).click();
  await page.getByRole('group',{name:'I am',exact:true}).getByRole('button',{name:'Woman',exact:true}).click();await next.click();
  await page.getByRole('group',{name:'I’d like to meet',exact:true}).getByRole('button',{name:'Man',exact:true}).click();await next.click();await next.click();
  const join=page.getByRole('button',{name:'Join tonight',exact:true});
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  for (const locale of ['en','fr','es'] as const) {
    await page.evaluate(value => {
      localStorage.setItem('amourette-locale', value);
      window.dispatchEvent(new Event('amourette-locale-change'));
    }, locale);
    await expect(page.getByRole('checkbox',{name:MATCHING_CONSENT_WORDING[locale]})).toBeVisible();
    for (const viewport of [{width:320,height:568},{width:320,height:740},{width:393,height:851}]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.getByTestId('onboarding-confirmation').evaluate(element => {
        const labels = [...element.querySelectorAll('input[type="checkbox"]')].map(input => {
          const label = input.closest('label')!;
          const style = getComputedStyle(label), checkStyle = getComputedStyle(input);
          return {background:style.backgroundColor,border:style.borderColor,padding:style.padding,
            font:style.fontSize,lineHeight:style.lineHeight,accent:checkStyle.accentColor,
            width:checkStyle.width,height:checkStyle.height,labelHeight:label.getBoundingClientRect().height};
        });
        const button = element.querySelector('button.night-button-primary')!.getBoundingClientRect();
        const preview = element.querySelector('[data-testid="feed-photo-preview"]')!.getBoundingClientRect();
        return {labels,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,
          height:window.innerHeight,width:window.innerWidth,buttonBottom:button.bottom,previewWidth:preview.width,previewHeight:preview.height};
      });
      expect(geometry.scrollHeight, `${locale} at ${viewport.width}×${viewport.height}: no page scroll`).toBeLessThanOrEqual(geometry.height + 1);
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
      expect(geometry.buttonBottom).toBeLessThanOrEqual(geometry.height);
      for (const label of geometry.labels) expect(label.labelHeight).toBeGreaterThanOrEqual(44);
      const styles = geometry.labels.map(label => Object.fromEntries(
        Object.entries(label).filter(([key]) => key !== 'labelHeight'),
      ));
      expect(styles[1]).toEqual(styles[0]);
      expect(geometry.previewWidth).toBeGreaterThan(0);
      expect(geometry.previewHeight / geometry.previewWidth).toBeCloseTo(19.5 / 9, 1);
      await expect(page.getByRole('checkbox',{name:MATCHING_CONSENT_WORDING[locale]})).not.toBeChecked();
      if(viewport.height===740)await page.screenshot({path:test.info().outputPath(`onboarding-consent-${locale}-320.png`),fullPage:true});
    }
  }
  await page.evaluate(() => {
    localStorage.setItem('amourette-locale','en');
    window.dispatchEvent(new Event('amourette-locale-change'));
  });
  await page.setViewportSize({width:320,height:740});
  await page.getByRole('checkbox',{name:'I confirm that I am 18 or older.'}).check();
  await expect(join).toBeDisabled();
  await page.getByRole('button',{name:'How we use these details'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:MATCHING_CONSENT_WORDING.en})).not.toBeChecked();
  expect(writes).toHaveLength(0);
  const draft=await page.evaluate(id=>JSON.parse(localStorage.getItem(`amourette-onboarding-draft:${id}`)!),nameIds.alice);
  expect(draft).not.toHaveProperty('gender');expect(draft).not.toHaveProperty('interestedIn');expect(draft).not.toHaveProperty('matchingConsent');
  await page.getByRole('checkbox',{name:MATCHING_CONSENT_WORDING.en}).check();
  await page.screenshot({path:test.info().outputPath('onboarding-consent-320.png'),fullPage:true});
  await join.click();
  await expect.poll(()=>writes.length).toBe(1);
  expect(writes[0].profile).toMatchObject({matching_consent:true,matching_consent_version:'matching-v1-draft',matching_consent_locale:'en'});
  await page.reload();
  await expect(page.getByRole('group',{name:'I am',exact:true})).toBeVisible();
  await expect(page.getByRole('group',{name:'I am',exact:true}).getByRole('button',{pressed:true})).toHaveCount(0);
});

for(const locale of ['en','fr','es'] as const) {
  test(`withdrawal, live-session refresh and fresh agreement at 320px (${locale})`, async ({ context,page }) => {
    await mockNameUi(context,nameUiState());
    await context.addInitScript(value=>localStorage.setItem('amourette-locale',value),locale);
    let state={active:true,revision:crypto.randomUUID(),granted_at:new Date().toISOString(),withdrawn_at:null as string|null,
      available_at:null as string|null,server_now:new Date().toISOString()};
    const writes:Record<string,unknown>[]=[];
    await context.route('**/rest/v1/rpc/*matching_consent',async route=>{
      const name=route.request().url().split('/').at(-1);
      if(name==='get_my_matching_consent')return route.fulfill({json:state});
      const body=route.request().postDataJSON();writes.push(body);
      if(name==='withdraw_my_matching_consent')state={...state,active:false,revision:crypto.randomUUID(),withdrawn_at:new Date().toISOString()};
      else state={...state,active:true,revision:body.p_request_id,withdrawn_at:null,granted_at:new Date().toISOString()};
      return route.fulfill({json:{status:'saved',...state}});
    });
    const s=matchingConsentStrings[locale];
    await page.setViewportSize({width:320,height:740});
    await page.goto('/profile?edit=1');
    await expect(page.getByText(s.active,{exact:true})).toBeVisible();
    await page.getByRole('button',{name:s.withdraw,exact:true}).click();
    const dialog=page.getByRole('alertdialog',{name:s.confirm});
    await expect(dialog).toContainText(s.effect);
    await expect(dialog.getByRole('button',{name:s.cancel})).toBeFocused();
    await dialog.getByRole('button',{name:s.cancel}).click();
    expect(writes).toHaveLength(0);
    await page.getByRole('button',{name:s.withdraw,exact:true}).click();
    await dialog.getByRole('button',{name:s.withdraw,exact:true}).click();
    await expect(page.getByText(s.inactive,{exact:true})).toBeVisible();
    await expect(page.getByRole('checkbox',{name:MATCHING_CONSENT_WORDING[locale]})).not.toBeChecked();
    await expect(page.getByRole('button',{name:s.grant})).toBeDisabled();
    await page.getByRole('button',{name:s.info}).click();
    await expect(page.getByRole('dialog')).toContainText(s.draft);
    await page.getByRole('button',{name:s.close,exact:true}).click();
    await expect(page.getByRole('checkbox')).not.toBeChecked();
    await page.getByRole('group').nth(0).getByRole('button').nth(0).click();
    await page.getByRole('group').nth(1).getByRole('button').nth(1).click();
    await page.getByRole('checkbox').check();
    await page.screenshot({path:test.info().outputPath(`consent-return-${locale}-320.png`),fullPage:true});
    await page.getByRole('button',{name:s.grant}).click();
    await expect(page.getByText(s.active,{exact:true})).toBeVisible();
    expect(writes[1]).toMatchObject({p_consent:true,p_locale:locale,p_gender:'woman',p_interested_in:['man']});
    expect(await page.locator('body').evaluate(el=>el.scrollWidth)).toBe(320);
    // Another active session has withdrawn. Existing preference UI and its draft
    // disappear on the same invalidation used by current and #282 clients.
    state={...state,active:false,revision:crypto.randomUUID(),withdrawn_at:new Date().toISOString()};
    await page.evaluate(()=>window.dispatchEvent(new Event('amourette-photo-refresh')));
    await expect(page.getByText(s.inactive,{exact:true})).toBeVisible();
    await expect(page.getByRole('checkbox')).not.toBeChecked();
    await expect(page.getByRole('button',{name:s.grant})).toBeDisabled();
  });
}

test('withdrawal remains available during cooldown; read failure cannot pretend it succeeded',async({context,page})=>{
  await mockNameUi(context,nameUiState());
  let failed=false,active=true;
  const state={active:true,revision:crypto.randomUUID(),granted_at:new Date().toISOString(),withdrawn_at:null,
    available_at:new Date(Date.now()+43200000).toISOString(),server_now:new Date().toISOString()};
  await context.route('**/rest/v1/rpc/*matching_consent',async route=>{
    if(route.request().url().endsWith('withdraw_my_matching_consent')){failed=true;return route.fulfill({status:503,json:{message:'Synthetic offline'}});}
    return failed?route.fulfill({status:503,json:{message:'Synthetic offline'}}):route.fulfill({json:{...state,active,withdrawn_at:active?null:new Date().toISOString()}});
  });
  await page.goto('/profile?edit=1');
  const withdraw=page.getByRole('button',{name:'Withdraw my agreement',exact:true});
  await expect(withdraw).toBeEnabled();await withdraw.click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Withdraw my agreement'}).click();
  await expect(page.getByText(matchingConsentStrings.en.error)).toBeVisible();
  await expect(page.getByText(matchingConsentStrings.en.inactive)).toHaveCount(0);
  failed=false;active=false;
  await page.getByRole('button',{name:'Check again',exact:true}).click();
  await expect(page.getByText(matchingConsentStrings.en.inactive)).toBeVisible();
  await expect(page.getByRole('button',{name:'Agree and enable matching'})).toBeDisabled();
});

test('confirmed withdrawal erases the preference draft even when revalidation fails', async ({ context, page }) => {
  await mockNameUi(context, nameUiState());
  await context.addInitScript(() => {
    Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
    Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined });
  });
  const now = new Date().toISOString();
  let withdrawn = false, fail = true;
  const state = { active: true, revision: crypto.randomUUID(), granted_at: now,
    withdrawn_at: null as string | null, available_at: null, server_now: now };
  await context.route('**/rest/v1/rpc/*matching_consent', route => {
    if (route.request().url().endsWith('withdraw_my_matching_consent')) {
      withdrawn = true;
      Object.assign(state, { active: false, revision: crypto.randomUUID(), withdrawn_at: now });
      return route.fulfill({ json: { status: 'saved', ...state } });
    }
    if (withdrawn && fail) return route.fulfill({ status: 503, json: { message: 'Synthetic read failure' } });
    return route.fulfill({ json: state });
  });
  await page.goto('/profile?edit=1');
  const editor = page.locator('section[aria-labelledby="profile-preferences-heading"]');
  await expect(editor).toBeVisible();
  await editor.getByRole('group', { name: 'I’d like to meet', exact: true }).getByRole('button', { name: 'Woman', exact: true }).click();
  await page.getByRole('button', { name: matchingConsentStrings.en.withdraw, exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: matchingConsentStrings.en.withdraw, exact: true }).click();
  await expect(page.getByText(matchingConsentStrings.en.inactive, { exact: true })).toBeVisible();
  await expect(editor).toHaveCount(0);
  await expect(page.getByText(matchingConsentStrings.en.active, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check again', exact: true })).toBeVisible();
  await expect(page.getByRole('group').getByRole('button', { pressed: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByRole('button', { name: matchingConsentStrings.en.grant })).toBeDisabled();
  fail = false;
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(page.getByRole('group').first().getByRole('button').first()).toBeEnabled();
  await expect(page.getByRole('group').getByRole('button', { pressed: true })).toHaveCount(0);
});

test('consent read timeout remains retryable without AbortSignal composition APIs', async ({ context, page }) => {
  await mockNameUi(context, nameUiState());
  await context.addInitScript(() => {
    Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
    Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined });
  });
  const now = new Date().toISOString();
  let hold = true, reads = 0;
  let release: (() => void) | undefined;
  await context.route('**/rest/v1/rpc/get_my_matching_consent', async route => {
    reads++;
    if (hold) await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { active: true, revision: nameIds.alice, granted_at: now,
      withdrawn_at: null, available_at: null, server_now: now } });
  });
  await page.clock.install();
  await page.goto('/profile?edit=1');
  await expect.poll(() => reads).toBe(1);
  await page.clock.fastForward(15_000);
  await expect(page.getByRole('button', { name: 'Check again', exact: true })).toBeVisible();
  await expect(page.getByText(matchingConsentStrings.en.active, { exact: true })).toHaveCount(0);
  hold = false; release!();
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(page.getByText(matchingConsentStrings.en.active, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: matchingConsentStrings.en.withdraw, exact: true })).toBeEnabled();
});
