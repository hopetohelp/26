import { useEffect, useState } from "react";

const QUERY = "(pointer: coarse), (max-width: 639px)";
const read = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;

/** טלפון (מגע או מסך צר): בלי גרירה, עם כפתורים בלבד */
export function useIsPhone() {
  const [phone, setPhone] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}
