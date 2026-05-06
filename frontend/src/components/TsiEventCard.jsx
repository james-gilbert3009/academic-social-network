export default function TsiEventCard({ item }) {
  const title = item?.title || "TSI Announcement";
  const date = item?.date || "";
  const excerpt = item?.excerpt || "";
  const url = item?.url || "https://tsi.lv/news-events/";
  const imageUrl = typeof item?.imageUrl === "string" ? item.imageUrl.trim() : "";

  return (
    <article className="card tsiEventCard">
      {imageUrl ? (
        <a className="tsiEventCard__mediaLink" href={url} target="_blank" rel="noreferrer">
          <div className="tsiEventCard__media">
            <img
              src={imageUrl}
              alt=""
              className="tsiEventCard__img"
              loading="lazy"
              decoding="async"
            />
          </div>
        </a>
      ) : null}

      {date ? (
        <div className="tsiEventCard__meta">
          <span className="tsiEventDate">{date}</span>
        </div>
      ) : null}

      <h3 className="tsiEventTitle">{title}</h3>

      {excerpt ? <p className="tsiEventExcerpt">{excerpt}</p> : null}

      <div className="tsiEventActions">
        <a
          className="primary-button btn-compact tsiEventCta"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          Read more
        </a>
      </div>
    </article>
  );
}

