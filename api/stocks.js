const industryMap = {
  "01": "水泥工業",
  "02": "食品工業",
  "03": "塑膠工業",
  "04": "紡織纖維",
  "05": "電機機械",
  "06": "電器電纜",
  "08": "玻璃陶瓷",
  "09": "造紙工業",
  "10": "鋼鐵工業",
  "11": "橡膠工業",
  "12": "汽車工業",
  "14": "建材營造",
  "15": "航運業",
  "16": "觀光餐旅",
  "17": "金融保險",
  "18": "貿易百貨",
  "20": "其他",
  "21": "化學工業",
  "22": "生技醫療業",
  "23": "油電燃氣業",
  "24": "半導體業",
  "25": "電腦及週邊設備業",
  "26": "光電業",
  "27": "通信網路業",
  "28": "電子零組件業",
  "29": "電子通路業",
  "30": "資訊服務業",
  "31": "其他電子業",
  "32": "文化創意業",
  "33": "農業科技業",
  "34": "電子商務業",
  "35": "綠能環保業",
  "36": "數位雲端業",
  "37": "運動休閒業",
  "38": "居家生活業"
};


function normalizeIndustry(value) {

  if (value === null || value === undefined) {
    return {
      code: "",
      name: "未分類"
    };
  }

  const raw = String(value).trim();

  if (!raw) {
    return {
      code: "",
      name: "未分類"
    };
  }

  /*
    如果 API 已經直接給中文名稱，
    就直接使用，不強制當成數字代碼。
  */
  if (!/^\d+$/.test(raw)) {
    return {
      code: "",
      name: raw
    };
  }

  const code = raw.padStart(2, "0");

  return {
    code,
    name: industryMap[code] || `產業代碼 ${raw}`
  };
}


function normalizeStock(item, market) {

  const code =
    item["公司代號"] ||
    item["股票代號"] ||
    item["證券代號"] ||
    "";

  const name =
    item["公司簡稱"] ||
    item["證券名稱"] ||
    item["公司名稱"] ||
    "";

  const fullName =
    item["公司名稱"] ||
    item["公司簡稱"] ||
    item["證券名稱"] ||
    "";

  const rawIndustry =
    item["產業別"] ||
    item["產業類別"] ||
    item["產業名稱"] ||
    "";

  const industryInfo =
    normalizeIndustry(rawIndustry);

  return {
    code: String(code).trim(),
    name: String(name).trim(),
    fullName: String(fullName).trim(),

    industryCode:
      industryInfo.code,

    industry:
      industryInfo.name,

    market
  };
}


export default async function handler(req, res) {

  try {

    /*
      避免每次瀏覽器都重新抓資料。
      Vercel CDN 可暫存 10 分鐘。
    */
    res.setHeader(
      "Cache-Control",
      "s-maxage=600, stale-while-revalidate=1800"
    );


    const twseUrl =
      "https://openapi.twse.com.tw/v1/opendata/t187ap03_L";

    const tpexUrl =
      "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O";


    const [
      twseResponse,
      tpexResponse
    ] = await Promise.all([

      fetch(twseUrl, {
        headers: {
          "Accept": "application/json"
        }
      }),

      fetch(tpexUrl, {
        headers: {
          "Accept": "application/json"
        }
      })

    ]);


    if (!twseResponse.ok) {

      throw new Error(
        `TWSE API 錯誤：${twseResponse.status}`
      );

    }


    if (!tpexResponse.ok) {

      throw new Error(
        `TPEx API 錯誤：${tpexResponse.status}`
      );

    }


    const twseData =
      await twseResponse.json();

    const tpexData =
      await tpexResponse.json();


    if (!Array.isArray(twseData)) {

      throw new Error(
        "TWSE 回傳格式不是陣列"
      );

    }


    if (!Array.isArray(tpexData)) {

      throw new Error(
        "TPEx 回傳格式不是陣列"
      );

    }


    /*
      整理上市股票
    */
    const listed =
      twseData
        .map(item =>
          normalizeStock(
            item,
            "上市"
          )
        )
        .filter(stock =>
          stock.code &&
          stock.name
        );


    /*
      整理上櫃股票
    */
    const otc =
      tpexData
        .map(item =>
          normalizeStock(
            item,
            "上櫃"
          )
        )
        .filter(stock =>
          stock.code &&
          stock.name
        );


    const stocks = [
      ...listed,
      ...otc
    ];


    /*
      搜尋文字
    */
    const keyword =
      String(
        req.query.q || ""
      )
        .trim()
        .toLowerCase();


    /*
      沒有輸入搜尋文字時，
      只回傳統計資料。
    */
    if (!keyword) {

      return res
        .status(200)
        .json({

          success: true,

          total:
            stocks.length,

          listedCount:
            listed.length,

          otcCount:
            otc.length,

          message:
            "上市／上櫃股票資料取得成功",

          data: []

        });

    }


    /*
      搜尋：
      股票代號
      公司簡稱
      公司全名
      產業名稱
    */
    let results =
      stocks.filter(stock => {

        const code =
          String(stock.code)
            .toLowerCase();

        const name =
          String(stock.name)
            .toLowerCase();

        const fullName =
          String(stock.fullName)
            .toLowerCase();

        const industry =
          String(stock.industry)
            .toLowerCase();


        return (
          code.includes(keyword) ||
          name.includes(keyword) ||
          fullName.includes(keyword) ||
          industry.includes(keyword)
        );

      });


    /*
      排序：
      完全符合股票代號優先
      → 公司簡稱完全符合
      → 股票代號開頭符合
      → 其他
    */
    results.sort((a, b) => {

      const aCode =
        String(a.code)
          .toLowerCase();

      const bCode =
        String(b.code)
          .toLowerCase();

      const aName =
        String(a.name)
          .toLowerCase();

      const bName =
        String(b.name)
          .toLowerCase();


      const score = (
        code,
        name
      ) => {

        if (code === keyword) {
          return 0;
        }

        if (name === keyword) {
          return 1;
        }

        if (code.startsWith(keyword)) {
          return 2;
        }

        if (name.startsWith(keyword)) {
          return 3;
        }

        return 4;
      };


      return (
        score(aCode, aName) -
        score(bCode, bName)
      );

    });


    results =
      results.slice(0, 20);


    return res
      .status(200)
      .json({

        success: true,

        keyword,

        count:
          results.length,

        data:
          results

      });


  } catch (error) {

    console.error(
      "stocks API error:",
      error
    );


    return res
      .status(500)
      .json({

        success: false,

        message:
          "股票資料暫時無法取得",

        error:
          error.message

      });

  }

}
