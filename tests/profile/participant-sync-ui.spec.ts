import { test, expect, type BrowserContext, type WebSocketRoute } from '@playwright/test';
import sharp from 'sharp';
import { mockNameUi, nameIds, nameUiState } from '../helpers/name-ui-fixture';

async function transport(context: BrowserContext, actor: 'alice'|'bob', state: ReturnType<typeof nameUiState>) {
  await mockNameUi(context,state,actor);
  let revision=crypto.randomUUID();
  let reads=0;
  const sockets=new Map<WebSocketRoute,string|null>();
  const topic=`realtime:participant:${nameIds[actor]}`;
  // Observe receipt before advancing fake timers, so a burst really arrives in
  // one coalescing window regardless of browser/transport scheduling speed.
  await context.addInitScript(topic=>{
    const NativeSocket=window.WebSocket;
    window.WebSocket=class extends NativeSocket {
      constructor(url:string|URL,protocols?:string|string[]){
        super(url,protocols);
        this.addEventListener('message',event=>{
          try{
            const frame=JSON.parse(String(event.data));
            if(frame[2]===topic&&frame[3]==='broadcast')document.documentElement.dataset.participantFrames=String(Number(document.documentElement.dataset.participantFrames??0)+1);
          }catch{/* Other socket traffic is irrelevant to this test. */}
        });
      }
    };
  },topic);
  await context.routeWebSocket(/.*/,socket=>{
    socket.onMessage(raw=>{
      const [join,ref,channel,event]=JSON.parse(String(raw));
      if(event==='phx_join') {
        if(channel===topic) sockets.set(socket,join);
        socket.send(JSON.stringify([join,ref,channel,'phx_reply',{status:'ok',response:{postgres_changes:[]}}]));
      } else if(event==='heartbeat'||event==='phx_leave') socket.send(JSON.stringify([join,ref,channel,'phx_reply',{status:'ok',response:{}}]));
    });
    socket.onClose(()=>{sockets.delete(socket);});
  });
  await context.route('**/rest/v1/rpc/my_participant_revision',route=>{reads++;return route.fulfill({json:revision});});
  return {
    get reads(){return reads;},
    get connections(){return sockets.size;},
    change(){revision=crypto.randomUUID();},
    signal(payload:unknown={version:1}){
      for(const [socket,join] of sockets) socket.send(JSON.stringify([join,null,topic,'broadcast',{event:'state_changed',payload}]));
    },
  };
}

test('private signals update both owner tabs, preserve drafts, coalesce bursts and recover a missed event',async({context,page})=>{
  const state=nameUiState();
  const sync=await transport(context,'alice',state);
  const second=await context.newPage();
  await Promise.all([page.clock.install(),second.clock.install()]);
  await Promise.all([page.goto('/profile?edit=1'),second.goto('/profile?edit=1')]);
  await expect(page.getByTestId('current-first-name')).toHaveText('Alice');
  await expect(second.getByTestId('current-first-name')).toHaveText('Alice');
  await expect.poll(()=>sync.connections).toBe(2);
  await Promise.all([page.clock.runFor(1000),second.clock.runFor(1000)]);
  await second.getByPlaceholder('Bio (optional)').fill('Keep my unfinished bio');
  const before=sync.reads;
  state.name='Alix';state.bio='Saved elsewhere';sync.change();
  for(let i=0;i<30;i++)sync.signal();
  await Promise.all([page.clock.runFor(1000),second.clock.runFor(1000)]);
  await expect(page.getByTestId('current-first-name')).toHaveText('Alix');
  await expect(second.getByTestId('current-first-name')).toHaveText('Alix');
  await expect(page.getByPlaceholder('Bio (optional)')).toHaveValue('Saved elsewhere');
  await expect(second.getByPlaceholder('Bio (optional)')).toHaveValue('Keep my unfinished bio');
  expect(sync.reads-before,'one revision read per tab for the entire burst').toBe(2);
  const settled=sync.reads;
  sync.signal({version:1,reason:'blocked'});
  await page.clock.runFor(1000);
  expect(sync.reads,'unexpected signal fields are rejected before reads').toBe(settled);
  state.name='Alice again';sync.change(); // deliberately drop delivery
  await page.clock.fastForward(30_000);await page.clock.runFor(1000);
  await expect(page.getByTestId('current-first-name')).toHaveText('Alice again');
  await second.evaluate(()=>window.dispatchEvent(new Event('online')));
  await second.clock.runFor(1000);
  await expect(second.getByTestId('current-first-name')).toHaveText('Alice again');
  await expect(second.getByPlaceholder('Bio (optional)')).toHaveValue('Keep my unfinished bio');
});

