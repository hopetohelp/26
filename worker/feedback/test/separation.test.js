import { expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

// בדיקת מבנה (הכרעת בעלים 14.10.2026): ההפרדה בין הצ'אט הפרטי לבין מפתח האתר, המאגר והשיחות היא תכונה של הקוד, ולא רק של הבדיקות.
const lib = (f) => readFileSync(new URL(`../lib/${f}`, import.meta.url), "utf8");
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const FORBIDDEN = /env\.DB|\bDB\b|\.prepare\(|\.batch\(|openKey|sealKey|aiKey|AI_API_KEY|IP_KEY|settings|ai_runs|drafts|support_|support_threads|feedback_threads|FROM feedback|INTO messages|autoReply|index\.js|localStorage/;

it("מודול הצ'אט הפרטי ומודול הספק אינם נוגעים במאגר, במפתח האתר או בשיחות", () => {
  for (const f of ["privateAsk.js", "model.js"]) expect(code(lib(f)).match(FORBIDDEN), f).toBeNull();
});

it("אף מודול בשרת אינו כותב מפתח או שאלה ללוג", () => {
  for (const f of readdirSync(new URL("../lib/", import.meta.url))) expect(code(lib(f)), f).not.toMatch(/console\./);
  expect(code(readFileSync(new URL("../index.js", import.meta.url), "utf8"))).not.toMatch(/console\./);
});

it("התשובות האוטומטיות אינן מכירות את הצ'אט הפרטי, ונתיב הצ'אט הפרטי מעביר רק את גוף הבקשה ואת שמות המודלים", () => {
  expect(code(lib("autoReply.js"))).not.toMatch(/privateAsk|private_hits|\/private/);
  const index = readFileSync(new URL("../index.js", import.meta.url), "utf8");
  expect(index).toMatch(/privateAsk\(\{ key, messages: body\.messages \}, \{ models: \{ gemini: env\.AI_MODEL_GEMINI, anthropic: env\.AI_MODEL_ANTHROPIC \} \}\)/);
});

it("המפתח נשלח רק לשני כתובות הספקים", () => {
  const hosts = new Set((code(lib("model.js")).match(/https:\/\/[\w.-]+/g) || []).filter((h) => !h.includes("hopetohelp")));
  expect([...hosts].sort()).toEqual(["https://api.anthropic.com", "https://generativelanguage.googleapis.com"]);
});
