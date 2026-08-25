/*
  🌍💰 國際財經情報站
  api/news.js

  功能：
  1. 最近 3 天國際財經新聞
  2. 最近 3 天 Trump 本人 Truth Social 發文
  3. 不再顯示 Trump 財經媒體新聞
  4. 免費、不需要 API Key
*/


/* ========================================
   基本工具
======================================== */

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


function stripHTML(text = "") {

  return decodeEntities(
    String(text)
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();

}


function getTag(item, tagName) {

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


/* ========================================
   最近 3 天
======================================== */

function isRecent(item, days = 3) {

  const timestamp =
    Number(
      item.timestamp ||
      Date.parse(item.publishedAt)
    );

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


/* ========================================
   RSS 解析
======================================== */

function parseRSS(xml, type) {

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


/* ========================================
   Google News RSS
======================================== */

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


/* ========================================
   抓 RSS
======================================== */

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

          "User-Agent":
            "Mozilla/5.0 GlobalFinanceDashboard/1.0",

          "Accept":
            "application/rss+xml,text/xml"

        }
      }
    );

  if (
    !response.ok
  ) {

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


/* ========================================
   去除重複
======================================== */

function removeDuplicates(news) {

  const seen =
    new Set();

  return news.filter(
    item => {

      const key =
        String(
          item.title ||
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


/* ========================================
   國際財經新聞
======================================== */

async function getGlobalNews(
  language
) {

  const query =
    language === "en"

    ? [
        "global economy",
        "stock market",
        "Federal Reserve",
        "AI semiconductor",
        "oil",
        "gold"
      ].join(" OR ")

    : [
        "國際財經",
        "全球股市",
        "美國聯準會",
        "AI 半導體",
        "黃金",
        "原油"
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
        isRecent(
          item,
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


/* ========================================
   Trump 本人 Truth Social
======================================== */

async function getTrumpPosts() {

  /*
    免費做法：
    用 Google News 搜尋可索引到的
    Truth Social @realDonaldTrump 原始貼文頁。

    注意：
    這不是 Truth Social 官方 API，
    所以可能偶爾抓不到。

    若抓不到，就回傳空陣列，
    不會拿媒體新聞冒充本人發言。
  */

  const queries = [

    'site:truthsocial.com/@realDonaldTrump/posts "Donald J. Trump" when:3d',

    'site:truthsocial.com/@realDonaldTrump/posts Trump when:3d',

    'site:truthsocial.com/@realDonaldTrump/posts tariff OR trade OR economy when:3d'

  ];


  const results =
    await Promise.allSettled(

      queries.map(
        query =>
          fetchFeed(
            query,
            "en",
            "trump-post"
          )
      )

    );


  let allItems = [];


  results.forEach(
    result => {

      if (
        result.status ===
        "fulfilled"
      ) {

        allItems.push(
          ...result.value
        );

      }

    }
  );


  const filtered =
    removeDuplicates(allItems)

      .filter(
        item =>
          isRecent(
            item,
            3
          )
      )

      .filter(
        item => {

          const link =
            String(
              item.link ||
              ""
            )
              .toLowerCase();


          const title =
            String(
              item.title ||
              ""
            )
              .toLowerCase();


          return (

            link.includes(
              "truthsocial.com"
            )

            ||

            title.includes(
              "truth social"
            )

            ||

            title.includes(
              "donald j. trump"
            )

          );

        }
      )

      .sort(
        (a, b) =>
          b.timestamp -
          a.timestamp
      )

      .slice(
        0,
        6
      );


  return filtered.map(
    item => ({

      id:
        item.id,

      platform:
        "Truth Social",

      author:
        "Donald J. Trump",

      /*
        這裡只當作搜尋結果摘錄，
        不宣稱是完整貼文全文。
      */

      excerpt:
        item.title,

      publishedAt:
        item.publishedAt,

      link:
        item.link,

      timestamp:
        item.timestamp,

      verifiedOriginal:
        String(
          item.link ||
          ""
        )
          .toLowerCase()
          .includes(
            "truthsocial.com"
          )

    })
  );

}


/* ========================================
   Vercel API
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


    /*
      快取 5 分鐘
    */

    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=900"
    );


    /*
      只抓：
      1. 全球財經新聞
      2. Trump 本人發文

      已完全移除 Trump 財經媒體新聞
    */

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


/* ========================================
   全球新聞
======================================== */

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


/* ========================================
   Trump 本人發文
======================================== */

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


/* ========================================
   全部失敗
======================================== */

    if (
      globalNews.length === 0 &&
      trumpPosts.length === 0
    ) {

      throw new Error(
        "最近 3 天暫時沒有取得可用資料"
      );

    }


/* ========================================
   回傳
======================================== */

    return res
      .status(200)
      .json({

        success: true,

        language,

        windowDays: 3,

        updatedAt:
          new Date().toISOString(),


        counts: {

          global:
            globalNews.length,

          trumpPosts:
            trumpPosts.length

        },


        /*
          最近 3 天國際財經新聞
        */

        global:
          globalNews,


        /*
          最近 3 天 Trump 本人發文
        */

        trumpPosts:
          trumpPosts,


        /*
          某一個免費來源抓不到時，
          不讓整個 API 掛掉
        */

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

        success: false,

        message:
          "最近 3 天的新聞資料暫時無法取得",

        error:
          error.message

      });

  }

}
