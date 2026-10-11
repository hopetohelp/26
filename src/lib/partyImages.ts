/**
 * תמונה לכל רשימה (הכרעת בעלים 11.10.2026, מחליפה את "אין סמלי מפלגות"): תמונת ראש הרשימה, ולרשימות בלי ראש אחד — הסמל.
 * הקבצים ב-`public/parties`. לכל תמונה חובה מקור, רישיון ויוצר (הקרדיט מוצג במסך אודות), ובדיקה אוטומטית (`partyImages.test.ts`) מוודאת.
 * הרשימות שאין להן תמונה (הציבור החרדי, צבע שחור): לא נמצאה תמונה חופשית או סמל רשמי להורדה — אין להמציא.
 */
export type PartyImage = {
  /** נתיב יחסי לשורש האתר */
  file: string;
  /** תמונת אדם (נחתכת לעיגול) או סמל (מוצג שלם) */
  kind: "person" | "logo";
  /** מי בתמונה, או שם הסמל */
  subject: string;
  /** שם היוצר או הגוף שפרסם */
  author: string;
  license: string;
  /** עמוד המקור (ויקימדיה קומונס או אתר המפלגה) */
  source: string;
};

const commons = (name: string) => `https://commons.wikimedia.org/wiki/File:${name}`;

export const PARTY_IMAGES: Record<string, PartyImage> = {
  likud: { file: "parties/likud.jpg", kind: "person", subject: "בנימין נתניהו", author: "Avi Ohayon", license: "CC BY-SA 3.0", source: commons("Benjamin_Netanyahu,_February_2023.jpg") },
  yashar: { file: "parties/yashar.jpg", kind: "person", subject: "גדי איזנקוט", author: "יהב טרודלר", license: "CC BY-SA 3.0", source: commons("Gadi_Eisenkot_2_(cropped).jpg") },
  together: { file: "parties/together.jpg", kind: "person", subject: "נפתלי בנט", author: "Avi Ohayon", license: "CC BY-SA 3.0", source: commons("Naftali_Bennett_official_portrait.jpg") },
  democrats: { file: "parties/democrats.jpg", kind: "person", subject: "יאיר גולן", author: "Shlomi Amsalem", license: "CC BY-SA 4.0", source: commons("Yair_Golan_(SHL_9404)_(3x4_cropped).jpg") },
  yb: { file: "parties/yb.jpg", kind: "person", subject: "אביגדור ליברמן", author: "Jim Mattis (ממשלת ארה״ב)", license: "נחלת הכלל", source: commons("Avigdor_Lieberman_2017.jpg") },
  shas: { file: "parties/shas.jpg", kind: "person", subject: "אריה דרעי", author: "Nati Shohat", license: "CC BY-SA 4.0", source: commons("Aryeh_Deri_(E32J1375).jpg") },
  utj: { file: "parties/utj.jpg", kind: "person", subject: "יעקב אשר", author: "Yossistinknesset", license: "CC BY-SA 4.0", source: commons("Yaakev_asher.jpg") },
  otzma: { file: "parties/otzma.jpg", kind: "person", subject: "איתמר בן גביר", author: "אלון נוריאל", license: "CC BY-SA 3.0", source: commons("Itamar_Ben_Gvir_3_(cropped).jpg") },
  rzp: { file: "parties/rzp.jpg", kind: "person", subject: "בצלאל סמוטריץ'", author: "Avi Ohayon", license: "CC BY-SA 3.0", source: commons("Bezalel_Smotrich.jpg") },
  joint: { file: "parties/joint.svg", kind: "logo", subject: "סמל הרשימה המשותפת", author: "הרשימה המשותפת", license: "נחלת הכלל (סימן מסחרי של הרשימה)", source: commons("Logo_of_the_Joint_List_(Israel)_2026.svg") },
  raam: { file: "parties/raam.jpg", kind: "person", subject: "מנסור עבאס", author: "U.S. Embassy Jerusalem", license: "CC BY 2.0", source: commons("Mansour_Abbas_April_3,_2023_16.jpg") },
  reservists: { file: "parties/reservists.jpg", kind: "person", subject: "יועז הנדל", author: "Itzhak Harari", license: "CC BY-SA 4.0", source: commons("Yoaz_Hendel_(ISH_6916).jpg") },
  bluewhite: { file: "parties/bluewhite.jpg", kind: "person", subject: "בני גנץ", author: "U.S. Department of State", license: "נחלת הכלל", source: commons("Israeli_Minister_Benny_Gantz_at_the_Department_of_State_in_Washington,_D.C._on_March_5,_2024_(cropped).jpg") },
  amcha: { file: "parties/amcha.png", kind: "person", subject: "עופר וינטר", author: "Nadav Margalit", license: "CC BY-SA 4.0", source: commons("Ofer_Winter_2026.png") },
  noam: { file: "parties/noam.png", kind: "logo", subject: "סמל נעם לישראל", author: "מפלגת נעם לישראל", license: "הסמל מהאתר הרשמי של המפלגה", source: "https://www.noamlisrael.org.il/" },
};
