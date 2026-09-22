// Deterministic browser interaction coverage. SQL/RLS and real concurrency have
// separate executable gates; these transport mocks never reach the shared DB.
import { test, expect } from '@playwright/test';
import { mockNameUi,nameUiState,nameIds } from '../helpers/name-ui-fixture';

test('correction form retains errors, reuses the retry ID, cancels and saves bio separately', async ({ context,page })=>{
  const state=nameUiState();await mockNameUi(context,state);
  await page.setViewportSize({width:320,height:740});
  await page.goto('/profile?edit=1');
  await expect(page.getByTestId('current-first-name')).toHaveText('Alice');
  await page.getByRole('button',{name:'Request a correction'}).click();
  const input=page.getByRole('textbox',{name:'Requested first name'});
  await expect(input).toBeFocused();
  await input.fill(' Alice ');await expect(page.getByRole('button',{name:'Send request'})).toBeDisabled();
  await input.fill('😀'.repeat(31));await expect(page.getByRole('button',{name:'Send request'})).toBeDisabled();
  await input.fill(' Alix ');state.failSubmit=true;
  await page.getByRole('button',{name:'Send request'}).click();
  await expect(page.getByRole('alert')).toContainText('Your text is still here');await expect(input).toHaveValue(' Alix ');
  await page.screenshot({path:test.info().outputPath('profile-error-320.png'),fullPage:true});
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth',320);
  state.failSubmit=false;
  await page.getByRole('button',{name:'Send request'}).click();
  await expect(page.getByTestId('name-correction')).toContainText('Alix · Pending');
  expect(state.submissions[0].p_request_id).toBe(state.submissions[1].p_request_id);
  await expect(page.getByTestId('current-first-name')).toHaveText('Alice');
  await page.getByRole('button',{name:'Cancel request'}).click();
  await expect(page.getByTestId('name-correction')).toContainText('Cancelled');
  await page.getByRole('button',{name:'Request a correction'}).click();
  state.loseSubmitResponse=true;
  await input.fill('Alex');await page.getByRole('button',{name:'Send request'}).click();
  await expect(page.getByRole('alert')).toContainText('Your text is still here');
  await expect(page.getByRole('button',{name:'Send request'})).toBeDisabled();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Cancel request'}).click();
  await expect(page.getByTestId('name-correction')).toContainText('Cancelled');
  state.loseSubmitResponse=false;
  await page.getByRole('button',{name:'Request a correction'}).click();
  await expect(input).toHaveValue('Alex');
  await page.getByRole('button',{name:'Send request'}).click();
  await expect(page.getByTestId('name-correction')).toContainText('Alex · Pending');
  expect(state.submissions.at(-1)!.p_request_id).not.toBe(state.submissions.at(-2)!.p_request_id);
  await page.getByRole('button',{name:'Cancel request'}).click();
  await page.getByRole('button',{name:'Request a correction'}).click();
  await input.fill('Alex');await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Request a correction'})).toBeFocused();
  await page.getByPlaceholder('Bio (optional)').fill('New bio');
  await page.getByRole('button',{name:'Save my bio'}).click();
  await expect.poll(()=>state.patches.length).toBe(1);
  expect(state.patches[0]).toMatchObject({bio:'New bio'});expect(state.patches[0]).not.toHaveProperty('first_name');
});

test('admin inspects the exact request, handles cancellation conflicts and approves',async({context,page})=>{
  const state=nameUiState();
  const id=crypto.randomUUID();state.corrections.push({id,profile_id:nameIds.alice,proposed_name:'Alix',status:'pending',created_at:new Date().toISOString(),resolved_at:null,reviewed_by:null});
  await mockNameUi(context,state,'admin');await page.setViewportSize({width:1280,height:900});
  await page.goto('/admin');await page.getByRole('button',{name:/Moderation/}).click();
  const queue=page.getByTestId('admin-name-corrections');await queue.getByRole('button',{name:/Name corrections/}).click();
  await queue.getByRole('button',{name:/Alice → Alix/}).click();
  await expect(page.getByRole('button',{name:'Close name review'})).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Approve correction'})).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Reject correction'})).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Close name review'})).toBeFocused();
  await page.screenshot({path:test.info().outputPath('admin-review-1280.png'),fullPage:true});
  state.corrections[0].status='cancelled';
  await page.getByRole('button',{name:'Approve correction'}).click();
  await expect(page.getByRole('dialog')).toContainText('This request is now cancelled');
  await expect(page.getByRole('button',{name:'Reject correction'})).toHaveCount(0);
  await page.getByRole('button',{name:'Close name review'}).click();
  state.corrections.push({...state.corrections[0],id:crypto.randomUUID(),status:'pending'});
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await queue.getByRole('button',{name:/Alice → Alix/}).click();
  await page.getByRole('button',{name:'Approve correction'}).click();
  await expect(page.getByRole('dialog')).toContainText('Correction approved.');expect(state.name).toBe('Alix');
});

