import { useEffect, useState } from "react";

import { japanDate } from "./upcoming-calendar";

export const useJapanDate = () => {
  const [date, setDate] = useState(japanDate);
  useEffect(() => {
    const interval = window.setInterval(() => setDate(japanDate()), 60_000);
    const updateDate = () => setDate(japanDate());
    window.addEventListener("focus", updateDate);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", updateDate);
    };
  }, []);
  return date;
};
