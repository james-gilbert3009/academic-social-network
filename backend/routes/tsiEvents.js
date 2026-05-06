import express from "express";
import * as cheerio from "cheerio";

const router = express.Router();

const TSI_EVENTS_URL = "https://tsi.lv/news-events/";
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

let cache = {
  fetchedAt: 0,
  items: [],
};

function getFallbackItems() {
  return [
    {
      title: "TSI News & Events",
      url: "https://tsi.lv/news-events/",
      excerpt: "Official TSI announcements, news and upcoming events.",
      date: "",
      type: "news",
      source: "TSI",
      imageUrl: "",
    },
    {
      title: "Open Days (Future Students)",
      url: "https://tsi.lv/future-students/open-days/",
      excerpt: "Learn about upcoming open days and admissions information.",
      date: "",
      type: "event",
      source: "TSI",
      imageUrl: "",
    },
    {
      title: "Open Day (Example event page)",
      url: "https://tsi.lv/events/open-day-11/",
      excerpt: "Official TSI event details and registration information.",
      date: "",
      type: "event",
      source: "TSI",
      imageUrl: "",
    },
    {
      title: "Study at TSI",
      url: "https://tsi.lv/study-at-tsi/",
      excerpt: "Programs, faculties, and study information at TSI.",
      date: "",
      type: "news",
      source: "TSI",
      imageUrl: "",
    },
    {
      title: "Contacts",
      url: "https://tsi.lv/contacts/",
      excerpt: "Official TSI contact information.",
      date: "",
      type: "news",
      source: "TSI",
      imageUrl: "",
    },
  ];
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDate(value) {
  const raw = normalizeText(value);
  if (!raw) return "";

  // Keep it beginner-friendly: return as-is (site may use many formats).
  // Frontend just displays when present.
  return raw;
}

function inferTypeFromUrl(url) {
  const u = String(url || "").toLowerCase();
  if (u.includes("/event")) return "event";
  if (u.includes("/events")) return "event";
  return "news";
}

function uniqueByUrl(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = String(item?.url || "").trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function extractCssBackgroundImageUrl(htmlSnippet) {
  const m = String(htmlSnippet || "").match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
  return m ? m[1].trim() : "";
}

async function fetchTsiEventsFromSource() {
  const res = await fetch(TSI_EVENTS_URL, {
    headers: {
      // Basic UA helps with some simple bot protections.
      "User-Agent":
        "TSI-CONNECT/1.0 (+https://example.local) Node.js backend fetch; academic demo",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`TSI responded ${res.status}`);
    err.status = res.status;
    err.bodySnippet = text ? text.slice(0, 200) : "";
    throw err;
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const candidates = [];

  // Jet Engine listing grid (tsi.lv news/events — featured image is CSS background on card).
  $(".jet-listing-grid__item").each((_, el) => {
    const $el = $(el);
    const overlayRaw = $el.find(".jet-engine-listing-overlay-wrap").attr("data-url");
    const $link = $el.find("a.jet-listing-dynamic-link__link").first();
    const linkHref = $link.attr("href");
    const urlRaw = normalizeText(overlayRaw) || linkHref;
    if (!urlRaw) return;

    let url;
    try {
      url = new URL(urlRaw, TSI_EVENTS_URL).toString();
    } catch {
      return;
    }

    const lower = url.toLowerCase();
    if (!lower.startsWith("https://tsi.lv/")) return;

    const title = normalizeText(
      $link.find(".jet-listing-dynamic-link__label").first().text() || $link.text()
    );
    if (!title) return;

    let imageUrl = extractCssBackgroundImageUrl($.html($el));
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
      try {
        imageUrl = new URL(imageUrl, TSI_EVENTS_URL).toString();
      } catch {
        imageUrl = "";
      }
    }

    const date = normalizeDate(
      $el.find("time").attr("datetime") || $el.find("time").first().text()
    );

    const excerpt = normalizeText(
      $el.find(".elementor-widget-theme-post-excerpt").first().text() ||
        $el.find(".jet-listing-dynamic-field__content").first().text()
    );

    candidates.push({
      title,
      url,
      excerpt,
      date,
      imageUrl: imageUrl || "",
      type: inferTypeFromUrl(url),
      source: "TSI",
    });
  });

  if (candidates.length >= 3) {
    return uniqueByUrl(candidates).slice(0, 12);
  }

  // Elementor-based post listing (legacy / fallback).
  $(".elementor-post").each((_, el) => {
    const $el = $(el);
    const $a = $el.find(".elementor-post__title a[href]").first();
    const href = $a.attr("href");
    const title = normalizeText($a.text());
    const excerpt = normalizeText(
      $el.find(".elementor-post__excerpt").first().text() ||
        $el.find(".elementor-post__text p").first().text()
    );
    const date = normalizeDate(
      $el.find(".elementor-post-date").first().text() ||
        $el.find("time").attr("datetime") ||
        $el.find("time").first().text()
    );

    if (!href || !title) return;
    const url = new URL(href, TSI_EVENTS_URL).toString();
    const lower = url.toLowerCase();

    // Filter out navigational/JS links.
    if (lower.includes("elementor-action")) return;
    if (lower.endsWith("/news-events/") || lower.endsWith("/news-events/#content")) return;
    if (lower.endsWith("#") || lower.includes("/news-events/#")) return;

    let imageUrl = normalizeText($el.find(".elementor-post__thumbnail img").attr("src"));
    if (!imageUrl) {
      imageUrl = normalizeText($el.find("img").first().attr("src") || $el.find("img").first().attr("data-src"));
    }
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
      try {
        imageUrl = new URL(imageUrl, TSI_EVENTS_URL).toString();
      } catch {
        imageUrl = "";
      }
    }

    candidates.push({
      title,
      url,
      excerpt,
      date,
      imageUrl: imageUrl || "",
      type: inferTypeFromUrl(url),
      source: "TSI",
    });
  });

  if (candidates.length >= 3) {
    return uniqueByUrl(candidates).slice(0, 12);
  }

  // Try common “listing” container patterns first.
  const listingSelectors = [
    "article",
    ".views-row",
    ".node",
    ".news-item",
    ".event-item",
    ".listing-item",
  ];

  for (const sel of listingSelectors) {
    $(sel).each((_, el) => {
      const $el = $(el);
      const $a = $el.find("a[href]").first();
      const href = $a.attr("href");
      const title = normalizeText($a.text() || $el.find("h1,h2,h3").first().text());
      const excerpt = normalizeText($el.find("p").first().text());
      const date =
        normalizeDate($el.find("time").attr("datetime")) ||
        normalizeDate($el.find("time").first().text()) ||
        normalizeDate($el.find(".date,.field--name-created,.created").first().text());

      if (!href || !title) return;
      const url = new URL(href, TSI_EVENTS_URL).toString();

      candidates.push({
        title,
        url,
        excerpt,
        date,
        imageUrl: "",
        type: inferTypeFromUrl(url),
        source: "TSI",
      });
    });

    if (candidates.length >= 6) break;
  }

  // Fallback: just scan links on the page.
  if (candidates.length === 0) {
    $("a[href]").each((_, a) => {
      const $a = $(a);
      const href = $a.attr("href");
      const title = normalizeText($a.text());
      if (!href || !title) return;

      const url = new URL(href, TSI_EVENTS_URL).toString();
      const lower = url.toLowerCase();
      if (!lower.startsWith("https://tsi.lv/")) return;
      if (lower.includes("elementor-action")) return;
      if (lower.endsWith("#") || lower.includes("#")) return;
      if (!lower.includes("/news") && !lower.includes("/event") && !lower.includes("/news-events")) return;

      candidates.push({
        title,
        url,
        excerpt: "",
        date: "",
        imageUrl: "",
        type: inferTypeFromUrl(url),
        source: "TSI",
      });
    });
  }

  const navNoise = /^(skip to content|events|news|students|contact us)$/i;
  const items = uniqueByUrl(candidates)
    .filter((i) => i?.title && !navNoise.test(String(i.title).trim()))
    .slice(0, 12);
  return items;
}

function getCacheFresh() {
  const now = Date.now();
  const age = now - cache.fetchedAt;
  if (cache.fetchedAt && age >= 0 && age < CACHE_TTL_MS && Array.isArray(cache.items)) {
    return cache.items;
  }
  return null;
}

// GET /api/tsi-events
router.get("/", async (req, res) => {
  try {
    const cached = getCacheFresh();
    if (cached) {
      return res.json(cached);
    }

    const items = await fetchTsiEventsFromSource();
    cache = { fetchedAt: Date.now(), items };
    return res.json(items);
  } catch (err) {
    // Never crash the backend; return empty list + message + fallback if needed.
    // Keep response predictable for frontend (object with items + message).
    const fallback = getFallbackItems();
    cache = { fetchedAt: Date.now(), items: fallback };

    return res.status(200).json({
      items: [],
      message: "TSI events are currently unavailable",
      fallback,
    });
  }
});

export default router;

