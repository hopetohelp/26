// מתאם D1 מזויף מעל node:sqlite — לבדיקות אינטגרציה בלבד.
import { createRequire } from "node:module";
// vite מסיר את הקידומת node: ו-sqlite קיים רק עם הקידומת — לכן require
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
import { readFileSync } from "node:fs";

class Stmt {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }
  bind(...args) {
    for (const a of args) if (a === undefined) throw new Error("D1_TYPE_ERROR: undefined");
    return new Stmt(this.db, this.sql, args);
  }
  async first(col) {
    const r = this.db.prepare(this.sql).get(...this.args);
    if (!r) return null;
    const o = { ...r };
    return col ? o[col] : o;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.args).map((r) => ({ ...r })), success: true };
  }
  async run() {
    return this._run();
  }
  _run() {
    const r = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    async batch(stmts) {
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) => s._run());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
