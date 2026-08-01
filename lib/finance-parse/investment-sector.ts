import { normalizeInvestmentProductName } from "./investment-utils";

/** Classify investment products without requiring a sector column in the workbook. */
export function classifyInvestmentSector(productName: string): string {
  const name = normalizeInvestmentProductName(productName).toUpperCase();

  if (/(KRX금|금현물|GOLD)/i.test(name)) return "금";
  if (/(달러|USD|DOLLAR|SCHWAB US DIVIDEND)/i.test(name)) return "달러·배당주";
  if (/(S&P.?500|나스닥|NASDAQ|QQQ|미국지수)/i.test(name)) return "미국 지수";
  if (/(빅테크|BIG.?TECH|알파벳|마이크로소프트|애플|엔비디아)/i.test(name)) return "미국 빅테크";
  if (/(반도체|하이닉스|삼성전자)/i.test(name)) return "반도체";
  if (/(미국|US |미국주식)/i.test(name)) return "미국 주식";
  if (/(TIGER|KODEX|ACE|SOL|KIWOOM|JYP|SK텔레콤)/i.test(name)) return "국내 주식·ETF";

  return "기타";
}