test('photo failures recover at an unchanged participant revision without repeated downloads after recovery',async({context,page})=>{
  await transport(context,'alice',nameUiState());
  const version=crypto.randomUUID();
  const photo=await sharp({create:{width:64,height:64,channels:3,background:'#805347'}}).jpeg().toBuffer();
  let failing=true;let photoReads=0;let downloads=0;
  await context.route('**/rest/v1/photo_state?*',route=>{
    photoReads++;
    return failing ? route.fulfill({status:503,json:{message:'Temporarily unavailable'}}) : route.fulfill({json:{
      profile_id:nameIds.alice,displayed_id:version,pending_id:null,correction_required:false,revision:1,
    }});
  });
  await context.route('**/rest/v1/photo_versions?*',route=>route.fulfill({json:[{
    id:version,profile_id:nameIds.alice,path:`${nameIds.alice}/${version}.jpg`,status:'approved',created_at:new Date().toISOString(),
  }]}));
  await context.route('**/storage/v1/**',route=>{downloads++;return route.fulfill({body:photo,contentType:'image/jpeg'});});
  await page.clock.install();await page.goto('/profile?edit=1');
  await expect.poll(()=>photoReads).toBeGreaterThan(0);
  await page.clock.runFor(1000);await page.waitForLoadState('networkidle');
  const image=page.locator('label img');
  await expect(image).toHaveCount(0);
  failing=false;
  // No signal, foreground event or new revision: retry alone must recover.
  await page.clock.fastForward(30_000);await page.clock.runFor(1000);
  await expect(image).toBeVisible();await page.waitForLoadState('networkidle');
  const recoveredReads=photoReads,recoveredDownloads=downloads;
  expect(recoveredDownloads).toBeGreaterThan(0);
  const revision=page.waitForResponse(response=>response.url().includes('/rpc/my_participant_revision'));
  await page.clock.fastForward(30_000);await page.clock.runFor(1000);await revision;
  expect(photoReads).toBe(recoveredReads);expect(downloads).toBe(recoveredDownloads);
});

test('live matched-profile changes preserve the conversation and consume the name notice only when visible',async({context,page})=>{
  const state=nameUiState();
  const sync=await transport(context,'bob',state);
  await page.clock.install();
  await page.goto(`/chat/${nameIds.match}`);
  await expect(page.getByTestId('chat-profile-name')).toHaveText('Alice');
  await expect(page.getByTestId('chat-input')).toBeVisible();
  await page.clock.runFor(1000);
  await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true}));
  const correction=crypto.randomUUID();state.name='Alix';state.notices.set(nameIds.match,correction);sync.change();sync.signal();
  await page.clock.runFor(1000);
  expect(state.acknowledgements).toBe(0);
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.runFor(1000);
  await expect(page.getByTestId('chat-profile-name')).toHaveText('Alix');
  await expect(page.getByTestId('chat-name-notice')).toBeVisible();
  await expect(page.getByTestId('chat-input')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('chat-profile-name')).toHaveText('Alix');
  await expect(page.getByTestId('chat-name-notice')).toHaveCount(0);
});

test('a remote block closes an open chat even when the deleted match makes presence fail',async({context,page})=>{
  const sync=await transport(context,'bob',nameUiState());
  await page.goto(`/chat/${nameIds.match}`);
  await expect(page.getByTestId('chat-profile-name')).toHaveText('Alice');
  await expect(page.getByTestId('chat-input')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.route('**/rest/v1/rpc/chat_partner_state',route=>route.fulfill({json:null}));
  await page.route('**/rest/v1/rpc/match_presence_state',route=>route.fulfill({status:400,json:{code:'P0001',message:'match not available'}}));
  sync.change();sync.signal();
  await expect(page.getByText('This conversation is no longer available.',{exact:true})).toBeVisible();
  await expect(page.getByTestId('chat-profile-name')).toHaveCount(0);
  await expect(page.getByTestId('chat-input')).toHaveCount(0);
});

test('a timed-out revision check retries after five seconds without another signal',async({context,page})=>{
  const state=nameUiState();
  const sync=await transport(context,'alice',state);
  // Drive AbortSignal deadlines with the same controlled clock as retry timers.
  await context.addInitScript(()=>{
    AbortSignal.timeout=milliseconds=>{
      const controller=new AbortController();
      setTimeout(()=>controller.abort(new DOMException('Timed out','TimeoutError')),milliseconds);
      return controller.signal;
    };
  });
  await page.clock.install();
  await page.goto('/profile?edit=1');
  await expect(page.getByPlaceholder('Bio (optional)')).toHaveValue(state.bio);
  await expect.poll(()=>sync.connections).toBe(1);
  await page.clock.runFor(1000);await page.waitForLoadState('networkidle');
  let attempts=0;let release!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/rest/v1/rpc/my_participant_revision',async route=>{
    if(++attempts===1){await held;await route.fulfill({json:crypto.randomUUID()});}
    else await route.fallback();
  });
  const timedOut=page.waitForEvent('requestfailed',{
    predicate:request=>request.url().includes('/rpc/my_participant_revision'),timeout:20_000,
  });
  try {
    state.bio='Updated after timeout';sync.change();sync.signal();
    await expect.poll(()=>attempts).toBe(1);
    await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
    // Expire the 15-second read, then advance only its five-second retry,
    // staying before the independent 30-second poll.
    await page.clock.fastForward(15_000);
    release();
    await timedOut;
    await page.clock.fastForward(5000);await page.clock.runFor(1000);
    await expect.poll(()=>attempts,{timeout:2000}).toBe(2);
    // The successful HTTP reply queues the editor's own coalesced read.
    await page.waitForLoadState('networkidle');await page.clock.runFor(1000);
    await expect(page.getByPlaceholder('Bio (optional)')).toHaveValue(state.bio);
  } finally {release();await page.unrouteAll({behavior:'wait'});}
});

