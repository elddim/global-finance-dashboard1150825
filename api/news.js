/*
  🌍💰 國際財經情報站
  api/news.js

  功能：
  1. 最近 3 天國際財經新聞
  2. 最近 3 天 Donald J. Trump 本人公開發文
  3. 優先抓 Truth Social 官方公開 API
  4. 官方 API 若 403 / 失敗，自動使用 Trump's Truth RSS 備援
  5. 不顯示 Trump 媒體新聞
  6. 免費、不需要 API Key
*/


/* =========================================
   基本工具
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

      .replace(/<\/div>/gi, "\n")

      .replace(/<[^>]*>/g, " ")

      .replace(/[ \t]+/g, " ")

      .replace(/\n\s+/g, "\n")

      .replace(/\n{3,}/g, "\n\n")

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

          "Accept":
            "application/json,text/plain,*/*",

          "Accept-Language":
            "en-US,en;q=0.9",

          "Cache-Control":
            "no-cache",

          "Pragma":
            "no-cache",

          "Referer":
            "https://truthsocial.com/",

          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",

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
   日期
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


function getDateString(
  date
) {

  const year =
    date.getFullYear();


  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );


  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );


  return `${year}-${month}-${day}`;

}


/* =========================================
   RSS 解析
========================================= */

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


      const description =
        stripHTML(
          getTag(
            item,
            "description"
          )
        );


      const contentEncoded =
        stripHTML(
          getTag(
            item,
            "content:encoded"
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


        if (
          parts.length > 1
        ) {

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

        description,

        content:
          contentEncoded,

        source:
          source ||
          "RSS",

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


/* =========================================
   Google News RSS
========================================= */

function buildGoogleNewsURL(
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


async function fetchRSSURL(
  url,
  type
) {

  const response =
    await fetch(
      url,
      {
        headers: {

          "Accept":
            "application/rss+xml,text/xml,application/xml",

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


async function fetchGoogleFeed(
  query,
  language,
  type
) {

  return fetchRSSURL(
    buildGoogleNewsURL(
      query,
      language
    ),
    type
  );

}


/* =========================================
   去重
========================================= */

function removeDuplicates(items) {

  const seen =
    new Set();


  return items.filter(
    item => {


      const key =
        String(
          item.title ||
          item.fullText ||
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
   國際財經新聞
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
    await fetchGoogleFeed(
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
      (a,b) =>
        b.timestamp -
        a.timestamp
    )

    .slice(
      0,
      15
    );

}


/* =========================================
   Trump 官方 Truth Social
========================================= */

async function getTrumpPostsOfficial() {

  /*
    帳號 ID fallback
  */

  let accountId =
    "107780257626128497";


  try {

    const account =
      await fetchJSON(

        "https://truthsocial.com/api/v1/accounts/lookup?acct=realDonaldTrump"

      );


    if (
      account?.id
    ) {

      accountId =
        account.id;

    }

  } catch (error) {

    console.warn(
      "Trump account lookup failed:",
      error.message
    );

  }


  const url =
    `https://truthsocial.com/api/v1/accounts/${encodeURIComponent(accountId)}/statuses?limit=40&exclude_replies=true`;


  const statuses =
    await fetchJSON(
      url
    );


  if (
    !Array.isArray(statuses)
  ) {

    throw new Error(
      "Truth Social statuses 格式錯誤"
    );

  }


  return statuses

    .filter(
      status => {


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


        if (
          !fullText
        ) {

          return null;

        }


        return {

          id:
            status.id,

          platform:
            "Truth Social",

          author:
            "Donald J. Trump",

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
            true,

          dataSource:
            "Truth Social API"

        };

      }
    )

    .filter(Boolean)

    .sort(
      (a,b) =>
        b.timestamp -
        a.timestamp
    )

    .slice(
      0,
      10
    );

}


/* =========================================
   Trump RSS 備援
========================================= */

async function getTrumpPostsRSS() {

  /*
    Trump's Truth 官方 FAQ 提供：
    https://www.trumpstruth.org/feed

    並支援：
    start_date
    end_date
  */


  const now =
    new Date();


  const start =
    new Date(
      now.getTime() -
      3 *
      24 *
      60 *
      60 *
      1000
    );


  const startDate =
    getDateString(
      start
    );


  const endDate =
    getDateString(
      now
    );


  const url =
    "https://www.trumpstruth.org/feed" +
    "?start_date=" +
    encodeURIComponent(
      startDate
    ) +
    "&end_date=" +
    encodeURIComponent(
      endDate
    );


  const items =
    await fetchRSSURL(
      url,
      "trump-rss"
    );


  const posts =
    items

      .filter(
        item =>
          isRecentDate(
            item.publishedAt,
            3
          )
      )

      .map(
        item => {


          /*
            RSS 來源可能把真正正文放在：
            content:encoded
            description
            title

            依完整度排序使用。
          */

          let fullText =
            String(
              item.content ||
              ""
            ).trim();


          if (
            !fullText ||
            fullText.length < 10
          ) {

            fullText =
              String(
                item.description ||
                ""
              ).trim();

          }


          if (
            !fullText ||
            fullText.length < 10
          ) {

            fullText =
              String(
                item.title ||
                ""
              ).trim();

          }


          fullText =
            stripHTML(
              fullText
            );


          if (
            !fullText
          ) {

            return null;

          }


          /*
            RSS link 有時是 archive 頁，
            仍保留給使用者查看。

            如果文字中含 Truth Social URL，
            嘗試取出原始貼文網址。
          */

          const combined =
            [
              item.link,
              item.description,
              item.content
            ].join(" ");


          const truthMatch =
            combined.match(
              /https:\/\/truthsocial\.com\/[^\s"'<>]+/i
            );


          const originalLink =
            truthMatch
              ? truthMatch[0]
              : item.link;


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
              originalLink ||
              item.link ||
              "",

            verifiedOriginal:
              Boolean(
                truthMatch
              ),

            dataSource:
              "Trump's Truth RSS"

          };

        }
      )

      .filter(Boolean);


  return removeDuplicates(posts)

    .sort(
      (a,b) =>
        b.timestamp -
        a.timestamp
    )

    .slice(
      0,
      10
    );

}


/* =========================================
   Trump 自動備援
========================================= */

async function getTrumpPosts() {

  /*
    先試官方。

    如果官方遭 Cloudflare 403，
    自動使用 RSS。
  */

  try {

    const official =
      await getTrumpPostsOfficial();


    if (
      official.length > 0
    ) {

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


    /*
      官方成功但沒文章，
      RSS 再確認一次。
    */

    const rss =
      await getTrumpPostsRSS();


    return {

      posts:
        rss,

      source:
        "Trump's Truth RSS",

      fallbackUsed:
        true,

      officialError:
        "官方 API 最近 3 天沒有回傳文字貼文"

    };


  } catch (officialError) {


    console.warn(
      "Truth Social official failed:",
      officialError.message
    );


    const rss =
      await getTrumpPostsRSS();


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


/* =========================================
   Vercel Handler
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


    let globalNews =
      [];


    let trumpPosts =
      [];


    let trumpSource =
      null;


    let trumpFallbackUsed =
      false;


    const warnings =
      [];


    /* 全球新聞 */

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


    /* Trump */

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
        results[1].value.fallbackUsed ===
        true;


      /*
        官方被擋但 RSS 成功，
        還是把原因告訴前端。
      */

      if (
        results[1].value.officialError
      ) {

        warnings.push(
          "Trump official source: " +
          results[1].value.officialError
        );

      }

    } else {

      warnings.push(
        "trumpPosts: " +
        results[1].reason.message
      );

    }


    /*
      全球新聞成功即可維持 API 成功，
      Trump 暫時失敗不拖垮整頁。
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


        trumpSource,


        trumpFallbackUsed,


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
          "最近 3 天的新聞資料暫時無法取得",

        error:
          error.message

      });

  }

}
