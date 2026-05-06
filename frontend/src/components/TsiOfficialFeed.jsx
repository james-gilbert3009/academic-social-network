import { useEffect, useState } from "react";

import { getTsiEvents } from "../api/tsiEvents";
import TsiEventCard from "./TsiEventCard.jsx";

export default function TsiOfficialFeed() {
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setMessage("");
      try {
        const res = await getTsiEvents();
        if (cancelled) return;

        const data = res?.data;
        if (Array.isArray(data)) {
          setItems(data);
          setMessage("");
        } else if (data && typeof data === "object") {
          setItems(data.fallback || data.items || []);
          setMessage(data.message || "");
        } else {
          setItems([]);
          setMessage("");
        }
      } catch {
        if (!cancelled) {
          setItems([]);
          setMessage("TSI events are currently unavailable");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="card tsiOfficialPanel" aria-labelledby="tsi-latest-feed-heading">
      <h2 id="tsi-latest-feed-heading" className="tsiOfficialPanel__title">
        Latest from TSI
      </h2>
      <p className="muted tsiOfficialPanel__subtitle">
        Recent news and events published on tsi.lv — separate from user posts.
      </p>

      <div className="tsiOfficialScroll">
        {loading ? (
          <div className="muted tsiOfficialFeedState">Loading latest updates…</div>
        ) : null}

        {!loading && message ? (
          <div
            className={
              items.length
                ? "muted tsiOfficialFeedState tsiOfficialFeedState--soft"
                : "alert alertError tsiOfficialFeedState"
            }
            role="status"
          >
            {message}
          </div>
        ) : null}

        {!loading && !items.length && !message ? (
          <div className="muted tsiOfficialFeedState">Nothing from tsi.lv to show right now.</div>
        ) : null}

        {!loading && items.length ? (
          <ul className="tsiOfficialFeedList">
            {items.map((item) => (
              <li key={item.url} className="tsiOfficialFeedList__item">
                <TsiEventCard item={item} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
