/**
 * סמלי מכוני הסקרים והערוצים לבורר המקור בתצוגה הממוקדת (הכרעת בעלים 23.10.2026).
 * הקבצים ב-`public/pollsters`: סמל האתר (favicon) שהאתר הרשמי מפרסם, מוקטן. סימנים מסחריים של בעליהם; הקרדיט במסך אודות.
 * מכון בלי סמל מוצג בראשי תיבות — אין להמציא סמל.
 */
export type PollsterLogo = { file: string; owner: string; source: string };
export const POLLSTER_LOGOS: Record<string, PollsterLogo> = {
  Kantar: { file: "pollsters/kantar.png", owner: "קנטר", source: "https://www.kantar.com/" },
  "Maagar Mochot": { file: "pollsters/maagar-mochot.png", owner: "מאגר מוחות", source: "https://maagar-mochot.co.il/" },
  "LRI+P4A": { file: "pollsters/panel4all.png", owner: "Panel4All", source: "https://www.panel4all.co.il/" },
  "Channel 14": { file: "pollsters/channel14.png", owner: "ערוץ 14", source: "https://www.c14.co.il/" },
  "i24 News": { file: "pollsters/i24.png", owner: "i24NEWS", source: "https://www.i24news.tv/" },
};
