import { useEffect, useState } from "react";

export type UseEventStreamInput = {
  url: string;
};

export type UseEventStreamResult<T> = {
  events: T[];
  status: "connecting" | "open" | "error" | "closed";
};

export function useEventStream<T = unknown>(input: UseEventStreamInput): UseEventStreamResult<T> {
  const [events, setEvents] = useState<T[]>([]);
  const [status, setStatus] = useState<UseEventStreamResult<T>["status"]>("connecting");

  useEffect(() => {
    if (!input.url) {
      setStatus("closed");
      return;
    }
    const es = new EventSource(input.url);
    const onOpen = () => setStatus("open");
    const onError = () => setStatus("error");
    const onMessage = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as T;
        setEvents((prev) => [...prev, parsed]);
      } catch {
        /* ignore unparseable */
      }
    };
    es.addEventListener("open", onOpen);
    es.addEventListener("error", onError);
    es.addEventListener("message", onMessage);
    return () => {
      es.close();
      setStatus("closed");
    };
  }, [input.url]);

  return { events, status };
}