test('an open room removes and adds cards from signals, and a delayed response cannot restore a removed card',async({context,page})=>{
  const sync=await transport(context,'alice',nameUiState());
  const presenceId='00000000-0000-4000-8000-000000000030';
  const night={venue_id:nameIds.venue,venue_night_id:nameIds.night,status:'live',participant_count:3,launch_threshold:4,
    guaranteed_launch_at:new Date().toISOString(),closes_at:new Date(Date.now()+3_600_000).toISOString(),terminal_reason:null,updated_at:new Date().toISOString()};
  const bob={id:nameIds.bob,first_name:'Bob',bio:'Here tonight',photo_url:null,checked_in_at:new Date(Date.now()-600_000).toISOString(),venue_night_id:nameIds.night,like_token:crypto.randomUUID()};
  let candidates=[bob];let reads=0;
  let hold:Promise<void>|undefined;
  await context.route('**/rest/v1/**',async route=>{
    const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').at(-1);
    const rows=(value:unknown[])=>route.fulfill({json:req.headers().accept?.includes('object+json')?value[0]??null:value});
    if(name==='venues')return rows([{id:nameIds.venue,name:'Test bar',city:'Paris',timezone:'Europe/Paris'}]);
    if(name==='venue_night_state')return rows([night]);
    if(name==='venue_night_public_state')return rows([night]);
    if(name==='profile_private')return rows([{adult_confirmed_at:new Date().toISOString()}]);
    if(name==='presence')return rows([{id:presenceId,profile_id:nameIds.alice,venue_night_id:nameIds.night,left_at:null,is_visible:true}]);
    if(name==='matches')return rows([]);
    if(name==='photo_state')return rows([{profile_id:nameIds.alice,displayed_id:null,pending_id:null,correction_required:false,revision:0}]);
    if(name==='room_candidates'){
      reads++;const snapshot=structuredClone(candidates);if(hold)await hold;return rows(snapshot);
    }
    return route.fallback();
  });
  await page.clock.install();await page.goto('/v/test-bar');
  await page.locator('[aria-labelledby="room-hint-title"]').getByRole('button').click();
  await expect(page.getByRole('heading',{name:'Bob',exact:true})).toBeVisible();
  await expect.poll(()=>sync.connections).toBe(1);
  await page.clock.runFor(1000);
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
  await page.waitForLoadState('networkidle');
  const frames=Number(await page.locator('html').getAttribute('data-participant-frames')??0);
  const before=reads;candidates=[];sync.change();for(let i=0;i<25;i++)sync.signal();
  await expect(page.locator('html')).toHaveAttribute('data-participant-frames',String(frames+25));
  await page.clock.resume();
  await page.clock.runFor(1000);
  await expect(page.getByRole('heading',{name:'Bob',exact:true})).toHaveCount(0);
  expect(reads-before).toBe(1);
  candidates=[bob];sync.change();sync.signal();await page.clock.runFor(1000);
  await expect(page.getByRole('heading',{name:'Bob',exact:true})).toBeVisible();
  let releaseLike!:()=>void;let likeStarted!:()=>void;
  const likePending=new Promise<void>(resolve=>{releaseLike=resolve;});
  const likeCaptured=new Promise<void>(resolve=>{likeStarted=resolve;});
  await page.route('**/rest/v1/rpc/write_like',async route=>{
    likeStarted();await likePending;await route.fulfill({json:{accepted:false}});
  });
  await page.getByRole('button',{name:'Like',exact:true}).click();await likeCaptured;
  candidates=[];sync.change();sync.signal();await page.clock.runFor(1000);
  await expect(page.getByRole('heading',{name:'Bob',exact:true})).toHaveCount(0);
  releaseLike();await page.clock.runFor(1000);
  candidates=[bob];sync.change();sync.signal();await page.clock.runFor(1000);
  await expect(page.getByRole('heading',{name:'Bob',exact:true})).toBeVisible();
  let release!:()=>void;hold=new Promise<void>(resolve=>{release=resolve;});
  candidates=[{...bob,first_name:'Obsolete'}];const start=reads;sync.change();sync.signal();
  await page.clock.runFor(1000);await expect.poll(()=>reads).toBe(start+1);
  candidates=[];sync.change();sync.signal();await page.clock.runFor(1000);
  // Observe every DOM mutation, not only the eventual correct screen.
  await page.evaluate(()=>{
    const observer=new MutationObserver(()=>{if(document.body.textContent?.includes('Obsolete'))document.body.dataset.restored='yes';});
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  });
  hold=undefined;release();await page.clock.runFor(1000);
  await expect(page.getByRole('heading',{name:'Bob',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Obsolete',exact:true})).toHaveCount(0);
  expect(await page.locator('body').getAttribute('data-restored')).toBeNull();
});
