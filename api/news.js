/*
  🌍 國際財經情報站
  api/news.js

  功能：
  1. 免費取得國際財經新聞 RSS
  2. 不需要 API Key
  3. 支援中文 / 英文
  4. 分成：
     - global：全球財經
     - trump：Trump Watch
  5. 只整理標題、來源、日期、連結
*/


/* =========================
   HTML / XML 特殊文字解碼
========================= */

function decodeEntities(text = "") {

  return String(text)
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .trim();
}


/* =========================
   移除 HTML
========================= */

function stripHTML(text = "") {

  return decodeEntities(
    String(text)
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();

}


/* =========================
   從 RSS item 取得欄位
========================= */

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


/* =========================
   解析 Google News RSS
========================= */

function parseRSS(xml, type) {

  const items =
    xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

  return items.map((item, index) => {

    let title =
      stripHTML(
        getTag(item, "title")
      );

    const link =
      stripHTML(
        getTag(item, "link")
      );

    const pubDate =
      stripHTML(
        getTag(item, "pubDate")
      );

    let source =
      stripHTML(
        getTag(item, "source")
      );


    /*
      Google News 有時候標題格式：

      NVIDIA shares rise after...
      - Reuters

      如果 source 沒抓到，
      嘗試從標題最後面取得來源。
    */

    if (!source) {

      const parts =
        title.split(" - ");

      if (parts.length > 1) {

        source =
          parts[parts.length - 1];

        title =
          parts
            .slice(0, -1)
            .join(" - ");

      }

    }


    return {

      id:
        `${type}-${index}-${Date.parse(pubDate) || Date.now()}`,

      type,

      title,

      source:
        source || "Google News",

      publishedAt:
        pubDate || "",

      link,

      timestamp:
        Date.parse(pubDate) || 0

    };

  });

}


/* =========================
   產生 RSS URL
========================= */

function buildFeedURL(query, language) {

  if (language === "en") {

    return (
      "https://news.google.com/rss/search" +
      "?q=" +
      encodeURIComponent(query) +
      "&hl=en-US" +
      "&gl=US" +
      "&ceid=US:en"
    );

  }


  /*
    中文模式
  */

  return (
    "https://news.google.com/rss/search" +
    "?q=" +
    encodeURIComponent(query) +
    "&hl=zh-TW" +
    "&gl=TW" +
    "&ceid=TW:zh-Hant"
  );

}


/* =========================
   抓 RSS
========================= */

async function fetchFeed(
  query,
  language,
  type
) {

  const url =
    buildFeedURL(
      query,
      language
    );


  const response =
    await fetch(url, {

      headers: {

        "User-Agent":
          "Mozilla/5.0 FinanceDashboard/1.0",

        "Accept":
          "application/rss+xml,text/xml"

      }

    });


  if (!response.ok) {

    throw new Error(
      `${type} RSS HTTP ${response.status}`
    );

  }


  const xml =
    await response.text();


  return parseRSS(
    xml,
    type
  );

}


/* =========================
   去除重複新聞
========================= */

function removeDuplicates(news) {

  const seen =
    new Set();


  return news.filter(item => {

    const key =
      item.title
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();


    if (!key) {
      return false;
    }


    if (seen.has(key)) {
      return false;
    }


    seen.add(key);

    return true;

  });

}


/* =========================
   Trump 財經相關篩選
========================= */

function isTrumpFinanceNews(item) {

  const text =
    `${item.title} ${item.source}`
      .toLowerCase();


  const trumpWords = [
    "trump",
    "川普",
    "特朗普"
  ];


  const financeWords = [

    "tariff",
    "tariffs",
    "trade",
    "economy",
    "economic",
    "market",
    "markets",
    "stock",
    "stocks",
    "fed",
    "federal reserve",
    "interest rate",
    "rates",
    "dollar",
    "china",
    "taiwan",
    "chip",
    "chips",
    "semiconductor",
    "manufacturing",
    "oil",
    "energy",
    "crypto",
    "bitcoin",

    "關稅",
    "貿易",
    "經濟",
    "財經",
    "市場",
    "股市",
    "股票",
    "聯準會",
    "利率",
    "美元",
    "中國",
    "台灣",
    "晶片",
    "半導體",
    "製造",
    "能源",
    "原油",
    "比特幣"

  ];


  const hasTrump =
    trumpWords.some(word =>
      text.includes(word)
    );


  const hasFinance =
    financeWords.some(word =>
      text.includes(word)
    );


  return (
    hasTrump &&
    hasFinance
  );

}


/* =========================
   Vercel API
========================= */

export default async function handler(
  req,
  res
) {

  try {

    /*
      ?lang=zh
      ?lang=en

      預設中文
    */

    const language =
      req.query.lang === "en"
      ? "en"
      : "zh";


    /*
      Vercel 快取 10 分鐘

      RSS 沒必要使用者每按一次
      就重新抓一次。
    */

    res.setHeader(
      "Cache-Control",
      "s-maxage=600, stale-while-revalidate=1800"
    );


    /*
      中文與英文使用不同搜尋字
    */

    const globalQuery =
      language === "en"

      ? [
          "global economy",
          "stock market",
          "Federal Reserve",
          "AI semiconductor"
        ].join(" OR ")

      : [
          "國際財經",
          "全球股市",
          "美國聯準會",
          "AI 半導體"
        ].join(" OR ");


    const trumpQuery =
      language === "en"

      ? "Trump tariff trade economy market"

      : "川普 關稅 貿易 經濟 股市";


    /*
      同時取得兩組新聞
    */

    const results =
      await Promise.allSettled([

        fetchFeed(
          globalQuery,
          language,
          "global"
        ),

        fetchFeed(
          trumpQuery,
          language,
          "trump"
        )

      ]);


    let globalNews = [];

    let trumpNews = [];


    /*
      全球新聞
    */

    if (
      results[0].status === "fulfilled"
    ) {

      globalNews =
        removeDuplicates(
          results[0].value
        )
        .sort(
          (a, b) =>
            b.timestamp -
            a.timestamp
        )
        .slice(0, 12);

    }


    /*
      Trump Watch
    */

    if (
      results[1].status === "fulfilled"
    ) {

      trumpNews =
        removeDuplicates(
          results[1].value
        )
        .filter(
          isTrumpFinanceNews
        )
        .sort(
          (a, b) =>
            b.timestamp -
            a.timestamp
        )
        .slice(0, 8);

    }


    /*
      如果兩個來源都失敗
    */

    if (
      globalNews.length === 0 &&
      trumpNews.length === 0
    ) {

      throw new Error(
        "目前無法取得 RSS 新聞"
      );

    }


    return res
      .status(200)
      .json({

        success: true,

        language,

        updatedAt:
          new Date().toISOString(),

        counts: {

          global:
            globalNews.length,

          trump:
            trumpNews.length

        },

        global:
          globalNews,

        trump:
          trumpNews

      });


  } catch (error) {

    console.error(
      "news API error:",
      error
    );


    return res
      .status(500)
      .json({

        success: false,

        message:
          "國際財經新聞暫時無法取得",

        error:
          error.message

      });

  }

}
