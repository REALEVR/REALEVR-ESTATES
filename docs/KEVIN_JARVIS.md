# Kevin, Jarvis mode

A command-centre view of Kevin, inspired by the "personal Jarvis" idea: a glowing core that shows what he is doing, panels
with real data, a log of what he did, and one card for the conversation.

## How someone opens it

- Say **"Kevin, Jarvis mode"** (also: "open the command centre", "control room", "mission control").
- Or the chat's **⋯ menu > Jarvis mode**.
- Any screen can offer it with `openKevinHud()` (`kevinEvents.ts`).
- Close it with Esc, the X, or saying "close" / "close Jarvis".

It never opens by itself, and the everyday Kevin is unchanged: a small orb at the side, answering aloud while you keep
scrolling. Opening Jarvis mode turns the microphone on, because it is a deliberate choice (the browser asks for
permission the first time).

## What is on the screen

| Part | What it shows |
| --- | --- |
| Core | A sphere of light points inside turning rings. It rests when idle, ripples while he listens, ripples faster while he thinks, pulses like speech while he talks. It is drawn from his state, not from the audio itself. "Reduce motion" gets one still frame. |
| Systems | His state, whether the microphone is open, the language. |
| Platform | Homes, countries and cities live right now (the open API, `/public-api/v1/places`). |
| Activity | A log of what he heard, said and did ("Searched: 2+ bedroom homes in Kololo, 4 found"). |
| Matches and Market pulse | The homes he found, and their lowest, median and highest price (`hudCommands.ts`). "Open full results" opens the results page; nothing moves the page on its own while Jarvis mode is open. |
| Conversation card | What you said, live, then his answer. A text box and example commands sit under it. |

Code: `KevinHUD.tsx` (screen), `HudCanvas.tsx` (core and waveform), `hudCommands.ts` (the spoken commands and the price
spread), wired in `KevinOrb.tsx`.

## What makes him answer like he knows

`marketFacts` (`server/gene/kevin-brain.ts`) puts real numbers from the live listings in front of him when a question
names an area ("how much are homes in Kololo?": count, typical, lowest and highest price per type) or asks for extremes
("cheapest BnB"). `KEVIN_MANNER_PROMPT` (`server/gene/chat.ts`) gives him the manner: calm, quick, uses the figures, and
offers one next step. He still never invents a listing, price or law.

## What it does not do (yet)

- The sphere is not driven by the actual audio level of his voice; it follows his state.
- Voice quality still depends on the speech provider that is configured (`docs/VOICE_SETUP.md`). With only the phone's
  own voice, he sounds like the phone.
- He cannot act outside the site (book a viewing in your calendar, send messages for you). The first real extensions would be
  shortlisting homes, comparing two, and asking the owner on WhatsApp from the command centre.
