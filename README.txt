ISRAEL INSIDER WORKER SCAFFOLD
Status: draft 1, tested locally with sample feeds. Not deployed. Waiting for the GitHub repo roovik/israelinsider.

FILES
lib.js           feed parsing (RSS, Atom, podcast, YouTube), excerpt and URL cleanup, item normalization, RSS output
worker.js        JSON API, admin routes, submit form endpoint, hourly ingest (scheduled)
wrangler.jsonc   Worker config, KV binding STORE, hourly cron, static assets from public/
test/run.mjs     end to end test with sample feeds and an in memory store (node test/run.mjs)

API (public)
GET /api/items?format=read|listen|watch|social&voice=slug&topic=name&q=text&limit=30&offset=0
GET /api/voices
GET /api/voice/<slug>
GET /api/rss?format=listen
POST /api/submit   name, email, consent_excerpt are required

API (admin, header Authorization: Bearer ADMIN_KEY)
POST /api/admin/voice    create or update a voice (status pending, listed, paused, removed)
POST /api/admin/feed     attach a feed (kind blog, newsletter, podcast, youtube, bluesky, threads, telegram)
POST /api/admin/item     hide or feature an item
POST /api/admin/ingest   run ingestion now
GET  /api/admin/submissions

RULES BUILT IN
Only voices with status listed appear. Excerpts are cut at 300 characters. Full text is stored only when consent.full_text_ok is true, and is never returned by the public API. Tracking parameters are stripped from links. Hidden and featured flags survive re-ingestion. Feeds use ETag and Last-Modified. X feeds are skipped here because they are handled by embeds and a separate job.

TO DEPLOY (once the repo exists)
1. Copy these files to the repo root and add public/index.html and the front end pages.
2. Create a KV namespace in Cloudflare and paste its id into wrangler.jsonc.
3. Set the secret ADMIN_KEY in the Worker settings. Add the YouTube key later if richer video data is wanted.
4. Connect the repo to a Worker in Cloudflare so a push to main deploys.
5. Test on the workers.dev address, then move israelinsider.org to the Worker and remove the redirect.

KNOWN LIMITS OF THIS FIRST VERSION
KV holds one list of the latest 1500 items, which is fine for a few hundred voices. Move to D1 if search and paging need more. No X API job yet. No rate limit on the submit endpoint beyond a queue cap, so add Turnstile before launch. YouTube live status and durations need the Data API and are not included yet.
