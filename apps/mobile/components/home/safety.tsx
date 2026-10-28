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
import * as Haptics from 'expo-haptics';
import { Home as HomeIcon, MapPin, Navigation } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking, Pressable, View } from 'react-native';
import { ErrorNote } from '../module-screen';
import { Button } from '../ui/button';
import { usePalette } from '../ui/palette';
import { PrivacyBadge } from '../ui/privacy';
import { Sheet } from '../ui/sheet';
import { Display, Text } from '../ui/text';
import { currentPosition, getHomeSpot, quietPosition, setHomeSpot, watchPosition } from '@/lib/geo';

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const placeOf = (c: Pick<ArrivalCheck, 'label'>) => (c.label === 'home' ? 'home' : `to ${c.label}`);

/** "Let me know when you're home" and opt-in, time-boxed location sharing. */
export function SafetyCard() {
  const { sb, couple, me, partner } = useCouple();
  const c = usePalette();
  const safety = useCoupleData(
    LOCATION_TOPIC,
    async () => {
      const [locations, checks] = await Promise.all([getLocations(sb, me.id), listArrivalChecks(sb, couple.id)]);
      return { ...locations, checks };
    },
    [sb, me.id, couple.id],
    undefined,
    // Where we are stays off the disk.
    'memory',
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [homeSpot, setHomeSpotState] = useState<Coords | null>(null);
  const [here, setHere] = useState<Coords | null>(null);
  useEffect(() => void getHomeSpot().then(setHomeSpotState), []);

  const d = safety.data;
  const sharingMine = isSharing(d?.mine);
  const open = d?.checks.filter(isOpenCheck) ?? [];
  const myTrip = open.find((x) => x.traveller_id === me.id);
  const theirTrip = open.find((x) => x.traveller_id === partner.id);
  const lastArrival = d?.checks.find((x) => x.arrived_at);

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

  // While I'm sharing and the app is open, keep my position fresh (the watch itself throttles to ~1/min or 100 m).
  const lastSent = useRef(0);
  useEffect(() => {
    if (!sharingMine) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void watchPosition((pos) => {
      setHere(pos);
      if (Date.now() - lastSent.current < 45_000) return;
      lastSent.current = Date.now();
      void safety.mutate(() => updateMyLocation(sb, me.id, pos)).catch(() => {});
    }).then((s) => (cancelled ? s() : (stop = s)));
    return () => {
      cancelled = true;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharingMine, sb, me.id]);

  // On my way home with a saved home spot: each time Us comes to the front, check if I've arrived.
  useEffect(() => {
    if (!myTrip || !homeSpot) return;
    const check = async () => {
      const pos = await quietPosition();
      if (pos) setHere(pos);
      if (shouldAutoArrive(myTrip, me.id, pos, homeSpot)) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        void run('arrive', () => markArrived(sb, myTrip.id));
      }
    };
    void check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void check());
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTrip?.id, homeSpot, me.id, sb]);

  const theirCoords = d?.theirs?.lat != null && d.theirs.lng != null ? { lat: d.theirs.lat, lng: d.theirs.lng } : null;
  const myCoords = here ?? (d?.mine?.lat != null && d.mine.lng != null ? { lat: d.mine.lat, lng: d.mine.lng } : null);

  return (
    <Sheet className="gap-4">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <HomeIcon size={18} color={c.onTeal} />
          <Display className="text-heading">Safe home</Display>
        </View>
        <PrivacyBadge privacy="shared" partnerName={partner.display_name} />
      </View>

      {theirTrip ? (
        <Row text={`Waiting for ${partner.display_name} to get ${placeOf(theirTrip)}.`} detail={`Since ${clock(theirTrip.created_at)}`}>
          <Button size="sm" variant="quiet" loading={busy === 'cancel-theirs'} onPress={() => void run('cancel-theirs', () => cancelArrival(sb, theirTrip.id))}>
            Call it off
          </Button>
        </Row>
      ) : null}
      {myTrip ? (
        <Row
          text={
            myTrip.requested_by === me.id
              ? `You said you’d let ${partner.display_name} know when you get ${placeOf(myTrip)}.`
              : `${partner.display_name} asked you to let them know when you get ${placeOf(myTrip)}.`
          }
          detail={homeSpot ? 'When you open Us back at your home spot, it tells them for you.' : undefined}
        >
          <View className="flex-row gap-2">
            <Button size="sm" loading={busy === 'arrive'} onPress={() => void run('arrive', () => markArrived(sb, myTrip.id))}>
              I’m home
            </Button>
            <Button size="sm" variant="quiet" disabled={!!busy} onPress={() => void run('cancel-mine', () => cancelArrival(sb, myTrip.id))}>
              Cancel
            </Button>
          </View>
        </Row>
      ) : null}
      {!theirTrip && !myTrip ? (
        <View className="gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'ask'}
            onPress={() => void run('ask', () => requestArrival(sb, { couple_id: couple.id, requested_by: me.id, traveller_id: partner.id }))}
          >
            {`Ask ${partner.display_name} to say when they’re home`}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'offer'}
            onPress={() => void run('offer', () => requestArrival(sb, { couple_id: couple.id, requested_by: me.id, traveller_id: me.id }))}
          >
            {`I’ll tell ${partner.display_name} when I’m home`}
          </Button>
        </View>
      ) : null}
      {lastArrival?.arrived_at && !theirTrip && !myTrip ? (
        <Text className="text-small text-sage-700">
          {`${lastArrival.traveller_id === me.id ? 'You' : partner.display_name} got ${placeOf(lastArrival)} safe · ${timeAgo(lastArrival.arrived_at)}`}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={async () => {
          if (homeSpot) {
            await setHomeSpot(null);
            return setHomeSpotState(null);
          }
          try {
            const pos = await currentPosition();
            await setHomeSpot(pos);
            setHomeSpotState(pos);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <Text className="text-micro text-ink-muted underline">
          {homeSpot ? 'Home spot saved on this phone only. Tap to forget it.' : 'At home now? Tap to save this spot as home, so “I’m home” can happen on its own. It stays on this phone.'}
        </Text>
      </Pressable>

      <View className="h-px bg-paper-edge" />

      {isSharing(d?.theirs) && theirCoords ? (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(mapsUrl(theirCoords))} className="flex-row items-center gap-2 rounded-control bg-teal-50 px-4 py-3">
          <MapPin size={16} color={c.onTeal} />
          <Text className="flex-1 text-small">
            {`${partner.display_name} is sharing their location`}
            {d?.theirs?.updated_at ? ` · ${timeAgo(d.theirs.updated_at)}` : ''}
            {myCoords ? ` · ${describeDistance(distanceMeters(myCoords, theirCoords))} away` : ''}
          </Text>
          <Text className="font-sans-medium text-small text-teal-700">Map</Text>
        </Pressable>
      ) : null}

      {sharingMine ? (
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <Navigation size={16} color={c.roseStrong} />
            <Text className="flex-1 text-small">{`You’re sharing your location until ${clock(d!.mine!.sharing_until!)}. It updates while Us is open.`}</Text>
          </View>
          <Button size="sm" variant="secondary" className="self-start" loading={busy === 'stop'} onPress={() => void run('stop', () => stopSharing(sb, me.id))}>
            Stop sharing
          </Button>
        </View>
      ) : (
        <View className="gap-2">
          <Text className="text-small text-ink-soft">Share my location for</Text>
          <View className="flex-row gap-2">
            {SHARE_DURATIONS.map((o) => (
              <Button
                key={o.hours}
                size="sm"
                variant="secondary"
                className="flex-1"
                loading={busy === `share-${o.hours}`}
                disabled={!!busy}
                onPress={() =>
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
          </View>
        </View>
      )}

      {error || safety.error ? <ErrorNote>{error ?? safety.error}</ErrorNote> : null}
    </Sheet>
  );
}

function Row({ text, detail, children }: { text: string; detail?: string; children: ReactNode }) {
  return (
    <View className="gap-2 rounded-control bg-paper-sunken px-4 py-3">
      <Text className="text-small">{text}</Text>
      {detail ? <Text className="text-micro text-ink-muted">{detail}</Text> : null}
      {children}
    </View>
  );
}
