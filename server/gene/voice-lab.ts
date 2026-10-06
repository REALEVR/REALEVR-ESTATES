/**
 * The voice lab: the owner listens to the same sentences in several Azure voices and chooses Kevin's.
 *
 *   GET /admin/voice-lab                      the page (administrators only)
 *   GET /api/admin/voice-lab/sample?voice=&text=&rate=   one spoken clip (administrators only)
 *
 * Only a fixed list of male voices can be requested (so nobody can use this to spend the speech allowance on anything
 * else), clips are cached in memory, and every clip counts against the same monthly allowance as Kevin's own speech.
 * Choosing a voice is done by setting KEVIN_AZURE_ENGLISH_VOICE (or KEVIN_AZURE_VOICE for every language) on the server.
 */
import type { Express, Request, Response } from 'express'
import { requireStrictAdmin } from './admin-guard'
import { azureConfigured, azureSpeakWith, azureTtsHasRoom, azureVoiceFor } from './speech-providers'

export interface LabVoice {
    id: string
    label: string
    group: string
    note: string
}

/** Neural male voices from the East and West African locales, plus two British ones as a reference point. */
export const LAB_VOICES: LabVoice[] = [
    { id: 'en-KE-ChilembaNeural', label: 'Chilemba', group: 'English, Kenya', note: "Kevin's current English voice" },
    { id: 'en-TZ-ElimuNeural', label: 'Elimu', group: 'English, Tanzania', note: 'East African English' },
    { id: 'en-NG-AbeoNeural', label: 'Abeo', group: 'English, Nigeria', note: 'West African English' },
    { id: 'en-ZA-LukeNeural', label: 'Luke', group: 'English, South Africa', note: 'Southern African English' },
    { id: 'en-GB-RyanNeural', label: 'Ryan', group: 'English, Britain', note: 'Reference: warm British' },
    { id: 'en-GB-ThomasNeural', label: 'Thomas', group: 'English, Britain', note: 'Reference: clear British' },
    { id: 'sw-KE-RafikiNeural', label: 'Rafiki', group: 'Swahili, Kenya', note: "Kevin's current Swahili voice" },
    { id: 'sw-TZ-DaudiNeural', label: 'Daudi', group: 'Swahili, Tanzania', note: 'Tanzanian Swahili' },
]

const ALLOWED = new Set(LAB_VOICES.map((v) => v.id))
const RATES = new Set(['-10%', '-4%', '0%', '+6%'])
const cache = new Map<string, { data: Buffer; type: string }>()

