'use client';

import {
  cancelArrival,
  describeDistance,
  distanceMeters,
  getLocations,
  isOpenCheck,
  isSharing,
  listArrivalChecks,
  LOCATION_TOPIC,
  mapsUrl,
  markArrived,
  requestArrival,
  SHARE_DURATIONS,
  shouldAutoArrive,
  startSharing,
  stopSharing,
  timeAgo,
  updateMyLocation,
  type ArrivalCheck,
  type Coords,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { Home as HomeIcon, MapPin, Navigation } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Sheet } from '@/components/ui/sheet';
import { currentPosition, getHomeSpot, locationAllowed, setHomeSpot } from '@/lib/geo';

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** "Let me know when you're home" and opt-in, time-boxed location sharing. */
export function SafetyCard() {
  const { sb, couple, me, partner } = useCouple();
  const safety = useCoupleData(
    LOCATION_TOPIC,
    async () => {
      const [locations, checks] = await Promise.all([getLocations(sb, me.id), listArrivalChecks(sb, couple.id)]);
      return { ...locations, checks };
    },
    [sb, me.id, couple.id],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [homeSpot, setHomeSpotState] = useState<Coords | null>(null);
  const [here, setHere] = useState<Coords | null>(null);
  useEffect(() => setHomeSpotState(getHomeSpot()), []);

  const d = safety.data;
  const sharingMine = isSharing(d?.mine);
  const open = d?.checks.filter(isOpenCheck) ?? [];
  const myTrip = open.find((c) => c.traveller_id === me.id);
  const theirTrip = open.find((c) => c.traveller_id === partner.id);
  const lastArrival = d?.checks.find((c) => c.arrived_at);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await safety.mutate(fn);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // While I'm sharing and this tab is open, keep my position fresh (at most once a minute).
  const lastSent = useRef(0);
  useEffect(() => {
    if (!sharingMine || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const c = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        setHere(c);
        if (Date.now() - lastSent.current < 60_000) return;
        lastSent.current = Date.now();
        void safety.mutate(() => updateMyLocation(sb, me.id, c)).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharingMine, sb, me.id]);

  // On my way home with a saved home spot: mark me arrived once I'm there.
  // Only checks when the browser already allows location, so it never prompts.
  useEffect(() => {
    if (!myTrip || !homeSpot) return;
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== 'visible' || !(await locationAllowed())) return;
      const pos = await currentPosition().catch(() => null);
      setHere(pos);
      if (!stopped && shouldAutoArrive(myTrip, me.id, pos, homeSpot)) void run('arrive', () => markArrived(sb, myTrip.id));
    };
    void check();
    const t = setInterval(check, 2 * 60_000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTrip?.id, homeSpot, me.id, sb]);

  const theirCoords = d?.theirs?.lat != null && d.theirs.lng != null ? { lat: d.theirs.lat, lng: d.theirs.lng } : null;
  const myCoords = here ?? (d?.mine?.lat != null && d.mine.lng != null ? { lat: d.mine.lat, lng: d.mine.lng } : null);

  return (
    <Sheet pad="md" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-heading text-ink">
          <HomeIcon className="h-5 w-5 text-teal-700" aria-hidden /> Safe home
        </h2>
        <PrivacyBadge privacy="shared" partnerName={partner.display_name} compact />
      </div>

      {/* Arrival checks */}
      <div className="space-y-3">
        {theirTrip ? (
          <ArrivalRow
            text={`Waiting for ${partner.display_name} to get ${placeOf(theirTrip)}.`}
            detail={`Since ${clock(theirTrip.created_at)}`}
            action={
              <Button size="sm" variant="quiet" loading={busy === 'cancel-theirs'} onClick={() => void run('cancel-theirs', () => cancelArrival(sb, theirTrip.id))}>
                Call it off
              </Button>
            }
          />
        ) : null}
        {myTrip ? (
          <ArrivalRow
            text={
              myTrip.requested_by === me.id
                ? `You said you’d let ${partner.display_name} know when you get ${placeOf(myTrip)}.`
                : `${partner.display_name} asked you to let them know when you get ${placeOf(myTrip)}.`
            }
            detail={homeSpot ? 'This device will tell them automatically when you’re back at your home spot.' : undefined}
            action={
              <span className="flex gap-2">
                <Button size="sm" loading={busy === 'arrive'} onClick={() => void run('arrive', () => markArrived(sb, myTrip.id))}>
                  I’m home
                </Button>
                <Button size="sm" variant="quiet" disabled={!!busy} onClick={() => void run('cancel-mine', () => cancelArrival(sb, myTrip.id))}>
                  Cancel
                </Button>
              </span>
            }
          />
        ) : null}
        {!theirTrip && !myTrip ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'ask'}
              onClick={() => void run('ask', () => requestArrival(sb, { couple_id: couple.id, requested_by: me.id, traveller_id: partner.id }))}
            >
              Ask {partner.display_name} to tell me when they’re home
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'offer'}
              onClick={() => void run('offer', () => requestArrival(sb, { couple_id: couple.id, requested_by: me.id, traveller_id: me.id }))}
            >
              I’ll tell {partner.display_name} when I’m home
            </Button>
          </div>
        ) : null}
        {lastArrival?.arrived_at && !theirTrip && !myTrip ? (
          <p className="text-small text-sage-700">
            {lastArrival.traveller_id === me.id ? 'You' : partner.display_name} got {placeOf(lastArrival)} safe · {timeAgo(lastArrival.arrived_at)}
          </p>
        ) : null}
        <p className="text-micro text-ink-muted">
          {homeSpot ? (
            <>
              Home spot saved on this device only.{' '}
              <button className="underline underline-offset-2" onClick={() => (setHomeSpot(null), setHomeSpotState(null))}>
                Forget it
              </button>
            </>
          ) : (
            <>
              At home now?{' '}
              <button
                className="underline underline-offset-2"
                onClick={async () => {
                  try {
                    const pos = await currentPosition();
                    setHomeSpot(pos);
                    setHomeSpotState(pos);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Save this spot as home
              </button>{' '}
              so “I’m home” can happen on its own. It stays on this device.
            </>
          )}
        </p>
      </div>

      <div className="h-px bg-paper-edge" />

      {/* Location sharing */}
      <div className="space-y-3">
        {isSharing(d?.theirs) && theirCoords ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-teal-50 px-4 py-3">
            <p className="flex items-center gap-2 text-small text-ink">
              <MapPin className="h-4 w-4 text-teal-700" aria-hidden />
              <span>
                <span className="font-medium">{partner.display_name}</span> is sharing their location
                {d?.theirs?.updated_at ? ` · updated ${timeAgo(d.theirs.updated_at)}` : ''}
                {myCoords ? ` · ${describeDistance(distanceMeters(myCoords, theirCoords))} from you` : ''}
              </span>
            </p>
            <a href={mapsUrl(theirCoords)} target="_blank" rel="noreferrer" className="text-small font-medium text-teal-700 underline underline-offset-2">
              Open in Maps
            </a>
          </div>
        ) : null}

        {sharingMine ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-small text-ink">
              <Navigation className="h-4 w-4 text-rose-700" aria-hidden />
              You’re sharing your location until {clock(d!.mine!.sharing_until!)}. It updates while Us is open.
            </p>
            <Button size="sm" variant="secondary" loading={busy === 'stop'} onClick={() => void run('stop', () => stopSharing(sb, me.id))}>
              Stop sharing
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-small text-ink-soft">Share my location for</span>
            {SHARE_DURATIONS.map((o) => (
              <Button
                key={o.hours}
                size="sm"
                variant="secondary"
                loading={busy === `share-${o.hours}`}
                disabled={!!busy}
                onClick={() =>
                  void run(`share-${o.hours}`, async () => {
                    const pos = await currentPosition();
                    setHere(pos);
                    await startSharing(sb, { meId: me.id, coupleId: couple.id }, pos, o.hours);
                  })
                }
              >
                {o.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {error || safety.error ? <ErrorNote>{error ?? safety.error}</ErrorNote> : null}
    </Sheet>
  );
}

const placeOf = (c: Pick<ArrivalCheck, 'label'>) => (c.label === 'home' ? 'home' : `to ${c.label}`);

function ArrivalRow({ text, detail, action }: { text: string; detail?: string; action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-paper-sunken px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-small text-ink">{text}</p>
        {detail ? <p className="mt-0.5 text-micro text-ink-muted">{detail}</p> : null}
      </div>
      {action}
    </div>
  );
}
