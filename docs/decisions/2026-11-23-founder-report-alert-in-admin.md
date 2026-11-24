# Founders learn about a new report from an alert inside the admin

Date: 2026-11-23 (#475)

At launch one founder runs the night alone, at the door, with the phone on the
arrivals screen. Until now a report reached a founder only if `/admin/moderation`
was on screen (the 30-second refresh of #232 runs only there).

Decision: every admin screen, the door included, polls the open-report count
every 10 seconds while visible and again on focus, tab return and reconnection.
When the count is above zero it shows a red banner with "Open moderation" and a
badge on the Moderation link; when the count rises the device vibrates where the
browser allows it (Android, not iOS Safari) and plays a short chime once a first
tap has unlocked audio. On iOS the audio session is switched to playback so the
chime is heard with the silent switch on. A failed read keeps the last count, so
a network blip never hides an alert.

Why not email or SMS: both reach a locked phone, which this alert does not, but
the door phone is unlocked and on the admin all night. SMS needs a new provider
and email needs a new server path from a database event to Resend; neither is
justified before the first night. Revisit when a founder is expected to be away
from the admin during a live night.

Why a poll and not the `founder-moderation` broadcast: supabase-js returns the
same channel object for the same topic, so a second subscriber in the shell
would be removed by the moderation queue's own cleanup. The open count is one
small authorized read; 10 seconds is the accepted worst-case delay.

Limits: nothing fires while the phone is locked or the browser is in the
background; the count is read again as soon as the founder returns.
