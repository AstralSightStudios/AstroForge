import {
  Fragment,
  Text,
  View,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "@astralsight/astroforge-core";

export default function SplashPage() {
  const [count, setCount] = useState(() => 3);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const label = useMemo(() => `count:${count}`, [count]);
  const tick = useCallback(() => {
    setCount((prev) => {
      return prev - 1;
    });
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(() => tick(), 16);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <Fragment>
      <View onClick={tick}>
        <Text>{label}</Text>
        <Text>{count > 0 ? "Ready" : "Done"}</Text>
      </View>
    </Fragment>
  );
}
