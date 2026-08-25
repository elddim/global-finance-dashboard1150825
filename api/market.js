/*
  🌍💰 國際財經情報站
  api/market.js

  分類：
  🔥 重點
  📈 台股
  💱 匯率
  🥇 黃金
  ₿ Crypto

  免費資料來源：
  - TWSE 官方 OpenAPI
  - Frankfurter
  - Gold API
  - CoinGecko
*/


/* ========================================
   共用：抓 JSON
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
   數字清理
======================================== */

function parseNumber(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value)
      .replace(/,/g, "")
      .trim();

  const number =
    Number(text);

  return Number.isFinite(number)
    ? number
    : null;

}


/* ========================================
   🇹🇼 台灣加權指數
======================================== */

async function getTaiwanIndex() {

  /*
    TWSE 官方 OpenAPI：
    發行量加權股價指數歷史資料
  */

  const url =
    "https://openapi.twse.com.tw/v1/indicesReport/MI_5MINS_HIST";


  const data =
    await fetchJSON(url);


  if (
    !Array.isArray(data) ||
    data.length === 0
  ) {

    throw new Error(
      "TWSE 台灣加權指數沒有資料"
    );

  }


  /*
    OpenAPI 通常會回傳多日資料。

    取最後一筆作為最新可取得資料。
  */

  const latest =
    data[data.length - 1];


  /*
    因 TWSE 欄位有可能使用不同命名，
    多準備幾種可能欄位。
  */

  const date =
    latest["日期"] ||
    latest["Date"] ||
    "";


  const close =
    parseNumber(
      latest["收盤指數"] ||
      latest["收盤價"] ||
      latest["ClosingIndex"] ||
      latest["Close"]
    );


  const open =
    parseNumber(
      latest["開盤指數"] ||
      latest["開盤價"] ||
      latest["OpeningIndex"] ||
      latest["Open"]
    );


  const high =
    parseNumber(
      latest["最高指數"] ||
      latest["最高價"] ||
      latest["HighestIndex"] ||
      latest["High"]
    );


  const low =
    parseNumber(
      latest["最低指數"] ||
      latest["最低價"] ||
      latest["LowestIndex"] ||
      latest["Low"]
    );


  /*
    用前一日收盤計算漲跌幅。
  */

  let change = null;

  let changePercent = null;


  if (
    data.length >= 2 &&
    close !== null
  ) {

    const previous =
      data[data.length - 2];


    const previousClose =
      parseNumber(
        previous["收盤指數"] ||
        previous["收盤價"] ||
        previous["ClosingIndex"] ||
        previous["Close"]
      );


    if (
      previousClose !== null &&
      previousClose !== 0
    ) {

      change =
        close -
        previousClose;


      changePercent =
        (
          change /
          previousClose
        ) * 100;

    }

  }


  return {

    id: "taiex",

    symbol: "TAIEX",

    icon: "🇹🇼",

    zh: "台灣加權指數",

    en: "TAIEX",

    value: close,

    open,

    high,

    low,

    change,

    changePercent,

    date,

    decimals: 2,

    source:
      "TWSE"

  };

}


/* ========================================
   💱 匯率
======================================== */

