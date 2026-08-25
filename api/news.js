/*
  🌍💰 國際財經情報站
  api/news.js

  功能
  1. 最近 3 天國際財經新聞
  2. 最近 3 天 Donald J. Trump 本人 Truth Social 公開貼文
  3. Trump 貼文優先直接讀取 Truth Social 公開 Mastodon API
  4. 抓不到 Trump API 時，不拿媒體新聞冒充本人發言
  5. 免費、不需要 API Key
*/


/* =========================================
   共用
========================================= */

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

      .replace(/<[^>]*>/g, " ")

      .replace(/[ \t]+/g, " ")

      .replace(/\n\s+/g, "\n")

      .replace(/\n{3,}/g, "\n\n")

  ).trim();

}


async function fetchJSON(
  url,
  options = {}
) {

  const response =
    await fetch(
      url,
      {
        ...options,

        headers: {

          Accept:
            "application/json",

          "User-Agent":
            "Mozilla/5.0 GlobalFinanceDashboard/1.0",

          ...(options.headers || {})

        }

      }
    );


  if (!response.ok) {

    throw new Error(
      `${url} HTTP ${response.status}`
    );

  }


  return await response.json();

}


/* =========================================
   最近 3 天
========================================= */

function isRecentDate(
  value,
  days = 3
) {

  const timestamp =
    Date.parse(value);


  if (!timestamp) {
    return false;
  }


  const now =
    Date.now();


  const maxAge =
    days *
    24 *
    60 *
    60 *
    1000;


  return (
    timestamp <= now &&
    now - timestamp <= maxAge
  );

}


/* =========================================
   RSS
========================================= */

function getTag(
  item,
  tagName
) {

  const regex =
    new RegExp(
      `<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`,
      "i"
    );


  const match =
    item.match(regex);


  return match
    ? decodeEntities(match[1])
    : "";

}


