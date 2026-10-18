import { compareMethods } from "./methodComparison";
import { PUBLIC_METRICS } from "./publicMetricResolver";
import { DATA_PRODUCTS, SUPPORT_RECONSTRUCTION, SCREEN_POLICY, METHOD_VERSION, identity } from "./dataCatalog";
import { SNAPSHOT_ID, SOURCE_OPTIONS, ADJUSTED_AVERAGE, resolveDataset } from "./dataResolver";
import { quality } from "./quality";
/**
 * קובצי הנתונים הפתוחים ו-llms.txt (הכרעת בעלים 12.10.2026): מקור אמת אחד לשלושה צרכנים — מפתח (אדם או סוכן קוד בריפו),
 * סשן Claude Code שעובד על האתר, ושרת ה-MCP. אין עותק נפרד לאף אחד מהם: הכול נבנה כאן, מאותן פונקציות שהמסכים משתמשים בהן,
 * ונכתב ל-`dist/` בכל בנייה (`scripts/open-data.ts`, חלק מ-`npm run build`), ולכן מתעדכן מכל הנתונים בלי יוצא מן הכלל.
 * 🔴 אין כאן חישוב חדש: רק קריאה לפונקציות של האתר ועטיפה ב-`about` (תאריך עדכון, מקור, קישור לערך במילון המספרים).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router, createPath, type Navigator } from "react-router-dom";
import modelFile from "../data/model.json";
import forecastFile from "../data/forecast.json";
import backtestFile from "../data/backtest.json";
import historyFile from "../data/history.json";
import { lists2026, listName, meta, polls, registry, results, subgroupPolls, summarize, usablePolls } from "./data";
import { MODEL_AVERAGE } from "./sources";
import { GOV_POINTS, HOME, LATEST_POLLS } from "./homeData";
import { familyRows, pollsterRecords, summarizeCycle, type Cycle, type ElectionResult } from "./history";
import { DEFAULT_LINEAGE, K25_LISTS, lineageRows } from "./lineage";
import { PARTY_IMAGES } from "./partyImages";
import { PAGES } from "./pages";
import { THRESHOLD_PCT } from "../engine/pctForSeats";
import { DEFAULT_TURNOUT, INVALID_SHARE, validVotesFor } from "../engine/law";
import { TOTAL } from "./fillAll";
import { DICTIONARY, MethodNumbers } from "../pages/Method";
import { PARALLEL_SITE_URL } from "./siteUrls";

/** אותו מופע נתב כמו במסכים: תומך ביצירת קישורים גם בייצוא המילון. */
const noNavigation = () => { throw new Error("Static dictionary rendering cannot navigate"); };
const NO_NAV: Navigator = {
  createHref: to => typeof to === "string" ? to : createPath(to),
  go: noNavigation, push: noNavigation, replace: noNavigation,
};

/** הכתובת הציבורית המועדפת. כל הקישורים בקבצים מוחלטים, כדי שיעבדו גם מחוץ לאתר. */
export const SITE = PARALLEL_SITE_URL;
/** הקבצים מתפרסמים כאן: https://26.hopetohelp.net/data/<שם> */
export const DATA_DIR = "data";
/** קישור "איך זה חושב?": ערך במילון (/method#<עוגן>), או לשונית שלמה במסך השיטה (אודות — הקרדיטים; numbers — המילון כולו) */
export const TAB_ANCHORS: Record<string, string> = { about: "/method?tab=about", numbers: "/method?tab=numbers" };
export const methodUrl = (anchor: string) => (TAB_ANCHORS[anchor] ? `${SITE}#${TAB_ANCHORS[anchor]}` : `${SITE}#/method#${anchor}`);
export const screenUrl = (path: string) => `${SITE}#${path}`;

