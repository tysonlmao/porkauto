import { useEffect, useState } from "react";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function useClock(tickMs = 1000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);

  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const time = `${hours}:${minutes}`;
  const weekday = WEEKDAYS[now.getDay()] ?? "Mon";
  const day = now.getDate();
  const dateLabel = `${weekday} ${day}`;

  return { now, time, dateLabel, weekday, day };
}
