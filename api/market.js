/*
  🌍💰 國際財經情報站
  api/market.js

  功能：
  💵 USD / TWD
  🇯🇵 JPY / TWD
  🇪🇺 EUR / TWD
  🥇 Gold / USD
  ✨ Gold / TWD / gram
  ₿ Bitcoin / USD

  免費資料來源：
  Frankfurter
  Gold API
  CoinGecko
*/


/* ========================================
   共用：安全抓取 JSON
======================================== */

async function fetchJSON(url, options = {}) {

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      "User-Agent": "GlobalFinanceDashboard/1.0",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {

    throw new Error(
      `${url} HTTP ${response.status}`
    );

  }

  return await response.json();

}


/* ========================================
   💱 匯率
======================================== */

async function getExchangeRates() {

  /*
    Frankfurter v2

    直接取得：

    USD → TWD
    JPY → TWD
    EUR → TWD

    不需要再自己算倒數。
  */

  const results = await Promise.all([

    fetchJSON(
      "https://api.frankfurter.dev/v2/rate/USD/TWD"
    ),

    fetchJSON(
      "https://api.frankfurter.dev/v2/rate/JPY/TWD"
    ),

    fetchJSON(
      "https://api.frankfurter.dev/v2/rate/EUR/TWD"
    )

  ]);


  const usd = results[0];
  const jpy = results[1];
  const eur = results[2];


  return {

    date:
      usd.date ||
      jpy.date ||
      eur.date ||
      "",


    usdTwd:
      Number(usd.rate) || null,


    jpyTwd:
      Number(jpy.rate) || null,


    eurTwd:
      Number(eur.rate) || null

  };

}


/* ========================================
   🥇 黃金
======================================== */

async function getGold() {

  const data = await fetchJSON(
    "https://api.gold-api.com/price/XAU"
  );


  const price = Number(
    data.price ||
    data.price_usd ||
    0
  );


  /*
    1 金衡盎司
    = 31.1034768 公克
  */

  const usdPerGram =
    price
      ? price / 31.1034768
      : null;


  return {

    symbol: "XAU",


    priceUsdOz:
      price || null,


    priceUsdGram:
      usdPerGram,


    updatedAt:
      data.updatedAt ||
      data.updated_at ||
      ""

  };

}


/* ========================================
   ₿ Bitcoin
======================================== */

async function getBitcoin() {

  const url =
    "https://api.coingecko.com/api/v3/simple/price" +
    "?ids=bitcoin" +
    "&vs_currencies=usd,twd" +
    "&include_24hr_change=true";


  const data =
    await fetchJSON(url);


  const bitcoin =
    data.bitcoin || {};


  return {

    symbol: "BTC",


    usd:
      bitcoin.usd ?? null,


    twd:
      bitcoin.twd ?? null,


    change24h:
      bitcoin.usd_24h_change ?? null

  };

}


/* ========================================
   Vercel API
======================================== */

