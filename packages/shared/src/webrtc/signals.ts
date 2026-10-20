import type { CallMedia } from '../database.types';

export interface MediaState {
  mic: boolean;
  camera: boolean;
  screen: boolean;
}

/**
 * WebRTC signaling vocabulary, carried over the couple's private Realtime
 * broadcast channel. Every event names the call it belongs to.
 *
 *   caller                          callee
 *   ── invite ──────────────────────▶   (ring; push sent in parallel)
 *   ◀────────────────────── accept ──   (or decline)
 *   ── sdp(offer) ──────────────────▶
 *   ◀──────────────────── sdp(answer)
 *   ◀── ice ──────────────────── ice ─▶ (trickle, both ways)
 *   ◀── media-state ── media-state ──▶ (mic / camera / screen flags)
 *   ── hangup ─────────────────────▶   (either side)
 *   ── cancel ─────────────────────▶   (caller gave up before answer)
 */
export type SignalEvent =
  | { type: 'invite'; callId: string; media: CallMedia }
  | { type: 'accept'; callId: string }
  | { type: 'decline'; callId: string }
  | { type: 'cancel'; callId: string }
  | { type: 'hangup'; callId: string }
  | { type: 'sdp'; callId: string; description: RTCSessionDescriptionInit }
  | { type: 'ice'; callId: string; candidate: RTCIceCandidateInit }
  | { type: 'media-state'; callId: string; state: MediaState };