/** כללי האתר שכל צרכן חייב לכבד (מופיעים בכל קובץ וב-llms.txt) */
export const RULES = {
  neutrality: "האתר אינו עורך סקרים ואינו ממליץ על אף רשימה. בלי עמדה, בלי המלצה ובלי תחזית מי ינצח. \"מפלגות הממשלה היוצאת\" היא הגדרה עובדתית (ממשלה 37).",
  transparency: "לכל מספר מחושב: תאריך וקישור \"איך זה חושב?\" לערך שלו במילון המספרים (הסוג נשמר בחוזה הנתונים). מי שמצטט מספר — מצטט גם אותם, פעם אחת לכל מקור.",
  wording: "תרחישים מוצגים כ\"שיעור תרחישים\": לא כ\"סיכוי\" ולא כתוצאה צפויה.",
  polls: "האתר מרכז פרסומים קיימים של סקרים: הסקרים נקלטים ללא עיכוב; כל מוצר בוחר קלט לפי כלל ההכללה הרשום שלו. \"אומת\" / \"לא אומת\" היא תווית שקיפות בלבד, לא תנאי כניסה.",
  crowd: "השערות המשתתפים אינן סקר: מדגם עצמי, לא מייצג, בלי דגימה ובלי שקלול.",
} as const;

export interface About {
  /** שם הקובץ בעברית */
  title: string;
  description: string;
  /** מועד הבנייה האחרונה (כל 4 שעות) — "נכון ל" של הקובץ */
  updatedAt: string;
  /** סוג המספר, כמו בחוזה `Explained` */
  kind: string;
  source: string;
  /** הערך במילון המספרים (או במסך "אודות" לקרדיטים) */
  method: string;
  methodAnchor: string;
  /** המסך באתר שמציג את הנתונים */
  screen: string;
  file: string;
  rules: typeof RULES;
  snapshotId?: string;
  methodVersion?: string;
}

export interface OpenFile {
  /** נתיב יחסי לשורש האתר, למשל data/polls.json */
  path: string;
  title: string;
  description: string;
  /** עוגן במילון המספרים (`/method#<anchor>`) — נבדק בבדיקה שהוא קיים */
  methodAnchor: string;
  kind: string;
  source: string;
  /** נתיב המסך באתר, למשל /polls */
  screen: string;
  /** מה בקובץ (לאינדקס ול-AGENTS.md) */
  fields: string;
  /** null = הקובץ מגיע ממקור חיצוני בזמן הפרסום (dashboard.json, משרת ההשתתפות) ונעטף ב-`about` שם */
  build: (() => Record<string, unknown>) | null;
}

const SRC_POLLS = "טבלאות הסקרים בוויקיפדיה האנגלית, עם קישור לפרסום המקורי של כל סקר";
const SRC_CEC = "ועדת הבחירות המרכזית — התוצאות הרשמיות (votes21–votes25.bechirot.gov.il)";

const cycles = historyFile.cycles as unknown as Cycle[];
const pastResults = results as unknown as ElectionResult[];
const nameMap = () => Object.fromEntries(lists2026.map((l) => [l.id, l.name]));

