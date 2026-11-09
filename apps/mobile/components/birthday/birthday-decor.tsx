import { birthdaySplashKey, getDeviceFlag, setDeviceFlag } from "@us/shared";
import { useBirthday } from "@us/shared/react";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Ellipse, Path } from "react-native-svg";
import { Confetti } from "../games/confetti";
import { Display, Text } from "../ui/text";

const COLOURS = ["#E46B8A", "#F3B33D", "#3FA6A0", "#8E6BB8", "#7FB069"];

/**
 * The birthday look over the whole app, on the day only (or while the maker
 * previews it on this device): bunting along the top, balloons drifting up
 * now and then, and a welcome the first time the birthday person opens the
 * app. None of it takes a touch away from what's underneath.
 */
export function BirthdayDecor() {
  const b = useBirthday();
  if (!b.festive || !b.room) return null;
  return (
    <>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <RisingBalloons />
        <Bunting />
      </View>
      {!b.maker || b.preview ? (
        <Welcome
          name={b.room.name}
          splashKey={
            birthdaySplashKey(b.room.id) + (b.preview ? ":preview" : "")
          }
        />
      ) : null}
    </>
  );
}

function Bunting() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const flags = Math.max(10, Math.round(width / 26));
  return (
    <View
      style={{
        position: "absolute",
        top: insets.top,
        left: 0,
        right: 0,
        height: 26,
      }}
    >
      <Svg width={width} height={14} style={{ position: "absolute", top: 0 }}>
        <Path
          d={`M0 2 Q ${width / 2} 12 ${width} 2`}
          stroke="#B9A4C9"
          strokeWidth={1.2}
          fill="none"
        />
      </Svg>
      {Array.from({ length: flags }, (_, i) => {
        const x = (i + 0.5) * (width / flags);
        const sag = Math.sin((i / (flags - 1)) * Math.PI) * 5;
        return (
          <Flag
            key={i}
            x={x}
            top={2 + sag}
            colour={COLOURS[i % COLOURS.length]!}
            delay={(i % 5) * 200}
          />
        );
      })}
    </View>
  );
}

function Flag({
  x,
  top,
  colour,
  delay,
}: {
  x: number;
  top: number;
  colour: string;
  delay: number;
}) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    );
  }, [t, delay, reduced]);
  // Swing from the string, not the middle.
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -7 },
      { rotate: `${(t.value - 0.5) * 10}deg` },
      { translateY: 7 },
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: x - 7,
          top,
          width: 0,
          height: 0,
          borderLeftWidth: 7,
          borderRightWidth: 7,
          borderTopWidth: 14,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderTopColor: colour,
        },
        style,
      ]}
    />
  );
}

interface Rising {
  id: number;
  x: number;
  colour: string;
  size: number;
  duration: number;
}

function RisingBalloons() {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const [balloons, setBalloons] = useState<Rising[]>([]);
  useEffect(() => {
    if (reduced) return;
    let n = 0;
    const launch = (count: number) =>
      setBalloons((prev) => [
        ...prev.slice(-6),
        ...Array.from({ length: count }, () => ({
          id: n++,
          x: width * (0.04 + Math.random() * 0.82),
          colour: COLOURS[Math.floor(Math.random() * COLOURS.length)]!,
          size: 30 + Math.random() * 18,
          duration: 11_000 + Math.random() * 6000,
        })),
      ]);
    launch(3);
    const t = setInterval(() => launch(1 + Math.round(Math.random())), 25_000);
    return () => clearInterval(t);
  }, [reduced, width]);
  if (reduced) return null;
  return (
    <>
      {balloons.map((b) => (
        <RisingBalloon key={b.id} balloon={b} />
      ))}
    </>
  );
}

function RisingBalloon({
  balloon,
  delay = 0,
}: {
  balloon: Rising;
  delay?: number;
}) {
  const { height } = useWindowDimensions();
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withTiming(1, { duration: balloon.duration, easing: Easing.linear }),
    );
  }, [t, balloon.duration, delay]);
  const style = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: height + 20 - t.value * (height + balloon.size * 2.4 + 60),
      },
      { translateX: Math.sin(t.value * Math.PI * 3) * 12 },
    ],
  }));
  return (
    <Animated.View
      style={[
        { position: "absolute", top: 0, left: balloon.x, opacity: 0.9 },
        style,
      ]}
    >
      <Balloon colour={balloon.colour} size={balloon.size} />
    </Animated.View>
  );
}

function Balloon({ colour, size }: { colour: string; size: number }) {
  return (
    <Svg width={size} height={size * 2.1} viewBox="0 0 40 84">
      <Ellipse cx={20} cy={20} rx={16} ry={19} fill={colour} />
      <Ellipse cx={14} cy={13} rx={4} ry={6} fill="white" opacity={0.35} />
      <Path d="M17 38 L23 38 L20 42 Z" fill={colour} />
      <Path
        d="M20 42 C 15 52, 25 60, 20 70 S 18 80, 20 84"
        stroke="#9A8AA8"
        strokeWidth={1}
        fill="none"
      />
    </Svg>
  );
}

/** The first time she opens the app on the day, once per device. */
function Welcome({ name, splashKey }: { name: string; splashKey: string }) {
  const { width } = useWindowDimensions();
  const [show, setShow] = useState(false);
  useEffect(() => setShow(!getDeviceFlag(splashKey)), [splashKey]);
  if (!show) return null;
  const close = () => {
    setDeviceFlag(splashKey, true);
    setShow(false);
  };
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View className="flex-1 items-center justify-center overflow-hidden bg-plum-900 px-6">
        <View
          pointerEvents="none"
          className="absolute -left-16 -top-20 h-72 w-72 rounded-full bg-rose-500 opacity-40"
        />
        <View
          pointerEvents="none"
          className="absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-teal-500 opacity-30"
        />
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {COLOURS.concat(COLOURS).map((colour, i) => (
            <RisingBalloon
              key={i}
              delay={i * 250}
              balloon={{
                id: i,
                x: width * (0.04 + i * 0.095),
                colour,
                size: 40 + (i % 3) * 9,
                duration: 6000 + (i % 4) * 1000,
              }}
            />
          ))}
        </View>
        <Animated.Text
          entering={ZoomIn.delay(400).springify()}
          style={{ fontSize: 56, lineHeight: 66 }}
        >
          🎂
        </Animated.Text>
        <Animated.View entering={FadeIn.delay(800).duration(600)}>
          <Display className="mt-4 text-center text-[38px] leading-[46px] text-paper">{`Happy Birthday, ${name} ✨`}</Display>
        </Animated.View>
        <Animated.View entering={FadeIn.delay(1400)}>
          <Text className="mt-3 max-w-sm text-center text-body text-plum-200">
            Today the whole app is dressed up for you. Something’s waiting
            inside…
          </Text>
        </Animated.View>
        <Animated.View
          entering={FadeIn.delay(1800)}
          className="mt-8 items-center gap-3"
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              close();
              router.push("/birthday");
            }}
            className="rounded-full bg-gold-300 px-6 py-3 active:opacity-80"
          >
            <Text className="font-sans-semibold text-body text-plum-900">
              Open your celebration
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={close}
            className="px-4 py-2 active:opacity-70"
          >
            <Text className="text-small text-plum-200">Later</Text>
          </Pressable>
        </Animated.View>
        <Confetti pieces={70} />
      </View>
    </Modal>
  );
}