function parseRSS(
  xml,
  type
) {

  const items =
    xml.match(
      /<item>[\s\S]*?<\/item>/gi
    ) || [];


  return items.map(
    (item, index) => {

      let title =
        stripHTML(
          getTag(
            item,
            "title"
          )
        );


      const link =
        stripHTML(
          getTag(
            item,
            "link"
          )
        );


      const pubDate =
        stripHTML(
          getTag(
            item,
            "pubDate"
          )
        );


      let source =
        stripHTML(
          getTag(
            item,
            "source"
          )
        );


      if (!source) {

        const parts =
          title.split(" - ");


        if (parts.length > 1) {

          source =
            parts[
              parts.length - 1
            ];


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
          source ||
          "Google News",

        publishedAt:
          pubDate ||
          "",

        link,

        timestamp:
          Date.parse(pubDate) ||
          0

      };

    }
  );

}


function buildFeedURL(
  query,
  language
) {

  if (
    language === "en"
  ) {

    return (
      "https://news.google.com/rss/search" +
      "?q=" +
      encodeURIComponent(query) +
      "&hl=en-US" +
      "&gl=US" +
      "&ceid=US:en"
    );

  }


  return (
    "https://news.google.com/rss/search" +
    "?q=" +
    encodeURIComponent(query) +
    "&hl=zh-TW" +
    "&gl=TW" +
    "&ceid=TW:zh-Hant"
  );

}


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
    await fetch(
      url,
      {
        headers: {

          Accept:
            "application/rss+xml,text/xml",

          "User-Agent":
            "Mozilla/5.0 GlobalFinanceDashboard/1.0"

        }
      }
    );


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


/* =========================================
   去除新聞重複
========================================= */

function removeDuplicates(items) {

  const seen =
    new Set();


  return items.filter(
    item => {

      const key =
        String(
          item.title ||
          item.excerpt ||
          ""
        )

          .toLowerCase()

          .replace(/\s+/g, " ")

          .trim();


      if (!key) {
        return false;
      }


      if (
        seen.has(key)
      ) {
        return false;
      }


      seen.add(key);

      return true;

    }
  );

}


/* =========================================
   全球財經新聞
========================================= */

async function getGlobalNews(
  language
) {

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


  const items =
    await fetchFeed(
      query,
      language,
      "global"
    );


  return removeDuplicates(items)

    .filter(
      item =>
        isRecentDate(
          item.publishedAt,
          3
        )
    )

    .sort(
      (a, b) =>
        b.timestamp -
        a.timestamp
    )

    .slice(
      0,
      15
    );

}


/* =========================================
   Trump Truth Social
========================================= */

async function getTrumpPosts() {

  /*
    Truth Social 是 Mastodon 相容架構。

    第一步：
    先利用帳號名稱取得 account id。

    account lookup 若臨時失敗，
    再使用已知 public account id 當 fallback。
  */

  let accountId =
    "107780257626128497";


  try {

    const account =
      await fetchJSON(

        "https://truthsocial.com/api/v1/accounts/lookup?acct=realDonaldTrump"

      );


    if (
      account &&
      account.id
    ) {

      accountId =
        account.id;

    }

  } catch (error) {

    console.warn(
      "Truth Social account lookup failed:",
      error.message
    );

  }


  /*
    直接取得本人最近公開 statuses。

    limit 40：
    因為 Trump 有時一天會發很多篇，
    再由程式端過濾最近 3 天。
  */

  const statuses =
    await fetchJSON(

      `https://truthsocial.com/api/v1/accounts/${encodeURIComponent(accountId)}/statuses?limit=40&exclude_replies=true`

    );


  if (
    !Array.isArray(statuses)
  ) {

    throw new Error(
      "Truth Social statuses 回傳格式錯誤"
    );

  }


  const posts =
    statuses

      .filter(
        status => {

          /*
            reblog 不算本人原始發文
          */

          if (
            status.reblog
          ) {
            return false;
          }


          return isRecentDate(
            status.created_at,
            3
          );

        }
      )

      .map(
        status => {


          const fullText =
            stripHTML(
              status.content ||
              ""
            );


          /*
            空白、純圖片貼文不直接顯示成假文字
          */

          if (!fullText) {

            return null;

          }


          return {

            id:
              status.id,

            platform:
              "Truth Social",

            author:
              "Donald J. Trump",

            /*
              這次是真正的 status.content
              轉成純文字。
            */

            excerpt:
              fullText,

            fullText,

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
              true

          };

        }
      )

      .filter(Boolean)

      .sort(
        (a, b) =>
          b.timestamp -
          a.timestamp
      )

      .slice(
        0,
        10
      );


  return posts;

}


/* =========================================
   Vercel
========================================= */

export default async function handler(
  req,
  res
) {

  try {

    const language =
      req.query.lang === "en"
        ? "en"
        : "zh";


    /*
      5 分鐘快取
    */

    res.setHeader(

      "Cache-Control",

      "s-maxage=300, stale-while-revalidate=900"

    );


    const results =
      await Promise.allSettled([

        getGlobalNews(
          language
        ),

        getTrumpPosts()

      ]);


    let globalNews = [];

    let trumpPosts = [];

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
        results[1].value;

    } else {

      warnings.push(
        "trumpPosts: " +
        results[1].reason.message
      );

    }


    /*
      只要其中一種成功，
      API 就正常回傳。
    */

    if (
      globalNews.length === 0 &&
      trumpPosts.length === 0
    ) {

      throw new Error(
        "最近 3 天暫時沒有取得可用資料"
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


        counts: {

          global:
            globalNews.length,

          trumpPosts:
            trumpPosts.length

        },


        global:
          globalNews,


        trumpPosts,


        warnings

      });


  } catch (error) {

    console.error(
      "news API error:",
      error
    );


    return res

      .status(500)

      .json({

        success:
          false,

        message:
          "最近 3 天新聞資料暫時無法取得",

        error:
          error.message

      });

  }

}
