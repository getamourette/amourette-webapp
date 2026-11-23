# CI installs Chromium without the apt dependency step

Date: 2026-11-23. Issue #445. Supersedes the retry shipped in #450.

## Decision

The browser job runs `npx playwright install chromium`, without `--with-deps`.
The step is capped at 3 minutes and retried once. Before the retry, the processes
of the first attempt are killed and Playwright's install lock is removed.

## Why

- `--with-deps` ran `apt-get update` and `apt-get install` on every shard. On the
  `ubuntu-24.04` image it only added nine font packages (CJK, Thai, Cyrillic bitmap,
  Unifont, FreeFont) and upgraded four Mesa libraries: every library Chromium needs
  to launch is already in the image. The app is French and English and no test
  compares screenshots, so those fonts bought nothing.
- That apt run stalled twice on 2026-11-23. The first time it held a job for 30
  minutes. The second time the retry from #450 killed `apt-get` while dpkg was
  configuring packages, and the second install stopped on `dpkg was interrupted`.
  Repairing dpkg would have kept a network dependency that served no purpose.
- The install now takes about 10 seconds and depends on one host,
  `cdn.playwright.dev`.
- A browser cache was not added: it would save those 10 seconds at the cost of cache
  keys and conditional steps, and the cap and retry already bound a stalled download.

## What a retry must clean up

A step that hits `timeout-minutes` is marked failed, but its processes keep running
until the job ends. The stalled Playwright download therefore keeps the lock
`~/.cache/ms-playwright/__dirlock`, and a second install waits on it silently. This
was found by really interrupting the download, not by reading the workflow.

## If the image loses a library

Chromium then refuses to launch and names the missing library on every shard. The
fix is to install that package explicitly, or to restore `--with-deps` together with
`sudo dpkg --configure -a` in the retry.