async function getExchangeRates() {

  /*
    Frankfurter v2
  */

  const results =
    await Promise.all([

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


  const usd =
    results[0];

  const jpy =
    results[1];

  const eur =
    results[2];


  return {

    date:
      usd.date ||
      jpy.date ||
      eur.date ||
      "",


    usdTwd:
      parseNumber(
        usd.rate
      ),


    jpyTwd:
      parseNumber(
        jpy.rate
      ),


    eurTwd:
      parseNumber(
        eur.rate
      )

  };

}


/* ========================================
   🥇 黃金
======================================== */

async function getGold() {

  const data =
    await fetchJSON(
      "https://api.gold-api.com/price/XAU"
    );


  const price =
    parseNumber(
      data.price ||
      data.price_usd
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
      price,

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
      parseNumber(
        bitcoin.usd
      ),

    twd:
      parseNumber(
        bitcoin.twd
      ),

    change24h:
      parseNumber(
        bitcoin.usd_24h_change
      )

  };

}


/* ========================================
   Vercel API
======================================== */

export default async function handler(
  req,
  res
) {

  /*
    快取 5 分鐘
  */

  res.setHeader(
    "Cache-Control",
    "s-maxage=300, stale-while-revalidate=900"
  );


  /*
    每個來源獨立取得。

    某一支 API 掛掉，
    不會讓整個市場區一起掛掉。
  */

  const results =
    await Promise.allSettled([

      getTaiwanIndex(),

      getExchangeRates(),

      getGold(),

      getBitcoin()

    ]);


  let taiwan = null;

  let exchange = null;

  let gold = null;

  let bitcoin = null;


  const errors = [];


/* ========================================
   台股
======================================== */

  if (
    results[0].status ===
    "fulfilled"
  ) {

    taiwan =
      results[0].value;

  } else {

    errors.push(
      "taiwan: " +
      results[0].reason.message
    );

  }


/* ========================================
   匯率
======================================== */

  if (
    results[1].status ===
    "fulfilled"
  ) {

    exchange =
      results[1].value;

  } else {

    errors.push(
      "exchange: " +
      results[1].reason.message
    );

  }


/* ========================================
   黃金
======================================== */

  if (
    results[2].status ===
    "fulfilled"
  ) {

    gold =
      results[2].value;

  } else {

    errors.push(
      "gold: " +
      results[2].reason.message
    );

  }


/* ========================================
   Bitcoin
======================================== */

  if (
    results[3].status ===
    "fulfilled"
  ) {

    bitcoin =
      results[3].value;

  } else {

    errors.push(
      "bitcoin: " +
      results[3].reason.message
    );

  }


/* ========================================
   黃金換算 TWD / 公克
======================================== */

  let goldTwdGram =
    null;


  if (
    gold?.priceUsdGram &&
    exchange?.usdTwd
  ) {

    goldTwdGram =
      gold.priceUsdGram *
      exchange.usdTwd;

  }


/* ========================================
   全部資料都失敗
======================================== */

  if (
    !taiwan &&
    !exchange &&
    !gold &&
    !bitcoin
  ) {

    return res
      .status(500)
      .json({

        success: false,

        message:
          "目前所有市場資料來源皆無法取得",

        errors

      });

  }


/* ========================================
   回傳資料
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

          id: "taiex",

          category: "taiwan",

          symbol: "TAIEX",

          icon: "🇹🇼",

          zh: "台灣加權",

          en: "TAIEX",

          value:
            taiwan?.value ?? null,

          change:
            taiwan?.changePercent ?? null,

          unit: "pts",

          decimals: 2,

          source:
            "TWSE"

        },


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

          category: "gold",

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

        }

      ],


/* ========================================
   📈 台股
======================================== */

      taiwan: [

        {

          id: "taiex",

          symbol: "TAIEX",

          icon: "🇹🇼",

          zh: "台灣加權指數",

          en: "TAIEX",

          value:
            taiwan?.value ?? null,

          change:
            taiwan?.changePercent ?? null,

          changePoints:
            taiwan?.change ?? null,

          open:
            taiwan?.open ?? null,

          high:
            taiwan?.high ?? null,

          low:
            taiwan?.low ?? null,

          date:
            taiwan?.date ?? null,

          unit: "pts",

          decimals: 2,

          source:
            "TWSE"

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
   🥇 黃金
======================================== */

      gold: [

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

          id:
            "gold-twd-gram",

          symbol:
            "XAU/TWD",

          icon:
            "✨",

          zh:
            "黃金 / 公克",

          en:
            "Gold / gram",

          value:
            goldTwdGram,

          unit:
            "TWD",

          decimals:
            0

        }

      ],


/* ========================================
   ₿ Crypto
======================================== */

      crypto: [

        {

          id:
            "bitcoin-usd",

          symbol:
            "BTC/USD",

          icon:
            "₿",

          zh:
            "Bitcoin / 美元",

          en:
            "Bitcoin / USD",

          value:
            bitcoin?.usd ?? null,

          change:
            bitcoin?.change24h ?? null,

          unit:
            "USD",

          decimals:
            0

        },


        {

          id:
            "bitcoin-twd",

          symbol:
            "BTC/TWD",

          icon:
            "🇹🇼₿",

          zh:
            "Bitcoin / 台幣",

          en:
            "Bitcoin / TWD",

          value:
            bitcoin?.twd ?? null,

          change:
            bitcoin?.change24h ?? null,

          unit:
            "TWD",

          decimals:
            0

        }

      ],


/* ========================================
   資料來源日期
======================================== */

      sourceDates: {

        taiwan:
          taiwan?.date ?? null,

        exchange:
          exchange?.date ?? null,

        gold:
          gold?.updatedAt ?? null

      },


/* ========================================
   警告
======================================== */

      warnings:
        errors

    });

}
