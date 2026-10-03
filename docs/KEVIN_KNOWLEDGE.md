# Kevin: listening all the time, property only, learning from the whole world

## Listening
Hands-free keeps ONE microphone stream open while the page is visible. Kevin being busy (hearing, thinking, talking) no longer closes and reopens it: what is heard while he is busy, and for 0.7 s after, is simply not used, so he never answers his own voice. The "listening" badge is steady.
Follow-ups ("how much is it?") are accepted for 90 s after he last spoke even without a property word. The server then decides: anything not meant for him or not about property comes back `{ ignored: true }` and Kevin stays silent and leaves nothing on screen.
Cost guard: at most 120 clips an hour go to the speech service; past that the browser's own recogniser takes over.

## Property only
`KEVIN_SCOPE_PROMPT` (server/gene/chat.ts) limits him to property in any country and makes him honest about differing laws, prices and fees. Off-topic questions get one kind sentence back. Overheard talk that is not about property never triggers an urgent alert.

## Knowledge that grows (server/gene/kevin-knowledge.ts)
- Every 3 hours (`KEVIN_KB_CRON`, `KEVIN_KB=off` stops it) the next 10 countries are read from Google News RSS plus the Guardian property desk and HousingWire (`KEVIN_KB_FEEDS` adds more, comma separated https URLs). All ~195 countries are covered about every 2.5 days. A first run happens 90 s after each start.
- When a visitor names a country or a well-known city, a fresh lookup for it is made on the spot (2.5 s limit, cached 6 h).
- Reports keep publisher, date and link; Kevin must name the publisher and say "reported". Outside text is stripped of markup and control markers before it reaches a prompt.
- Gaps: when Kevin cannot answer well he ends with `[[GAP]]` (stripped). Questions are counted. Owner endpoints (strict admin):
  - `GET /api/admin/kevin-knowledge`: counts, open gaps (most asked first), facts, recent reports
  - `POST /api/admin/kevin-knowledge/facts` `{ title, text, country?, gapId? }`: teach him; he uses it from then on
  - `DELETE /api/admin/kevin-knowledge/:id`
  - `POST /api/admin/kevin-knowledge/refresh`: read the next countries now
- Stored in the settings table (`kevin-kb:`, `kevin-gap:`) with a local JSON copy.

## Not done
No admin screen yet (endpoints only). Without an AI key Kevin still answers from listings only. Reports come from headlines, not article text.
