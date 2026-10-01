import type { KevinLanguage } from './kevinLanguages'
import { AUDIENCE_LABELS, type Audience } from '@shared/kevin-audience'

/**
 * Kevin as a personal assistant: what he says when someone opens him from the sign-up screen, or has just signed up,
 * and the four "who are you" choices. Written for English, Kiswahili and French; other languages see English
 * for these few lines while Kevin's own answers come in their language.
 */
export interface AssistantText {
  signupWelcome: string
  welcomeBack: (name: string) => string
  audienceQuestion: string
  urgentButton: string
  urgentBanner: string
  callFirst: string
}

const EN: AssistantText = {
  signupWelcome: "Hello, I'm Kevin, your personal assistant at RealEVR Estates. I'll be with you all the way, from signing up to finding, listing or sponsoring a property. You can talk to me or type, whichever is easier.",
  welcomeBack: (n) => `Welcome, ${n}. I'm Kevin, your personal assistant, and I'm here whenever you need me.`,
  audienceQuestion: 'What brings you here? Tap the one that fits you best.',
  urgentButton: 'Message the team on WhatsApp now',
  urgentBanner: 'This looks urgent. A person is being told right now.',
  callFirst: 'If anyone is in danger, call your local emergency number first (112 works on most phones; 999 in Uganda).',
}

const SW: AssistantText = {
  signupWelcome: 'Habari, mimi ni Kevin, msaidizi wako binafsi wa RealEVR Estates. Nitakuwa nawe hadi mwisho, kuanzia kujisajili hadi kutafuta, kuorodhesha au kudhamini mali. Unaweza kuzungumza nami au kuandika.',
  welcomeBack: (n) => `Karibu, ${n}. Mimi ni Kevin, msaidizi wako binafsi, niko hapa kila unaponihitaji.`,
  audienceQuestion: 'Umekuja kwa shughuli gani? Gusa inayokufaa zaidi.',
  urgentButton: 'Andikia timu WhatsApp sasa',
  urgentBanner: 'Hili linaonekana la haraka. Mtu anajulishwa sasa hivi.',
  callFirst: 'Kama mtu yuko hatarini, piga simu ya dharura kwanza (112 kwenye simu nyingi; 999 nchini Uganda).',
}

const FR: AssistantText = {
  signupWelcome: "Bonjour, je suis Kevin, votre assistant personnel chez RealEVR Estates. Je reste avec vous jusqu'au bout, de l'inscription à la recherche, la publication ou le parrainage d'un bien. Parlez-moi ou écrivez, comme vous préférez.",
  welcomeBack: (n) => `Bienvenue, ${n}. Je suis Kevin, votre assistant personnel, à votre disposition quand vous voulez.`,
  audienceQuestion: 'Pourquoi êtes-vous ici ? Touchez ce qui vous correspond le mieux.',
  urgentButton: "Écrire à l'équipe sur WhatsApp maintenant",
  urgentBanner: 'Cela semble urgent. Une personne est prévenue à l’instant.',
  callFirst: "Si quelqu'un est en danger, appelez d'abord le numéro d'urgence local (le 112 fonctionne sur la plupart des téléphones).",
}

export function assistantFor(lang: KevinLanguage | null): AssistantText {
  return lang?.code === 'sw' ? SW : lang?.code === 'fr' ? FR : EN
}

export function audienceLabel(a: Audience, lang: KevinLanguage | null): string {
  const set = AUDIENCE_LABELS[a]
  return lang?.code === 'sw' ? set.sw : lang?.code === 'fr' ? set.fr : set.en
}