export default async function handler(req, res) {

  /*
    快取 5 分鐘。

    避免每一個使用者重新整理頁面時，
    都一直呼叫免費 API。
  */

  res.setHeader(
    "Cache-Control",
    "s-maxage=300, stale-while-revalidate=900"
  );


  /*
    分開抓三種資料。

    Promise.allSettled 很重要：

    就算其中一個 API 掛掉，
    其他市場資料還是可以正常顯示。
  */

  const results =
    await Promise.allSettled([

      getExchangeRates(),

      getGold(),

      getBitcoin()

    ]);


  let exchange = null;

  let gold = null;

  let bitcoin = null;


  const errors = [];


/* ========================================
   匯率結果
======================================== */

  if (
    results[0].status === "fulfilled"
  ) {

    exchange =
      results[0].value;

  } else {

    errors.push(
      "exchange: " +
      results[0].reason.message
    );

  }


/* ========================================
   黃金結果
======================================== */

  if (
    results[1].status === "fulfilled"
  ) {

    gold =
      results[1].value;

  } else {

    errors.push(
      "gold: " +
      results[1].reason.message
    );

  }


/* ========================================
   Bitcoin 結果
======================================== */

  if (
    results[2].status === "fulfilled"
  ) {

    bitcoin =
      results[2].value;

  } else {

    errors.push(
      "bitcoin: " +
      results[2].reason.message
    );

  }


/* ========================================
   🥇 黃金換算台幣 / 公克
======================================== */

  let goldTwdGram = null;


  if (
    gold?.priceUsdGram &&
    exchange?.usdTwd
  ) {

    goldTwdGram =
      gold.priceUsdGram *
      exchange.usdTwd;

  }


/* ========================================
   全部 API 都失敗
======================================== */

  if (
    !exchange &&
    !gold &&
    !bitcoin
  ) {

    return res
      .status(500)
      .json({

        success: false,

        message:
          "目前市場資料來源皆無法取得",

        errors

      });

  }


/* ========================================
   回傳前端
======================================== */

  return res
    .status(200)
    .json({

      success: true,


      updatedAt:
        new Date().toISOString(),


/* ========================================
   🔥 重點
======================================== */

      focus: [

        {

          id: "usd-twd",

          category: "fx",

          symbol: "USD/TWD",

          icon: "💵",

          zh: "美元 / 台幣",

          en: "USD / TWD",

          value:
            exchange?.usdTwd ?? null,

          decimals: 3

        },


        {

          id: "gold",

          category: "commodity",

          symbol: "XAU/USD",

          icon: "🥇",

          zh: "黃金",

          en: "Gold",

          value:
            gold?.priceUsdOz ?? null,

          unit: "USD / oz",

          decimals: 2

        },


        {

          id: "bitcoin",

          category: "crypto",

          symbol: "BTC/USD",

          icon: "₿",

          zh: "Bitcoin",

          en: "Bitcoin",

          value:
            bitcoin?.usd ?? null,

          change:
            bitcoin?.change24h ?? null,

          unit: "USD",

          decimals: 0

        },


        {

          id: "jpy-twd",

          category: "fx",

          symbol: "JPY/TWD",

          icon: "🇯🇵",

          zh: "日圓 / 台幣",

          en: "JPY / TWD",

          value:
            exchange?.jpyTwd ?? null,

          decimals: 4

        }

      ],


/* ========================================
   💱 匯率
======================================== */

      fx: [

        {

          id: "usd-twd",

          symbol: "USD/TWD",

          icon: "💵",

          zh: "美元 / 台幣",

          en: "USD / TWD",

          value:
            exchange?.usdTwd ?? null,

          decimals: 3

        },


        {

          id: "jpy-twd",

          symbol: "JPY/TWD",

          icon: "🇯🇵",

          zh: "日圓 / 台幣",

          en: "JPY / TWD",

          value:
            exchange?.jpyTwd ?? null,

          decimals: 4

        },


        {

          id: "eur-twd",

          symbol: "EUR/TWD",

          icon: "🇪🇺",

          zh: "歐元 / 台幣",

          en: "EUR / TWD",

          value:
            exchange?.eurTwd ?? null,

          decimals: 3

        }

      ],


/* ========================================
   🥇 黃金 / Crypto
======================================== */

      assets: [

        {

          id: "gold",

          symbol: "XAU/USD",

          icon: "🥇",

          zh: "黃金 / 盎司",

          en: "Gold / oz",

          value:
            gold?.priceUsdOz ?? null,

          unit: "USD",

          decimals: 2

        },


        {

          id: "gold-twd-gram",

          symbol: "XAU/TWD",

          icon: "✨",

          zh: "黃金 / 公克",

          en: "Gold / gram",

          value:
            goldTwdGram,

          unit: "TWD",

          decimals: 0

        },


        {

          id: "bitcoin",

          symbol: "BTC/USD",

          icon: "₿",

          zh: "Bitcoin",

          en: "Bitcoin",

          value:
            bitcoin?.usd ?? null,

          change:
            bitcoin?.change24h ?? null,

          unit: "USD",

          decimals: 0

        }

      ],


/* ========================================
   資料日期
======================================== */

      sourceDates: {

        exchange:
          exchange?.date ?? null,

        gold:
          gold?.updatedAt ?? null

      },


/* ========================================
   API 警告
======================================== */

      warnings:
        errors

    });

}
