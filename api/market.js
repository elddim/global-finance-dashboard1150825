/*
  🌍💰 國際財經情報站
  api/market.js

  免費資料來源：
  1. Frankfurter：匯率
  2. Gold API：黃金
  3. CoinGecko：Bitcoin

  不需要付費 API Key
*/


/* =========================
   安全抓 JSON
========================= */

async function fetchJSON(url, options = {}) {

  const response = await fetch(url, {
    ...options,
    headers: {
      "Accept": "application/json",
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


/* =========================
   匯率
========================= */

async function getExchangeRates() {

  /*
    以 TWD 為基準比較直覺

    API 回傳：
    1 TWD = ? USD
    1 TWD = ? JPY
    1 TWD = ? EUR

    但網站想顯示：

    1 USD = ? TWD
    1 JPY = ? TWD
    1 EUR = ? TWD

    所以需要倒數。
  */

  const data = await fetchJSON(
    "https://api.frankfurter.dev/v1/latest?base=TWD&symbols=USD,JPY,EUR"
  );

  const usd = data.rates?.USD;
  const jpy = data.rates?.JPY;
  const eur = data.rates?.EUR;

  return {

    date:
      data.date || "",

    usdTwd:
      usd
        ? 1 / usd
        : null,

    jpyTwd:
      jpy
        ? 1 / jpy
        : null,

    eurTwd:
      eur
        ? 1 / eur
        : null

  };
}


/* =========================
   黃金
========================= */

async function getGold() {

  /*
    XAU = Gold

    即時價格通常以：
    美元 / 金衡盎司
    USD per troy ounce
  */

  const data = await fetchJSON(
    "https://api.gold-api.com/price/XAU"
  );


  const price =
    Number(
      data.price ||
      data.price_usd ||
      0
    );


  /*
    1 troy ounce
    = 31.1034768 grams
  */

  const usdPerGram =
    price
      ? price / 31.1034768
      : null;


  return {

    symbol:
      "XAU",

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


/* =========================
   Bitcoin
========================= */

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

    symbol:
      "BTC",

    usd:
      bitcoin.usd ?? null,

    twd:
      bitcoin.twd ?? null,

    change24h:
      bitcoin.usd_24h_change ?? null

  };
}


/* =========================
   Vercel API
========================= */

export default async function handler(
  req,
  res
) {

  /*
    市場資料不用每次重新抓，
    CDN 暫存 5 分鐘。
  */

  res.setHeader(
    "Cache-Control",
    "s-maxage=300, stale-while-revalidate=900"
  );


  /*
    Promise.allSettled 的好處：

    假設黃金 API 臨時掛掉，
    匯率和 Bitcoin 還是可以顯示。

    不會一個壞掉，
    整個 market API 都一起死掉。
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


  /* 匯率 */

  if (
    results[0].status ===
    "fulfilled"
  ) {

    exchange =
      results[0].value;

  } else {

    errors.push(
      "exchange: " +
      results[0].reason.message
    );

  }


  /* 黃金 */

  if (
    results[1].status ===
    "fulfilled"
  ) {

    gold =
      results[1].value;

  } else {

    errors.push(
      "gold: " +
      results[1].reason.message
    );

  }


  /* Bitcoin */

  if (
    results[2].status ===
    "fulfilled"
  ) {

    bitcoin =
      results[2].value;

  } else {

    errors.push(
      "bitcoin: " +
      results[2].reason.message
    );

  }


  /*
    黃金換算台幣 / 公克
  */

  let goldTwdGram = null;


  if (
    gold?.priceUsdGram &&
    exchange?.usdTwd
  ) {

    goldTwdGram =
      gold.priceUsdGram *
      exchange.usdTwd;

  }


  /*
    如果三個來源全部失敗
  */

  if (
    !exchange &&
    !gold &&
    !bitcoin
  ) {

    return res
      .status(500)
      .json({

        success:false,

        message:
          "目前市場資料來源皆無法取得",

        errors

      });

  }


  return res
    .status(200)
    .json({

      success:true,

      updatedAt:
        new Date().toISOString(),


      /*
        首頁預設「🔥 重點」
      */

      focus:[

        {
          id:"usd-twd",
          category:"fx",

          symbol:"USD/TWD",

          icon:"💵",

          zh:"美元 / 台幣",

          en:"USD / TWD",

          value:
            exchange?.usdTwd ?? null,

          decimals:3
        },


        {
          id:"gold",

          category:"commodity",

          symbol:"XAU/USD",

          icon:"🥇",

          zh:"黃金",

          en:"Gold",

          value:
            gold?.priceUsdOz ?? null,

          unit:"USD / oz",

          decimals:2
        },


        {
          id:"bitcoin",

          category:"crypto",

          symbol:"BTC/USD",

          icon:"₿",

          zh:"Bitcoin",

          en:"Bitcoin",

          value:
            bitcoin?.usd ?? null,

          change:
            bitcoin?.change24h ?? null,

          unit:"USD",

          decimals:0
        },


        {
          id:"jpy-twd",

          category:"fx",

          symbol:"JPY/TWD",

          icon:"🇯🇵",

          zh:"日圓 / 台幣",

          en:"JPY / TWD",

          value:
            exchange?.jpyTwd ?? null,

          decimals:4
        }

      ],


      /*
        💱 匯率
      */

      fx:[

        {
          id:"usd-twd",

          symbol:"USD/TWD",

          icon:"💵",

          zh:"美元 / 台幣",

          en:"USD / TWD",

          value:
            exchange?.usdTwd ?? null,

          decimals:3
        },


        {
          id:"jpy-twd",

          symbol:"JPY/TWD",

          icon:"🇯🇵",

          zh:"日圓 / 台幣",

          en:"JPY / TWD",

          value:
            exchange?.jpyTwd ?? null,

          decimals:4
        },


        {
          id:"eur-twd",

          symbol:"EUR/TWD",

          icon:"🇪🇺",

          zh:"歐元 / 台幣",

          en:"EUR / TWD",

          value:
            exchange?.eurTwd ?? null,

          decimals:3
        }

      ],


      /*
        🪙 商品 / Crypto
      */

      assets:[

        {
          id:"gold",

          symbol:"XAU/USD",

          icon:"🥇",

          zh:"黃金 / 盎司",

          en:"Gold / oz",

          value:
            gold?.priceUsdOz ?? null,

          unit:"USD",

          decimals:2
        },


        {
          id:"gold-twd-gram",

          symbol:"XAU/TWD",

          icon:"✨",

          zh:"黃金 / 公克",

          en:"Gold / gram",

          value:
            goldTwdGram,

          unit:"TWD",

          decimals:0
        },


        {
          id:"bitcoin",

          symbol:"BTC/USD",

          icon:"₿",

          zh:"Bitcoin",

          en:"Bitcoin",

          value:
            bitcoin?.usd ?? null,

          change:
            bitcoin?.change24h ?? null,

          unit:"USD",

          decimals:0
        }

      ],


      /*
        原始資料日期
      */

      sourceDates:{

        exchange:
          exchange?.date || null,

        gold:
          gold?.updatedAt || null

      },


      /*
        某個來源失敗，
        也回傳給前端知道。
      */

      warnings:
        errors

    });

}
