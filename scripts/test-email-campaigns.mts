import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
// @ts-expect-error -- Node type-stripping resolves explicit source extensions.
import { parseCampaignCommand, CAMPAIGN_PREFERENCE_URL, campaignSchedule } from "../lib/email-campaigns.ts";
const id = "00000000-0000-0000-0000-000000000001";
for (const value of [null, [], {}, {action:"preview",nightIds:[]}, {action:"preview",nightIds:[id,id]}, {action:"preview",nightIds:Array(21).fill(id)}, {action:"preview",nightIds:[null]}, {action:"preview",nightIds:[` ${id}`]}, {action:"retry",campaignId:id}, {action:"confirm",campaignId:id,confirmed:"true",audience:{}}, {action:"review",campaignId:id,extra:true}]) assert.equal(parseCampaignCommand(value), null);
assert.deepEqual(parseCampaignCommand({action:"preview",nightIds:[id]}),{action:"preview",nightIds:[id]});
const audience={eligible:1,en:1,fr:0,es:0,frequency:0,suppressed:0};
assert.ok(parseCampaignCommand({action:"confirm",campaignId:id,confirmed:true,audience}));
assert.equal(parseCampaignCommand({action:"confirm",campaignId:id,confirmed:true,audience:{...audience,eligible:-1}}),null);
const require = createRequire(import.meta.url);
let js=ts.transpileModule(readFileSync("emails/UpcomingNightsEmail.tsx","utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
js=js.replace('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href))
  .replace('"@react-email/render"',JSON.stringify(pathToFileURL(require.resolve("@react-email/render")).href))
  .replace('"@/lib/email-campaigns"',JSON.stringify(new URL('../lib/email-campaigns.ts',import.meta.url).href));
const template = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const night={id,venue_id:id,name:'A & B <script>alert(1)</script>',city:'Paris',timezone:'Europe/Paris',waiting_opens_at:'2030-10-26T19:00:00Z',guaranteed_launch_at:'2030-10-26T20:00:00Z',closes_at:'2030-10-27T02:00:00Z'};
const subjects={en:'Your next Amourette night',fr:'Votre prochaine soirée Amourette',es:'Tu próxima noche Amourette'};
for (const locale of ['en','fr','es'] as const) {
  const message=await template.renderUpcomingNightsEmail({locale,nights:[night],preferencesUrl:CAMPAIGN_PREFERENCE_URL});
  assert.equal(message.subject,subjects[locale]);
  assert.ok(message.html.includes('Paris') && message.text.includes('Paris'));
  assert.ok(message.html.includes(CAMPAIGN_PREFERENCE_URL) && message.text.includes(CAMPAIGN_PREFERENCE_URL));
  assert.ok(!message.html.includes('<script>'));
  assert.ok(message.text.includes(campaignSchedule(night,locale)));
  assert.doesNotMatch(message.html,/\/v\/|utm_|<img/i);
}
console.log('Campaign input boundaries and actual EN/FR/ES HTML/plain-text rendering passed.');