test('chat notices survive rerenders, deduplicate reloads after failed receipts and refresh after reading',async({context,page})=>{
  const state=nameUiState();await mockNameUi(context,state,'bob');state.failAck=true;
  const id=crypto.randomUUID();state.notices.set(nameIds.match,id);state.name='Alix';
  await page.goto(`/chat/${nameIds.match}`);
  const notice=page.getByTestId('chat-name-notice');await expect(notice).toBeVisible();
  await page.screenshot({path:test.info().outputPath('chat-notice-mobile.png')});
  await expect.poll(()=>state.acknowledgements).toBeGreaterThan(0);
  await page.getByTestId('chat-input').fill('A draft');await expect(notice).toBeVisible();
  await page.getByTestId('chat-profile-open').click();await page.keyboard.press('Escape');await expect(notice).toBeVisible();
  await page.reload();await expect(page.getByTestId('chat-input')).toBeVisible();await expect(notice).toHaveCount(0);
  state.name='Alex';state.bio='Updated bio';state.notices.set(nameIds.match,crypto.randomUUID());state.failAck=false;
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(page.getByTestId('chat-profile-name')).toHaveText('Alex');await expect(notice).toBeVisible();
  await expect.poll(()=>state.seen.get(nameIds.match)).toBe(state.notices.get(nameIds.match));
  await page.reload();await expect(page.getByTestId('chat-input')).toBeVisible();await expect(notice).toHaveCount(0);
  state.bio='A later bio';await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.getByTestId('chat-profile-open').click();await expect(page.getByTestId('chat-profile-dialog')).toContainText('A later bio');
  await page.keyboard.press('Escape');
  state.notices.set(nameIds.secondMatch,state.notices.get(nameIds.match)!);
  await page.goto(`/chat/${nameIds.secondMatch}`);await expect(notice).toBeVisible();
});

test('hidden reads do not consume a notice; visible polling refreshes the profile',async({context,page})=>{
  const state=nameUiState();await mockNameUi(context,state,'bob');state.notices.set(nameIds.match,crypto.randomUUID());
  await page.clock.install();
  await page.addInitScript(()=>Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true}));
  await page.goto(`/chat/${nameIds.match}`);await expect(page.getByTestId('chat-input')).toBeVisible();
  await expect(page.getByTestId('chat-name-notice')).toHaveCount(0);expect(state.acknowledgements).toBe(0);
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.getByTestId('chat-name-notice')).toBeVisible();await expect.poll(()=>state.acknowledgements).toBeGreaterThan(0);
  state.name='Latest';state.notices.set(nameIds.match,crypto.randomUUID());
  await page.clock.runFor(15_100);await expect(page.getByTestId('chat-profile-name')).toHaveText('Latest');
});

test('a slow superseded profile read cannot restore an old name or notice version',async({context,page})=>{
  const state=nameUiState();await mockNameUi(context,state,'bob');
  await page.goto(`/chat/${nameIds.match}`);await expect(page.getByTestId('chat-input')).toBeVisible();
  let calls=0;let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  const latest=crypto.randomUUID();
  await page.route('**/rest/v1/rpc/chat_partner_state',async route=>{
    const first=++calls===1;
    const row={id:nameIds.alice,first_name:first?'Older':'Newer',bio:'Current bio',photo_url:null,correction_id:first?crypto.randomUUID():latest,seen_correction_id:null,expires_at:new Date(Date.now()+3600000).toISOString()};
    if(first)await held;
    await route.fulfill({json:[row]});
  });
  try {
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect.poll(()=>calls).toBe(1);
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(page.getByTestId('chat-profile-name')).toHaveText('Newer');
    const oldResponse=page.waitForResponse(response=>response.url().includes('chat_partner_state'));
    release();await oldResponse;
    await expect(page.getByTestId('chat-profile-name')).toHaveText('Newer');
    await expect.poll(()=>state.seen.get(nameIds.match)).toBe(latest);
  } finally {release();await page.unrouteAll({behavior:'wait'});}
});

test('localized correction and chat notice remain usable at 320px with long names',async({context,page})=>{
  const state=nameUiState();state.name='W'.repeat(30);await mockNameUi(context,state,'bob');
  await page.setViewportSize({width:320,height:740});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/profile?edit=1');
  for(const [locale,request,title,close] of [
    ['fr','Demander une correction','Corriger ton prénom','Fermer'],
    ['es','Solicitar una corrección','Corregir tu nombre','Cerrar'],
  ]) {
    await page.evaluate(locale=>{localStorage.setItem('amourette-locale',locale);window.dispatchEvent(new Event('amourette-locale-change'));},locale);
    await page.getByRole('button',{name:request}).click();
    await expect(page.getByRole('dialog',{name:title})).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('textbox')).toBeFocused();
    await page.getByRole('dialog').getByRole('textbox').fill('😀'.repeat(30));
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth',320);
    await page.screenshot({path:test.info().outputPath(`profile-${locale}-320.png`)});
    await page.getByRole('button',{name:close,exact:true}).click();
    await expect(page.getByRole('button',{name:request})).toBeFocused();
  }
  state.notices.set(nameIds.match,crypto.randomUUID());await page.goto(`/chat/${nameIds.match}`);
  await expect(page.getByTestId('chat-name-notice')).toBeVisible();
  for(const [locale,notice] of [['fr','Cette personne a changé de prénom.'],['es','Esta persona ha cambiado de nombre.']]) {
    await page.evaluate(locale=>{localStorage.setItem('amourette-locale',locale);window.dispatchEvent(new Event('amourette-locale-change'));},locale);
    await expect(page.getByTestId('chat-name-notice')).toHaveText(notice);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth',320);
    await expect(page.getByTestId('chat-input')).toBeInViewport();
    await page.screenshot({path:test.info().outputPath(`chat-${locale}-320.png`)});
  }
});