const SENTENCES: { lang: 'en' | 'sw'; text: string }[] = [
    { lang: 'en', text: 'Good evening. I am Kevin. Tell me the area and your budget, and I will find you a home.' },
    { lang: 'en', text: 'I found four homes in Kololo. The typical rent is two and a half million shillings. Shall I narrow it to two bedrooms?' },
    { lang: 'sw', text: 'Karibu! Naweza kukusaidia kupata nyumba nzuri Kampala au Nairobi. Unatafuta kupanga au kununua?' },
]

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function labPage(current: { english: string; swahili: string }): string {
    const rows = LAB_VOICES.map((v) => {
        const swahili = v.id.startsWith('sw-')
        const sentences = SENTENCES.filter((s) => (swahili ? s.lang === 'sw' : s.lang === 'en'))
        const mark = v.id === current.english || v.id === current.swahili ? ' <span class="now">in use</span>' : ''
        const buttons = sentences
            .map((s, i) => `<button type="button" data-voice="${esc(v.id)}" data-text="${esc(s.text)}">▶ Sentence ${i + 1}</button>`)
            .join('')
        return `<section><h2>${esc(v.label)}${mark}</h2><p>${esc(v.group)} · ${esc(v.note)}<br><code>${esc(v.id)}</code></p><div class="row">${buttons}</div></section>`
    }).join('')
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Kevin voice lab</title>
<style>:root{color-scheme:dark}body{margin:0;background:#0b0d1c;color:#fff;font:16px/1.5 system-ui,sans-serif;padding:20px 16px 60px;max-width:760px;margin-inline:auto}
h1{font-size:22px;color:#f5c469;margin:0 0 4px}p{color:#c9c6d6;margin:.2rem 0}section{border:1px solid #f5c46933;padding:12px 14px;margin:12px 0;border-radius:6px}
h2{margin:0;font-size:18px}.now{font-size:11px;background:#f5c469;color:#1b1305;padding:2px 7px;border-radius:99px;vertical-align:middle;margin-left:6px}
code{color:#f5c469;font-size:12px}.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
button{min-height:44px;padding:0 16px;border-radius:99px;border:1px solid #f5c469;background:transparent;color:#fff;font-size:15px;cursor:pointer}button:hover{background:#f5c46922}button[aria-busy=true]{opacity:.5}
select,input{min-height:44px;background:#15172b;color:#fff;border:1px solid #ffffff33;padding:0 10px;border-radius:6px;font-size:15px}input{width:100%;box-sizing:border-box}
.msg{color:#ff9f1c;min-height:1.5em}</style></head><body>
<h1>Kevin voice lab</h1><p>Play the same lines in each voice. Tell Claude the name you like and it will be set on the server.</p>
<p><label>Speed <select id="rate"><option value="-10%">Slower</option><option value="-4%" selected>Kevin's setting</option><option value="0%">Normal</option><option value="+6%">Quicker</option></select></label></p>
<p class="msg" id="msg" role="status"></p>${rows}
<section><h2>Your own words</h2><p>Spoken in each English voice's accent when you press a voice's button below.</p>
<input id="own" maxlength="200" placeholder="Type a sentence (200 characters at most)"><div class="row" id="ownrow"></div></section>
<script>
const msg=document.getElementById('msg'),rate=document.getElementById('rate'),own=document.getElementById('own');let audio;
async function play(btn,voice,text){msg.textContent='';btn.setAttribute('aria-busy','true');
 try{const r=await fetch('/api/admin/voice-lab/sample?voice='+encodeURIComponent(voice)+'&rate='+encodeURIComponent(rate.value)+'&text='+encodeURIComponent(text),{credentials:'same-origin'});
 if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.message||('Error '+r.status))}
 const url=URL.createObjectURL(await r.blob());if(audio){audio.pause()}audio=new Audio(url);await audio.play()}catch(e){msg.textContent=e.message}finally{btn.removeAttribute('aria-busy')}}
document.querySelectorAll('button[data-voice]').forEach(b=>b.addEventListener('click',()=>play(b,b.dataset.voice,b.dataset.text)));
const ids=${JSON.stringify(LAB_VOICES.map((v) => ({ id: v.id, label: v.label })))};
const ownrow=document.getElementById('ownrow');ids.forEach(v=>{const b=document.createElement('button');b.type='button';b.textContent='▶ '+v.label;b.addEventListener('click',()=>{if(own.value.trim())play(b,v.id,own.value.trim());else msg.textContent='Type a sentence first.'});ownrow.appendChild(b)});
</script></body></html>`
}

export function registerVoiceLabRoutes(app: Express): void {
    app.get('/admin/voice-lab', (req: Request, res: Response) => {
        const user = req.isAuthenticated?.() ? (req.user as { role?: string }) : null
        res.set('Cache-Control', 'no-store')
        if (user?.role !== 'admin') {
            return res.status(401).type('html').send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><body style="font:16px system-ui;padding:24px"><p>Sign in to the site as an administrator, then open this page again.</p><p><a href="/auth">Sign in</a></p>')
        }
        res.type('html').send(labPage({ english: azureVoiceFor('en'), swahili: azureVoiceFor('sw') }))
    })

    app.get('/api/admin/voice-lab/sample', requireStrictAdmin, async (req: Request, res: Response) => {
        try {
            const voice = String(req.query.voice ?? '')
            const text = String(req.query.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
            const rate = RATES.has(String(req.query.rate ?? '')) ? String(req.query.rate) : '-4%'
            if (!ALLOWED.has(voice)) return res.status(400).json({ message: 'That voice is not in the lab.' })
            if (!text) return res.status(400).json({ message: 'There is nothing to say.' })
            if (!azureConfigured()) return res.status(501).json({ message: 'Azure speech is not set up on the server.' })
            const key = `${voice}|${rate}|${text}`
            let clip = cache.get(key)
            if (!clip) {
                if (!azureTtsHasRoom(text.length)) return res.status(429).json({ message: "This month's speech allowance is used up." })
                clip = await azureSpeakWith(text, voice, rate)
                if (cache.size > 200) cache.clear()
                cache.set(key, clip)
            }
            res.set({ 'Content-Type': clip.type, 'Cache-Control': 'private, max-age=3600', 'X-Kevin-Voice': voice }).send(clip.data)
        } catch (err) {
            console.error('[voice-lab] sample failed:', err)
            res.status(502).json({ message: 'Azure could not speak that. Try again in a moment.' })
        }
    })
}
