# Kevin's voice and how he answers while you browse

## One voice, all the way through
Kevin is an African man. The voice comes from the first speech service that works (server/gene/kevin-voice.ts): ElevenLabs, then Azure (male Kenyan English and Kiswahili voices), then Gemini ("Charon"), then OpenAI ("ash"), each told to sound like a calm East or West African professional. If none works the phone's own voice is used.
**Production today has none of these working**: Railway has no `ELEVENLABS_API_KEY` and no `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`, and the Gemini and OpenAI keys are returning 429 (quota used up). So every answer falls back to whatever voice the phone has, and a cached line (the greeting) can still come from the server voice, which is why it can change mid-conversation.
To get the real voice, set ONE of these in Railway:
- ElevenLabs: `ELEVENLABS_API_KEY` (free plan works) and, for an African accent on the free plan, `KEVIN_ELEVENLABS_VOICE_ID` = a voice saved in your own account (library voices need a paid plan; without the id he falls back to "Daniel", a British man).
- Azure Speech (free tier ~500,000 characters a month): `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`. Needs no voice id: it uses en-KE-ChilembaNeural (male, Kenyan English).

In the browser (useKevinVoice.ts): once his own voice fails, the page stays on the device voice for ten minutes instead of flipping back and forth; the device voice prefers a male voice (African regions first) and is pitched lower (0.9 if the voice says it is male, 0.75 if it does not say).

## Answering while you browse
Spoken to with the chat closed, Kevin no longer opens the full dark chat. He answers aloud and a small card over the page shows what he heard and what he said (tap it to open the chat, it fades a few seconds after he finishes). He keeps talking while you move between properties: property cards on the home, For Sale and Rentals pages now navigate inside the app instead of reloading the page, which used to cut him off.
