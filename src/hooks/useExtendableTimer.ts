import { useRef, useEffect } from "react";


export const useExtendableTimeout = () => {
  const timerRef = useRef<number>(0);

  const setTimeout = (callback: () => void, interval: number) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      callback();
    }, interval);
  };
  const clearTimeout = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }

  useEffect(() => {
    // アンマウント時のクリーンアップ
    return () => window.clearTimeout(timerRef.current);
  }, []);

  return [setTimeout, clearTimeout];
};