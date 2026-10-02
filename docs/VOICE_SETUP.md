# Kevin's voice and ears: free options

Kevin hears and speaks with the best free service that still has an allowance left, and falls back to the browser's own
recogniser and voice when none do. Set whichever of these you like as environment variables on the server (never in the
code or in chat). Each one that is set is used; each one that is missing is skipped.

## Hearing (speech to text), tried in this order

| Order | Service | Variables | Free allowance |
|---|---|---|---|
| 1 | ElevenLabs Scribe | `ELEVENLABS_API_KEY` | free credits each month (shared with the voice) |
| 2 | Groq Whisper | `GROQ_API_KEY` | free tier with per-minute and daily limits; very fast; good with Kiswahili |
| 3 | Azure AI Speech | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | free F0 tier, about 5 audio hours a month |

`KEVIN_STT_PROVIDERS=groq,azure,elevenlabs` changes the order (or leaves one out).
`KEVIN_STT_DAILY_SECONDS` (default 7200) caps the audio Kevin will transcribe per day, whatever the services allow.

## Speaking (text to speech), tried in this order

| Order | Service | Variables | Free allowance |
|---|---|---|---|
| 1 | ElevenLabs (Flash v2.5; Eleven v3 for Kiswahili) | `ELEVENLABS_API_KEY`, optional `KEVIN_ELEVENLABS_VOICE_ID` | free credits each month |
| 2 | Azure AI Speech neural voices | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | free F0 tier, about 500,000 characters a month |
| 3 | Google Gemini speech | `GEMINI_API_KEY` | free tier with rate limits |
| 4 | OpenAI | `OPENAI_API_KEY` | not free |

`KEVIN_VOICE_PROVIDER=azure` moves one to the front. By default Azure speaks with a male Kenyan English voice
(`en-KE-ChilembaNeural`) and a male Kiswahili voice (`sw-KE-RafikiNeural`); change them with `KEVIN_AZURE_ENGLISH_VOICE`
and `KEVIN_AZURE_VOICE`. Other good male English choices: `en-NG-AbeoNeural` (Nigerian), `en-TZ-ElimuNeural`
(Tanzanian), `en-ZA-LukeNeural` (South African).

## Getting the free keys

- **Azure:** in the Azure portal create a "Speech" resource with the **Free (F0)** pricing tier, in a region near your
  visitors (for example South Africa North or East US). Copy one of its two keys into `AZURE_SPEECH_KEY` and the region
  name (for example `southafricanorth`) into `AZURE_SPEECH_REGION`. An Azure account needs a card on file, but the F0
  tier does not charge; Kevin also stops using it at 90% of the monthly allowance (`KEVIN_AZURE_TTS_MONTHLY_CHARS`,
  `KEVIN_AZURE_STT_MONTHLY_SECONDS`).
- **Groq:** create a free account at console.groq.com and make an API key for `GROQ_API_KEY`.
- **ElevenLabs:** a free account's API key goes in `ELEVENLABS_API_KEY`.

## Checking it works

Admin > Kevin status (`/api/admin/kevin-status`) lists which services are set, which are resting after refusing a
request, and how much of the Azure allowance has been used this month.

## Privacy

When someone turns on listening or taps the microphone, a short clip of what they said (never while the room is quiet) is
sent to whichever speech service answers, to be turned into text; Kevin's spoken replies are made from the text of his
answer. RealEVR does not keep the audio. The Privacy Policy and the hands-free consent text name these services.
