import { useEffect, useMemo, useRef, useState } from 'react';
import { notifyPartner } from '../api/push';
import { getSpark, sparkState, SPARK_TOPIC, type SparkData, type SparkState } from '../api/spark';
import { useCouple } from './couple-provider';
import { useCoupleData, type CoupleData } from './use-couple-data';

/** Sparks I just earned, for the little "+8" that floats off the rank chip. */
export interface SparkGain {
  /** Changes with every gain, so the float replays. */
  id: number;
  sparks: number;
  firstMove: boolean;
}

/**
 * Our Spark Rank, kept live: the season row changes with every award by
 * either of us, and open apps follow it over Realtime.
 */
export function useSpark(): CoupleData<SparkData> & { state: SparkState | undefined; gain: SparkGain | null } {
  const { sb, couple, me, channel } = useCouple();
  const spark = useCoupleData(SPARK_TOPIC, () => getSpark(sb, couple.id, couple.user_a_id), [sb, couple.id, couple.user_a_id]);

  const { reload } = spark;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    // One action can award several things at once; reload after they land.
    const soon = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void reload(), 400);
    };
    const off = channel.sparks.on(soon);
    // A new day (and month) begins on the couple's clock.
    const tick = setInterval(() => void reload(), 15 * 60_000);
    return () => {
      off();
      clearInterval(tick);
      clearTimeout(timer.current);
    };
  }, [channel, reload]);

  const state = useMemo(() => (spark.data ? sparkState(spark.data) : undefined), [spark.data]);

  // What changed since the last load, from my side.
  const [gain, setGain] = useState<SparkGain | null>(null);
  const prev = useRef<SparkState | undefined>(undefined);
  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (!state || !before || before.season !== state.season) return;
    const earned = state.mine.season - before.mine.season;
    if (earned > 0) setGain({ id: Date.now(), sparks: earned, firstMove: state.mine.firstMoves > before.mine.firstMoves });
    // We just ranked up, and I did it: tell my partner. The server sends it
    // once per rank however many of our apps ask.
    const mineRecently = spark.data?.mine.some((e) => e.user_id === me.id && Date.now() - Date.parse(e.created_at) < 2 * 60_000);
    if (state.rank.division.index > before.rank.division.index && mineRecently) {
      void notifyPartner(sb, { category: 'spark_rank' });
    }
  }, [state, spark.data, sb, me.id]);

  return { ...spark, state, gain };
}
