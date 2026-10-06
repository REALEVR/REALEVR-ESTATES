/**
 * The Meta (WhatsApp, Facebook, Instagram) Graph API version the server calls. Meta retires each version about two years after
 * it is released, and a retired one fails in confusing ways ("Unsupported request"), so it is set in one place and can be
 * changed without a code change: META_GRAPH_VERSION=v24.0.
 */
export const graphBase = (): string => `https://graph.facebook.com/${(process.env.META_GRAPH_VERSION || 'v23.0').trim()}`
