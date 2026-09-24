import type { BrowserContext } from '@playwright/test';
import { loadTestEnv } from './env';
loadTestEnv();
export const nameIds = {
  alice: '00000000-0000-4000-8000-000000000001', bob: '00000000-0000-4000-8000-000000000002',
  admin: '00000000-0000-4000-8000-000000000003', match: '00000000-0000-4000-8000-000000000010',
  secondMatch: '00000000-0000-4000-8000-000000000011', venue: '00000000-0000-4000-8000-000000000020', night: '00000000-0000-4000-8000-000000000021',
};
type Correction = { id: string; proposed_name: string; status: string; created_at: string; resolved_at: string | null; profile_id: string; reviewed_by: string | null };
export function nameUiState() {
  return {
    name: 'Alice', bio: 'Hello from Alice.', corrections: [] as Correction[],
    notices: new Map<string,string>(), seen: new Map<string,string>(),
    submissions: [] as { p_request_id: string; p_proposed_name: string }[],
    patches: [] as Record<string,unknown>[], acknowledgements: 0, reads: 0,
    failSubmit: false, loseSubmitResponse: false, failAck: false,
    approve(id: string) {
      const row=this.corrections.find(row=>row.id===id)!;
      if(row.status !== 'pending') return false;
      row.status='approved';row.resolved_at=new Date().toISOString();row.reviewed_by=nameIds.admin;
      this.name=row.proposed_name;
      this.notices.set(nameIds.match,id);this.notices.set(nameIds.secondMatch,id);return true;
    },
  };
}
export async function mockNameUi(context: BrowserContext, state: ReturnType<typeof nameUiState>, actor: 'alice'|'bob'|'admin'='alice') {
  if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
    const origin = new URL(process.env.E2E_BASE_URL).origin;
    await context.route(`${origin}/**`, route => route.continue({
      headers: { ...route.request().headers(), 'x-vercel-protection-bypass': process.env.E2E_VERCEL_BYPASS! },
    }));
  }
  const backend=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const user={id:nameIds[actor],aud:'authenticated',role:'authenticated',is_anonymous:actor!=='admin',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  const token=`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,exp:4099766400,role:'authenticated'})).toString('base64url')}.synthetic`;
  const session={access_token:token,refresh_token:'synthetic',expires_in:3600,expires_at:4099766400,token_type:'bearer',user};
  await context.addInitScript(({session,storageKey})=>{
    localStorage.setItem(storageKey,JSON.stringify(session));localStorage.setItem('amourette-locale','en');
  },{session,storageKey:`sb-${backend.hostname.split('.')[0]}-auth-token`});
  await context.routeWebSocket(/.*/,socket=>socket.close());
  await context.route(`${backend.origin}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').at(-1);
    const body=req.method()==='POST'||req.method()==='PATCH'?req.postDataJSON():null;
    const reply=(value:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
    const rows=(value:unknown[])=>reply(req.headers().accept?.includes('object+json')?value[0]??null:value);
    const profile={id:user.id,first_name:actor==='alice'?state.name:'Bob',bio:state.bio,photo_url:null,gender:'woman',interested_in:['woman','man']};
    if(url.pathname.startsWith('/auth/')) return reply(url.pathname.endsWith('/user')?user:session);
    if(name==='get_my_profile') return rows([profile]);
    if(name==='get_my_profile_edit_state') return rows([{gender:profile.gender,interested_in:profile.interested_in,version:null,available_at:null,server_now:new Date().toISOString()}]);
    if(name==='profiles') {
      if(req.method()==='PATCH') {state.patches.push(body);state.bio=body.bio;return reply(null);}
      return rows([profile]);
    }
    if(name==='my_name_correction') {const r=state.corrections.at(-1);return rows([{id:null,proposed_name:null,status:null,created_at:null,resolved_at:null,...r,current_name:state.name}]);}
    if(name==='submit_name_correction') {
      state.submissions.push(body);
      if(state.failSubmit) return reply({message:'Synthetic lost request',code:'500'},500);
      if(!state.corrections.some(r=>r.id===body.p_request_id)) state.corrections.push({id:body.p_request_id,proposed_name:body.p_proposed_name,status:'pending',created_at:new Date().toISOString(),resolved_at:null,profile_id:nameIds.alice,reviewed_by:null});
      if(state.loseSubmitResponse)return reply({message:'Synthetic lost submission response'},500);
      return reply(body.p_request_id);
    }
    if(name==='cancel_name_correction') {const r=state.corrections.find(r=>r.id===body.p_request_id)!;if(r.status==='pending')r.status='cancelled';return reply(r.status);}
    if(name==='admin_name_corrections') return reply(state.corrections.filter(r=>body.p_request_id?r.id===body.p_request_id:r.status==='pending').map(r=>({...r,current_name:state.name})));
    if(name==='decide_name_correction') {
      const r=state.corrections.find(r=>r.id===body.p_request_id)!;let applied=false;
      if(body.p_action==='approved')applied=state.approve(r.id);
      else if(r.status==='pending'){r.status='rejected';applied=true;}
      return reply([{applied,status:r.status}]);
    }
    if(name==='am_i_admin')return reply(actor==='admin');
    if(name==='chat_partner_state') {
      state.reads++;
      return rows([{id:nameIds.alice,first_name:state.name,bio:state.bio,photo_url:null,correction_id:state.notices.get(body.p_match_id)??null,seen_correction_id:state.seen.get(body.p_match_id)??null,expires_at:new Date(Date.now()+3600000).toISOString()}]);
    }
    if(name==='acknowledge_name_correction') {state.acknowledgements++;if(state.failAck)return reply({message:'Synthetic receipt failure'},500);state.seen.set(body.p_match_id,body.p_correction_id);return reply(true);}
    if(name==='matches')return rows([{id:url.searchParams.get('id')?.slice(3)??nameIds.match,profile_a:nameIds.alice,profile_b:nameIds.bob,venue_id:nameIds.venue,venue_night_id:nameIds.night,expires_at:new Date(Date.now()+3600000).toISOString(),venues:{name:'Test bar',city:'Paris',slug:'test-bar'}}]);
    if(name==='match_presence_state')return reply([{me_is_present:true,other_is_present:true}]);
    if(name==='photo_state')return rows([]);
    if(name==='profile_photo_source')return reply([]);
    if(name==='venue_night_state')return reply([{venue_night_id:nameIds.night,status:'live',closes_at:new Date(Date.now()+3600000).toISOString()}]);
    if(name==='venue_night_public_state')return rows([{venue_night_id:nameIds.night,status:'live'}]);
    if(name?.startsWith('record_'))return reply(null);
    return rows([]);
  });
}
