export default async function handler(req, res) {
  try {
    const twseUrl =
      "https://openapi.twse.com.tw/v1/opendata/t187ap03_L";

    const tpexUrl =
      "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O";

    // 同時抓上市 + 上櫃
    const [twseResponse, tpexResponse] = await Promise.all([
      fetch(twseUrl),
      fetch(tpexUrl)
    ]);

    if (!twseResponse.ok) {
      throw new Error("TWSE API 無法取得資料");
    }

    if (!tpexResponse.ok) {
      throw new Error("TPEx API 無法取得資料");
    }

    const twseData = await twseResponse.json();
    const tpexData = await tpexResponse.json();

    // 整理上市資料
    const listed = twseData.map(item => ({
      code:
        item["公司代號"] ||
        item["股票代號"] ||
        "",

      name:
        item["公司簡稱"] ||
        item["公司名稱"] ||
        "",

      fullName:
        item["公司名稱"] ||
        item["公司簡稱"] ||
        "",

      industry:
        item["產業別"] ||
        "",

      market: "上市"
    }));

    // 整理上櫃資料
    const otc = tpexData.map(item => ({
      code:
        item["公司代號"] ||
        item["股票代號"] ||
        "",

      name:
        item["公司簡稱"] ||
        item["公司名稱"] ||
        "",

      fullName:
        item["公司名稱"] ||
        item["公司簡稱"] ||
        "",

      industry:
        item["產業別"] ||
        "",

      market: "上櫃"
    }));

    const stocks = [
      ...listed,
      ...otc
    ];

    // 可用股票代號或公司名稱搜尋
    const keyword =
      String(req.query.q || "")
        .trim()
        .toLowerCase();

    if (!keyword) {
      return res.status(200).json({
        success: true,
        total: stocks.length,

        listedCount: listed.length,
        otcCount: otc.length,

        message:
          "已成功取得上市與上櫃股票資料",

        data: []
      });
    }

    const results = stocks
      .filter(stock => {

        const code =
          String(stock.code)
            .toLowerCase();

        const name =
          String(stock.name)
            .toLowerCase();

        const fullName =
          String(stock.fullName)
            .toLowerCase();

        return (
          code.includes(keyword) ||
          name.includes(keyword) ||
          fullName.includes(keyword)
        );

      })
      .slice(0, 20);

    return res.status(200).json({
      success: true,
      keyword,
      count: results.length,
      data: results
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      success: false,
      message: "股票資料暫時無法取得",
      error: error.message
    });

  }
}