export const OPEN_FILES: OpenFile[] = [
  {
    path: "data/polls.json",
    title: "סקרים",
    description: "כל סקרי המחזור (2026) כפי שנקלטו: עורך, מזמין, תאריכי עבודה בשטח, מדגם, מנדטים לכל רשימה, קישור לפרסום המקורי, תווית האימות והתיקונים. וגם סקרי קבוצות אוכלוסייה (מוצגים בארכיון בלבד).",
    methodAnchor: "current",
    kind: "סיכום סקרים",
    source: SRC_POLLS,
    screen: "/polls",
    fields: "lists (מזהה ⇐ שם), polls[] (id, start, end, firmHe, publisherHe, sample, values{רשימה:{s מנדטים | p אחוז מתחת לסף}}, urls, verified, verification, corrections, eligibleToShow, consistent), subgroupPolls[]",
    build: () => ({ lists: lists2026, polls, subgroupPolls, counts: { all: polls.length, usable: usablePolls.length, subgroup: subgroupPolls.length } }),
  },
  {
    path: "data/average.json",
    title: "ממוצע ומודל",
    description: "שלושה מוצרים נפרדים: ממוצע סקרים, ממוצע מותאם וממוצע המודל; הסקר האחרון של כל מכון ב-14 הימים האחרונים והממוצע והטווח ביניהם; מגמת המודל לאורך המחזור ומגמת מפלגות הממשלה היוצאת.",
    methodAnchor: "means",
    kind: "סיכום סקרים",
    source: SRC_POLLS,
    screen: "/today",
    fields: "average (seats, shares, asOf, lastPoll, polls, pollsters), latestPerPollster{asOf, polls[], summary[] (id, mean, min, max, n, passing)}, house[] (מכון ⇐ מנדטים), trend[] (date, seats, shares), government{lists, seats, series, candles}",
    build: () => ({
      names: nameMap(),
      average: { ...MODEL_AVERAGE, productId: "model.mean", label: DATA_PRODUCTS["model.mean"].name },
      products: Object.fromEntries(Object.keys(DATA_PRODUCTS).filter(id => id !== "poll.single").map(id => [id, resolveDataset({ product: id as keyof typeof DATA_PRODUCTS })])),
      catalog: DATA_PRODUCTS,
      reconstruction: SUPPORT_RECONSTRUCTION,
      sourceOptions: SOURCE_OPTIONS,
      providerInput: { polls, meta, lists2026, model: modelFile },
      screenPolicy: SCREEN_POLICY,
      adjusted: ADJUSTED_AVERAGE,
      latestPerPollster: {
        asOf: MODEL_AVERAGE.asOf,
        windowDays: 14,
        polls: LATEST_POLLS.map((p) => ({ id: p.id, end: p.end, firmHe: p.firmHe, publisherHe: p.publisherHe, sample: p.sample, values: p.values, urls: p.urls, verified: p.verified })),
        summary: summarize(LATEST_POLLS, lists2026.map((l) => l.id)),
      },
      house: modelFile.house,
      trend: modelFile.trend,
      government: {
        definition: "מפלגות הממשלה היוצאת (ממשלה 37) — הגדרה עובדתית",
        lists: lists2026.filter((l) => l.gov37).map((l) => l.id),
        seats: HOME.gov,
        series: HOME.series,
        candles: GOV_POINTS.map((g) => ({ date: new Date(g.t).toISOString().slice(0, 10), mean: g.mean ?? null, values: g.values })),
      },
      params: modelFile.params,
    }),
  },
  {
    path: "data/scenarios.json",
    title: "תרחישים",
    description: "שיעור התרחישים שבהם כל רשימה עוברת את אחוז החסימה, טווח 80% מהתרחישים לכל רשימה ולגוש, החלוקה לעוברות / על הסף / מתחת לסף (לפי הסקרים האחרונים בלבד: הסקר האחרון של כל סדרה ב-14 הימים האחרונים), הסיכון לפי התרחישים בלבד (scenarioEdge), ובדיקת העבר של המודל. \"שיעור תרחישים\", לא \"סיכוי\".",
    methodAnchor: "model",
    kind: "תרחיש",
    source: "מודל האתר על בסיס הסקרים שפורסמו (טבלאות הסקרים בוויקיפדיה) וחוק הבחירות",
    screen: "/today?tab=scenarios",
    fields: "scenarios (count, lists{id:{pass, seats[10%,50%,90%], seatsMean, seatsHist}}, bloc, agreementsMoveSeat), groups{safe, edge, below, scenarioEdge}, blocs{coalition, arab, opposition}, backtest (summary, horizons, rows)",
    build: () => ({
      names: nameMap(),
      asOf: MODEL_AVERAGE.asOf,
      threshold: THRESHOLD_PCT,
      scenarios: { count: modelFile.params.scenarios, ...modelFile.scenarios },
      // safe/edge/below — לפי הסקרים האחרונים בלבד (הכרעה 4); scenarioEdge — הסיכון שעולה מתרחישי המודל בלבד
      groups: { safe: HOME.safe.map((r) => r.id), edge: HOME.edge.map((r) => r.id), below: HOME.below.map((r) => r.id), scenarioEdge: HOME.scenarioEdge.map((r) => r.id) },
      rows: [...HOME.safe, ...HOME.edge, ...HOME.below].map(({ hist: _h, ...r }) => r),
      blocs: { ...HOME.blocs, range80: [HOME.blocLo, HOME.blocHi] },
      backtest: backtestFile,
    }),
  },
  {
    path: "data/forecast.json",
    title: "תחזית (מודל המגמות)",
    description: "מודל המגמות: המשך המגמה הנוכחית עד יום הבחירות, לכל רשימה ולגושים, ומדדי הבדיקה מול מערכות קודמות. מוצג באתר רק בתמונת השיתוף; אינו תחזית מי ינצח.",
    methodAnchor: "forecast",
    kind: "מודל המגמות",
    source: "מודל המגמות של האתר על בסיס הסקרים שפורסמו (טבלאות הסקרים בוויקיפדיה) ובדיקה מול מערכות 2019–2022",
    screen: "/guess",
    fields: "asof, daysToElection, lists{id:{seats, seatsRange, pass, …}}, bloc, camp, gate, series, attempts",
    build: () => ({ names: nameMap(), ...forecastFile }),
  },
  {
    path: "data/results.json",
    title: "תוצאות עבר",
    description: "התוצאות הרשמיות של מערכות הבחירות 2019–2022 (כנסות 21–25): קולות ומנדטים לכל רשימה, ובעלי זכות בחירה, מצביעים ופסולים בכל מערכת, ובעלי זכות הבחירה ב-2026.",
    methodAnchor: "results",
    kind: "נתון רשמי",
    source: SRC_CEC,
    screen: "/past",
    fields: "elections[] (id, knesset, date, label, valid, lists[] {letters, short, name, votes, seats}), turnout{series[], k26}",
    build: () => ({ elections: results, turnout: registry }),
  },
  {
    path: "data/law.json",
    title: "חוק הבחירות והמחשבון",
    description: "הפרמטרים שמחשבון המנדטים משתמש בהם: אחוז החסימה, הסכמי העודפים של 2026 (עם מקור ומצב לכל הסכם), בעלי זכות הבחירה, ברירות המחדל לשיעור ההצבעה ולפסולים, ורשימות 2026. החישוב עצמו — במנוע של האתר (src/engine).",
    methodAnchor: "engine",
    kind: "חישוב לפי החוק",
    source: "חוק הבחירות לכנסת, סעיפים 81–82; הסכמי העודפים — כפי שדווחו בתקשורת עד פרסום ועדת הבחירות; בעלי זכות הבחירה — הודעת יו\"ר ועדת הבחירות המרכזית",
    screen: "/guess",
    fields: "seats, threshold, defaultTurnout, invalidShare, eligible{value, source, status}, validVotesDefault, agreements[] {pair, names, status, source}, lists[] {id, name, leader, gov37}",
    build: () => ({
      seats: TOTAL,
      threshold: THRESHOLD_PCT,
      defaultTurnout: DEFAULT_TURNOUT,
      invalidShare: INVALID_SHARE,
      eligible: { value: registry.k26.eligible, source: registry.k26.source, status: registry.k26.status },
      validVotesDefault: validVotesFor(registry.k26.eligible),
      agreements: meta.agreements2026.map((a) => ({ ...a, names: a.pair.map(listName) })),
      lists: lists2026,
    }),
  },
  {
    path: "data/accuracy.json",
    title: "דיוק הסקרים",
    description: "סקרי ערב הבחירות (14 הימים האחרונים) בכל מערכת 2019–2022 מול התוצאה: לכל רשימה הממוצע, הטווח וההפרש; סך הפער; גוש הממליצים על נתניהו; מכונים לאורך המערכות; משפחות רשימות. וגם כל סקרי המערכות הקודמות.",
    methodAnchor: "accuracy",
    kind: "סיכום סקרים",
    source: "טבלאות הסקרים בוויקיפדיה האנגלית לכל מערכת (עם קישור לפרסום המקורי), והתוצאות הרשמיות של ועדת הבחירות",
    screen: "/past?tab=accuracy",
    fields: "cycles[] (id, label, date, gap, bloc{estimate, actual}, rows[] {letters, name, estimate, min, max, n, actual, diff, thresholdMiss}, snapshot[]), pollsters[], families[], pastPolls{cycleId: polls[]}",
    build: () => {
      const summaries = cycles.map((c) => summarizeCycle(c, pastResults.find((r) => r.id === c.id)!));
      return {
        eveDays: 14,
        cycles: summaries.map((s) => ({
          id: s.cycle.id,
          knesset: s.cycle.knesset,
          label: s.cycle.label,
          date: s.cycle.date,
          recommendedNetanyahu: s.cycle.recommendedNetanyahu,
          gap: s.gap,
          bloc: s.bloc,
          rows: s.rows.map(({ values: _v, ...r }) => r),
          misses: s.misses.map((m) => m.letters),
          snapshot: s.snapshot.map((p) => p.id),
        })),
        pollsters: pollsterRecords(cycles, pastResults),
        families: familyRows(summaries),
        pastPolls: Object.fromEntries(cycles.map((c) => [c.id, c.polls])),
      };
    },
  },
  {
    path: "data/changes.json",
    title: "מה השתנה מאז 2022",
    description: "שיוך רשימות 2026 לרשימות 2022 (ברירת המחדל באתר), קולות ומנדטים ב-2022 מול ממוצע הסקרים היום, ושלוש חלופות השיוך עם הנימוק לכל שורה.",
    methodAnchor: "changes",
    kind: "השוואה",
    source: `${SRC_CEC}; שיוך הרשימות: raw/lineage.json בריפו`,
    screen: "/changes",
    fields: "lineage{rows[] (id, category, from, part, share2022, seats2022, shareNow, seatsNow), unassigned2022}, lists2022[], alternatives[]",
    build: () => ({ names: nameMap(), lineage: lineageRows(DEFAULT_LINEAGE), lists2022: K25_LISTS, alternatives: modelFile.changes.alternatives }),
  },
  {
    path: "dashboard.json",
    title: "סטטיסטיקות הגולשים",
    description: "ממוצע השערות המשתתפים באתר, הגושים, ההצבעה ופילוחים — העותק שבאתר, מתעדכן בכל פרסום משרת ההשתתפות. השערות משתתפים אינן סקר.",
    methodAnchor: "crowd",
    kind: "השערות משתתפים, אינן סקר",
    source: "שרת ההשתתפות של האתר (elections26-crowd), מצטבר ואנונימי",
    screen: "/guess?tab=dashboard",
    fields: "publishedAt, participants, open, seats{n, full[], pctStats[]}, blocs, vote, sectionsAsOf, sectionParticipants",
    build: null,
  },
  {
    path: "data/party-images.json",
    title: "תמונות הרשימות",
    description: "תמונה לכל רשימה (ראש הרשימה, ולרשימה בלי ראש אחד — הסמל), עם יוצר, רישיון ועמוד המקור. רק רישיון חופשי או סמל מהאתר הרשמי. בגודל אחיד ובלי הדגשה.",
    methodAnchor: "about",
    kind: "נתון רשמי",
    source: "ויקימדיה קומונס (רישיון חופשי) והאתרים הרשמיים של המפלגות",
    screen: "/method?tab=about",
    fields: "images{רשימה:{url, kind (person|logo), subject, author, license, source}}, missing[]",
    build: () => ({
      images: Object.fromEntries(Object.entries(PARTY_IMAGES).map(([id, img]) => [id, { name: listName(id), url: SITE + img.file, ...img }])),
      missing: lists2026.filter((l) => !PARTY_IMAGES[l.id]).map((l) => ({ id: l.id, name: l.name, reason: "לא נמצאה תמונה חופשית או סמל רשמי להורדה" })),
    }),
  },
  {
    path: "data/method-comparison.json", title: "בדיקת שלושת הממוצעים", description: "שלושת המוצרים מול תוצאות עבר, רק מסקרים שהיו זמינים עד מועד הבדיקה; הנחות ההסכמים מפורשות", methodAnchor: "means", kind: "השוואה", source: SRC_POLLS + "; " + SRC_CEC, screen: "/method", fields: "rows[] (cycle, asOf, inputRefs, actual, products, assumptions)", build: () => ({ modelSignature: backtestFile.modelSignature, rows: compareMethods(cycles, pastResults, backtestFile.rows) }),
  },
  {
    path: "data/quality.json", title: "איכות הנתונים", description: "כיסוי, סתירות ותיקונים לפי שדה, ללא חסימת פרסום", methodAnchor: "current", kind: "סיכום סקרים", source: SRC_POLLS, screen: "/method?tab=sources", fields: "coverage, conflicts, corrections", build: () => ({ ...quality }),
  },
  {
    path: "data/dictionary.json",
    title: "מילון המספרים",
    description: "ערך לכל מספר שהאתר מחשב: איפה הוא מופיע, סוג, מקור, ההנחה המרכזית והפירוט המלא — אותו תוכן שבמסך \"מידע\".",
    methodAnchor: "numbers",
    kind: "השוואה",
    source: "מסך \"מידע\" באתר",
    screen: "/method",
    fields: "entries[] (id, title, where, kind, source, assumption, detail, url)",
    build: () => ({ entries: dictionaryEntries() }),
  },
];

