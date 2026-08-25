/*
  🌍💰 國際財經情報站
  api/news.js

  功能：
  1. 最近 3 天國際財經新聞
  2. 最近 3 天 Donald J. Trump 本人貼文
  3. 官方 Truth Social API 優先
  4. 官方失敗 → Trump's Truth RSS 備援
  5. 多欄位容錯：content / description / title
  6. 不把媒體新聞當成 Trump 本人貼文
*/

function decodeEntities(text = "") {
  return String(text)
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .trim();
}

function stripHTML(text = "") {
  return decodeEntities(
    String(text)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
  ).trim();
}

function getTag(item, tagName) {
  const regex = new RegExp(
    `<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`,
    "i"
  );

  const match = item.match(regex);

  return match
    ? decodeEntities(match[1])
    : "";
}

function isRecentDate(value, days = 3) {
  const timestamp = Date.parse(value);

  if (!timestamp) return false;

  const now = Date.now();

  return (
    timestamp <= now &&
    now - timestamp <=
      days * 24 * 60 * 60 * 1000
  );
}

function removeDuplicates(items) {
  const seen = new Set();

  return items.filter(item => {
    const key = String(
      item.fullText ||
      item.excerpt ||
      item.title ||
      ""
    )
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

async function fetchJSON(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://truthsocial.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(
      `${url} HTTP ${response.status}`
    );
  }

  return response.json();
}


/* ========================================
   RSS
======================================== */

function parseRSS(xml, type) {
  const items =
    xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

  return items.map((item, index) => {
    let title = stripHTML(
      getTag(item, "title")
    );

    const link = stripHTML(
      getTag(item, "link")
    );

    const pubDate = stripHTML(
      getTag(item, "pubDate")
    );

    const description = stripHTML(
      getTag(item, "description")
    );

    const content = stripHTML(
      getTag(item, "content:encoded")
    );

    let source = stripHTML(
      getTag(item, "source")
    );

    if (!source) {
      const parts = title.split(" - ");

      if (parts.length > 1) {
        source = parts.at(-1);

        title = parts
          .slice(0, -1)
          .join(" - ");
      }
    }

    return {
      id:
        `${type}-${index}-${Date.parse(pubDate) || Date.now()}`,

      type,
      title,
      description,
      content,
      source:
        source || "RSS",

      publishedAt:
        pubDate || "",

      link,

      timestamp:
        Date.parse(pubDate) || 0
    };
  });
}

async function fetchRSSURL(url, type) {
  const response = await fetch(url, {
    headers: {
      Accept:
        "application/rss+xml,text/xml,application/xml",
      "User-Agent":
        "Mozilla/5.0 GlobalFinanceDashboard/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(
      `${type} RSS HTTP ${response.status}`
    );
  }

  const xml = await response.text();

  return parseRSS(xml, type);
}


/* ========================================
   Google News
======================================== */

function buildGoogleURL(query, language) {
  if (language === "en") {
    return (
      "https://news.google.com/rss/search?q=" +
      encodeURIComponent(query) +
      "&hl=en-US&gl=US&ceid=US:en"
    );
  }

  return (
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"
  );
}

async function getGlobalNews(language) {
  const query =
    language === "en"
      ? [
          "global economy when:3d",
          "stock market when:3d",
          "Federal Reserve when:3d",
          "AI semiconductor when:3d",
          "gold oil when:3d"
        ].join(" OR ")
      : [
          "國際財經 when:3d",
          "全球股市 when:3d",
          "美國聯準會 when:3d",
          "AI 半導體 when:3d",
          "黃金 原油 when:3d"
        ].join(" OR ");

  const items = await fetchRSSURL(
    buildGoogleURL(query, language),
    "global"
  );

  return removeDuplicates(items)
    .filter(item =>
      isRecentDate(
        item.publishedAt,
        3
      )
    )
    .sort(
      (a, b) =>
        b.timestamp - a.timestamp
    )
    .slice(0, 15);
}


/* ========================================
   Trump 官方
======================================== */

async function getTrumpOfficial() {
  let accountId =
    "107780257626128497";

  try {
    const account = await fetchJSON(
      "https://truthsocial.com/api/v1/accounts/lookup?acct=realDonaldTrump"
    );

    if (account?.id) {
      accountId = account.id;
    }
  } catch (error) {
    console.warn(
      "Trump lookup failed:",
      error.message
    );
  }

  const statuses = await fetchJSON(
    `https://truthsocial.com/api/v1/accounts/${encodeURIComponent(accountId)}/statuses?limit=40&exclude_replies=true`
  );

  if (!Array.isArray(statuses)) {
    throw new Error(
      "Truth Social statuses format invalid"
    );
  }

  return statuses
    .filter(status => {
      if (status.reblog) {
        return false;
      }

      return isRecentDate(
        status.created_at,
        3
      );
    })
    .map(status => {
      const text =
        stripHTML(
          status.content || ""
        );

      if (!text) return null;

      return {
        id:
          status.id,

        platform:
          "Truth Social",

        author:
          "Donald J. Trump",

        excerpt:
          text,

        fullText:
          text,

        publishedAt:
          status.created_at,

        timestamp:
          Date.parse(
            status.created_at
          ) || 0,

        link:
          status.url ||
          status.uri ||
          "",

        verifiedOriginal:
          true,

        dataSource:
          "Truth Social API"
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.timestamp - a.timestamp
    )
    .slice(0, 10);
}


/* ========================================
   Trump's Truth RSS fallback
======================================== */

async function getTrumpRSS() {
  const url =
    "https://www.trumpstruth.org/feed";

  const items =
    await fetchRSSURL(
      url,
      "trump-rss"
    );

  const posts =
    items
      .filter(item =>
        isRecentDate(
          item.publishedAt,
          3
        )
      )
      .map(item => {
        let fullText =
          String(
            item.content ||
            ""
          ).trim();

        if (
          !fullText ||
          fullText.length < 8
        ) {
          fullText =
            String(
              item.description ||
              ""
            ).trim();
        }

        if (
          !fullText ||
          fullText.length < 8
        ) {
          fullText =
            String(
              item.title ||
              ""
            ).trim();
        }

        fullText =
          stripHTML(fullText);

        if (!fullText) {
          return null;
        }

        const allText = [
          item.link,
          item.description,
          item.content
        ].join(" ");

        const truthMatch =
          allText.match(
            /https:\/\/truthsocial\.com\/[^\s"'<>]+/i
          );

        return {
          id:
            item.id,

          platform:
            "Truth Social",

          author:
            "Donald J. Trump",

          excerpt:
            fullText,

          fullText,

          publishedAt:
            item.publishedAt,

          timestamp:
            item.timestamp,

          link:
            truthMatch
              ? truthMatch[0]
              : item.link,

          verifiedOriginal:
            Boolean(truthMatch),

          dataSource:
            "Trump's Truth RSS"
        };
      })
      .filter(Boolean);

  return removeDuplicates(posts)
    .sort(
      (a, b) =>
        b.timestamp - a.timestamp
    )
    .slice(0, 10);
}


/* ========================================
   Trump 自動 fallback
======================================== */

async function getTrumpPosts() {
  try {
    const official =
      await getTrumpOfficial();

    if (official.length > 0) {
      return {
        posts:
          official,

        source:
          "Truth Social API",

        fallbackUsed:
          false,

        officialError:
          null
      };
    }

    const rss =
      await getTrumpRSS();

    return {
      posts:
        rss,

      source:
        "Trump's Truth RSS",

      fallbackUsed:
        true,

      officialError:
        "Official source returned no usable text posts"
    };

  } catch (officialError) {

    const rss =
      await getTrumpRSS();

    return {
      posts:
        rss,

      source:
        "Trump's Truth RSS",

      fallbackUsed:
        true,

      officialError:
        officialError.message
    };
  }
}


/* ========================================
   Vercel Handler
======================================== */

export default async function handler(
  req,
  res
) {
  try {
    const language =
      req.query.lang === "en"
        ? "en"
        : "zh";

    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=900"
    );

    const results =
      await Promise.allSettled([
        getGlobalNews(language),
        getTrumpPosts()
      ]);

    let globalNews = [];
    let trumpPosts = [];
    let trumpSource = null;
    let trumpFallbackUsed = false;

    const warnings = [];

    if (
      results[0].status ===
      "fulfilled"
    ) {
      globalNews =
        results[0].value;
    } else {
      warnings.push(
        "global: " +
        results[0].reason.message
      );
    }

    if (
      results[1].status ===
      "fulfilled"
    ) {
      trumpPosts =
        results[1].value.posts ||
        [];

      trumpSource =
        results[1].value.source ||
        null;

      trumpFallbackUsed =
        results[1].value
          .fallbackUsed === true;

      if (
        results[1].value
          .officialError
      ) {
        warnings.push(
          "Trump official: " +
          results[1].value
            .officialError
        );
      }

    } else {

      warnings.push(
        "trumpPosts: " +
        results[1].reason.message
      );
    }

    if (
      globalNews.length === 0 &&
      trumpPosts.length === 0
    ) {
      throw new Error(
        "No recent data available"
      );
    }

    return res
      .status(200)
      .json({
        success:
          true,

        language,

        windowDays:
          3,

        updatedAt:
          new Date().toISOString(),

        counts:{
          global:
            globalNews.length,

          trumpPosts:
            trumpPosts.length
        },

        global:
          globalNews,

        trumpPosts,

        trumpSource,

        trumpFallbackUsed,

        warnings
      });

  } catch (error) {

    return res
      .status(500)
      .json({
        success:
          false,

        message:
          "最近 3 天資料暫時無法取得",

        error:
          error.message
      });
  }
}
