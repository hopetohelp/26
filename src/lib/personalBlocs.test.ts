import { polls, VERIFICATION_LABEL } from "./data";
import { expect, it } from "vitest";
import { blocValues } from "./personalBlocs";
import { validateBlocs } from "./crowdValidate";
import { fillAll } from "./fillAll";
import type { Bloc } from "./crowdApi";
const b = (id: string, lists: string[], target: number | null = null): Bloc => ({ id, name: id, lists, target });
it("חמישה תרחישים חופפים מתקבלים; השישי וכפילות בתוך גוש נדחים", () => {
  const five = Array.from({ length: 5 }, (_, i) => b(`b${i}`, ["x"], 80));
  expect(validateBlocs({ mode: "custom", blocs: five }, ["x"])).toBeNull();
  expect(validateBlocs({ mode: "custom", blocs: [...five, b("six", [])] }, ["x"])).toContain("5");
  expect(validateBlocs({ mode: "custom", blocs: [b("one", ["x", "x"])] }, ["x"])).not.toBeNull();
});
it("סכום כל גוש נגזר מהמקור; יעד אינו מחליף אותו וחוסר נתון אינו אפס", () => {
  const rows = blocValues([b("a", ["x", "y"], 61), b("b", ["x", "z"]), b("empty", [])], { x: 30, y: 20 }, { x: "x", y: "y", z: "z" });
  expect(rows.map(r => r.total)).toEqual([50, null, null]);
  expect(rows[1].missing).toEqual(["z"]);
  expect(blocValues([b("a", ["x"])], { old: 0 }, { x: "old" })[0].total).toBe(0);
});
it("יעדים חופפים מעל 120 במצטבר נפתרים בלי לספור מפלגה פעמיים בכנסת", () => {
  const res = fillAll(["x", "y", "z", "w"], { x: { v: 40, src: "manual", locked: true } }, { x: 40, y: 30, z: 30, w: 20 }, [b("a", ["x", "y"], 70), b("b", ["x", "z"], 70)]);
  expect(res.ok).toBe(true);
  if (res.ok) {
    expect(Object.values(res.seats).reduce((n, c) => n + c.v, 0)).toBe(120);
    expect(res.seats.x).toEqual({ v: 40, src: "manual", locked: true });
    expect(res.seats.y.v).toBe(30); expect(res.seats.z.v).toBe(30); expect(res.seats.w.v).toBe(20);
  }
});
it("סתירה בין אותם הרכבים אינה מחזירה תוצאה חלקית", () => {
  const cells = { x: { v: 10, src: "manual" as const, locked: true } };
  const res = fillAll(["x", "y"], cells, { x: 60, y: 60 }, [b("a", ["x", "y"], 60), b("b", ["y", "x"], 70)]);
  expect(res.ok).toBe(false); expect(cells.x.v).toBe(10);
});
it("אילוצים חופפים נשמרים גם בטווחים צרים ובערך יעד אפס", () => {
  const r = fillAll(["x", "y", "z"], {}, { x: 60, y: 60, z: 0 }, [b("a", ["x", "z"], 60), b("b", ["y", "z"], 60), b("c", ["z"], 0)], { x: [59,61], y: [59,61], z: [0,0] });
  expect(r.ok && Object.fromEntries(Object.entries(r.seats).map(([id,c]) => [id,c.v]))).toEqual({x:60,y:60,z:0});
});

it("כל סטטוס אימות בנתוני הסקרים הנוכחיים יכול להופיע בארכיון", () => {
  for (const poll of polls) if (poll.verification) expect(VERIFICATION_LABEL[poll.verification.status]).toBeDefined();
});