/** הערכים של מילון המספרים בטקסט פשוט (הפירוט המלא מומר מ-HTML), עם קישור לכל ערך */
export function dictionaryEntries() {
  const text = (node: unknown) =>
    renderToStaticMarkup(createElement(Router, { location: "/method", navigator: NO_NAV, static: true, children: node as never }))
      .replace(/<\/(p|li|h\d|tr|div)>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .trim();
  return DICTIONARY.map((e) => ({ id: e.id, title: e.title, where: e.where, kind: e.kind, source: e.source, assumption: e.assumption, detail: text(e.detail), url: methodUrl(e.id) }));
}

export function aboutOf(f: OpenFile, updatedAt = meta.dataAsOf): About {
  return {
    title: f.title,
    description: f.description,
    updatedAt,
    kind: f.kind,
    source: f.source,
    method: methodUrl(f.methodAnchor),
    methodAnchor: f.methodAnchor,
    screen: screenUrl(f.screen),
    file: SITE + f.path,
    rules: RULES,
  };
}

/** תוכן קובץ: `about` ראשון, ואחריו הנתונים */
export function buildFile(f: OpenFile): Record<string, unknown> {
  if (!f.build) throw new Error(`${f.path} מגיע ממקור חיצוני`);
  return { about: { ...aboutOf(f), snapshotId: SNAPSHOT_ID, methodVersion: METHOD_VERSION }, ...f.build() };
}

/** עטיפת קובץ חיצוני (dashboard.json) ב-`about`, בלי לשנות את שאר השדות; "נכון ל" = מועד הפרסום של השרת */
export function wrapExternal(f: OpenFile, data: Record<string, unknown>): Record<string, unknown> {
  const { about: _old, ...rest } = data;
  return { about: { ...aboutOf(f, typeof rest.publishedAt === "string" ? rest.publishedAt : meta.dataAsOf), snapshotId: `crowd-${identity(rest)}`, methodVersion: METHOD_VERSION }, ...rest };
}

/** האינדקס: data/index.json — רשימת הקבצים, הכללים, המסכים ומילון המספרים */
/**
 * כתובת שרת ה-MCP לפרסום, מתוך כתובת הבסיס (MCP_URL): רק הכתובת עם ההתחברות לחשבון האתר.
 * 🔴 הכתובת בלי התחברות (/public) אינה מפורסמת — היא גלויה כרגע רק למנהל האתר, באזור האישי (הכרעת בעלים 12.10.2026).
 */
export const mcpAddresses = (base: string | null) => (base ? { withLogin: `${base.replace(/\/$/, "")}/mcp` } : null);

export function buildIndex(mcpUrl: string | null) {
  return {
    about: {
      title: "אינדקס הנתונים הפתוחים",
      description: "כל קובצי הנתונים של האתר בכתובות קבועות. אותם קבצים משמשים את האתר, את המפתחים ואת שרת ה-MCP.",
      updatedAt: meta.dataAsOf,
      snapshotId: SNAPSHOT_ID,
      methodVersion: METHOD_VERSION,
      kind: "נתון רשמי",
      source: "האתר עצמו — נבנה בכל פרסום (כל 4 שעות)",
      method: methodUrl("numbers"),
      methodAnchor: "numbers",
      screen: SITE,
      file: SITE + "data/index.json",
      rules: RULES,
    },
    snapshotId: SNAPSHOT_ID,
    catalog: DATA_PRODUCTS,
      reconstruction: SUPPORT_RECONSTRUCTION,
    publicMetrics: PUBLIC_METRICS,
    screenPolicy: SCREEN_POLICY,
    sourceOptions: SOURCE_OPTIONS,
    site: SITE,
    electionDay: meta.electionDay,
    llms: SITE + "llms.txt",
    mcp: mcpAddresses(mcpUrl),
    screens: PAGES.map((p) => ({ label: p.label, url: screenUrl(p.to) })),
    files: OPEN_FILES.map((f) => ({ path: f.path, url: SITE + f.path, title: f.title, description: f.description, fields: f.fields, method: aboutOf(f).method, screen: screenUrl(f.screen), kind: f.kind, source: f.source })),
    dictionary: DICTIONARY.map((e) => ({ id: e.id, title: e.title, url: methodUrl(e.id) })),
    /** כל העוגנים שקישור "איך זה חושב?" יכול להוביל אליהם (ערכים, עוגנים בתוך ערכים, ולשוניות) — לכרטיס התשובה של שרת ה-MCP */
    anchors: [...validAnchors()].sort().map((id) => ({ id, url: methodUrl(id) })),
  };
}

/** llms.txt בשורש האתר — לפי המוסכמה (llmstxt.org): כותרת, תקציר, ואז רשימות קישורים */
export function buildLlmsTxt(mcpUrl: string | null): string {
  const lines: string[] = [];
  lines.push("# בחירות 2026", "");
  lines.push(`> אתר עצמאי לבחירות לכנסת ה-26 (${meta.electionDay}): ארכיון הסקרים של המחזור, ממוצע ומודל, תרחישים, תוצאות אמת 2019–2022, דיוק הסקרים בעבר, ומחשבון מנדטים שמממש את חוק הבחירות (אחוז חסימה ${THRESHOLD_PCT}%, הסכמי עודפים, באדר-עופר). האתר אינו עורך סקרים ואינו ממליץ על אף רשימה.`, "");
  lines.push(`הנתונים נכונים ל-${meta.dataAsOf} ומתעדכנים אוטומטית כל 4 שעות (חוץ משבת: מיום שישי 16:00 עד מוצאי שבת 20:00 שעון ישראל אין רענון).`, "");
  lines.push("## כללים לכל מי שמשתמש בנתונים", "");
  for (const r of Object.values(RULES)) lines.push(`- ${r}`);
  lines.push("");
  lines.push("## מסכים", "");
  for (const p of PAGES) lines.push(`- [${p.label}](${screenUrl(p.to)})`);
  lines.push("");
  lines.push("## קובצי נתונים (JSON, כתובות קבועות)", "");
  lines.push(`בכל קובץ שדה \`about\`: תאריך עדכון (updatedAt), סוג, מקור, וקישור לערך במילון המספרים (method). האינדקס המלא: ${SITE}data/index.json`, "");
  for (const f of OPEN_FILES) lines.push(`- [${f.title}](${SITE}${f.path}): ${f.description} שדות: ${f.fields}. איך זה חושב: ${aboutOf(f).method}`);
  lines.push("");
  lines.push("## מילון המספרים", "");
  for (const e of DICTIONARY) lines.push(`- [${e.title}](${methodUrl(e.id)}): ${e.kind}. מקור: ${e.source}. הנחה: ${e.assumption}`);
  lines.push("");
  lines.push("## שרת MCP", "");
  const mcp = mcpAddresses(mcpUrl);
  if (mcp) {
    lines.push(`- ${mcp.withLogin} — עם התחברות לחשבון האתר (OAuth): כל נתוני האתר, מחשבון המנדטים (אותו מנוע כמו באתר), כרטיס תשובה בעיצוב האתר, והנתונים והפעולות של המשתמש עצמו (ההשערה, הגושים, ההצבעה, ההיסטוריה, הקבוצות, "הנתונים שלי", השיחה עם צוות האתר), באותן הרשאות כמו באתר.`);
  } else lines.push("- בבנייה. כשיעלה, הכתובות יופיעו כאן ובאינדקס (data/index.json, השדה mcp).");
  lines.push("");
  lines.push("## Optional", "");
  lines.push("- [קוד המקור](https://github.com/hopetohelp/26): הריפו הציבורי; AGENTS.md מסביר איפה כל קובץ ואיך הוא נבנה.");
  lines.push("");
  return lines.join("\n");
}

/** העוגנים שקישור "איך זה חושב?" יכול להוביל אליהם: כל id במסך המילון, ולשוניות מסך השיטה */
export function validAnchors(): Set<string> {
  const html = renderToStaticMarkup(createElement(Router, { location: "/method", navigator: NO_NAV, static: true, children: createElement(MethodNumbers, { includeArchived: true }) }));
  return new Set([...[...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]), ...Object.keys(TAB_ANCHORS)]);
}

/**
 * בדיקת האינדקס מול תיקיית הבנייה: כל קובץ שבאינדקס קיים, נקרא כ-JSON, ויש בו `about` מלא; "נכון ל" שלו הוא הבנייה הנוכחית
 * (לא עותק ישן); הקישור למילון מוביל לערך קיים; llms.txt מזכיר כל קובץ. `withDashboard` — גם הקובץ החיצוני (בפרסום בלבד).
 */
export function checkOpenData(read: (path: string) => string | null, opts: { withDashboard: boolean; anchors: Set<string> }): string[] {
  const errors: string[] = [];
  const index = read("data/index.json");
  if (!index) return ["data/index.json חסר"];
  const idx = JSON.parse(index) as ReturnType<typeof buildIndex>;
  const llms = read("llms.txt") ?? "";
  if (!llms) errors.push("llms.txt חסר");
  const listed = new Set(idx.files.map((f) => f.path));
  for (const f of OPEN_FILES) if (!listed.has(f.path)) errors.push(`${f.path} חסר באינדקס`);
  for (const f of OPEN_FILES) {
    if (!opts.anchors.has(f.methodAnchor)) errors.push(`${f.path}: העוגן "${f.methodAnchor}" אינו קיים במילון המספרים`);
    if (!llms.includes(SITE + f.path)) errors.push(`llms.txt אינו מזכיר את ${f.path}`);
    if (!f.build && !opts.withDashboard) continue;
    const body = read(f.path);
    if (!body) { errors.push(`${f.path} חסר בבנייה`); continue; }
    let data: { about?: Partial<About> };
    try { data = JSON.parse(body); } catch { errors.push(`${f.path} אינו JSON תקין`); continue; }
    const a = data.about;
    if (!a) { errors.push(`${f.path}: אין about`); continue; }
    for (const k of ["title", "updatedAt", "kind", "source", "method", "screen"] as const) if (!a[k]) errors.push(`${f.path}: about.${k} חסר`);
    if (a.method !== methodUrl(f.methodAnchor)) errors.push(`${f.path}: about.method אינו הקישור למילון`);
    if (f.build && a.snapshotId !== SNAPSHOT_ID) errors.push(`${f.path}: גרסת הנתונים אינה תואמת לאינדקס`);
    if (f.build && a.updatedAt !== meta.dataAsOf) errors.push(`${f.path}: לא עדכני (${a.updatedAt} ולא ${meta.dataAsOf})`);
    if (!f.build && Number.isNaN(Date.parse(a.updatedAt ?? ""))) errors.push(`${f.path}: about.updatedAt אינו תאריך`);
  }
  if (idx.snapshotId !== SNAPSHOT_ID) errors.push("data/index.json: גרסת הנתונים אינה תואמת לבנייה");
  if (idx.about.updatedAt !== meta.dataAsOf) errors.push("data/index.json אינו עדכני");
  return errors;
}
