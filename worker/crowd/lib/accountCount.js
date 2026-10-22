/** אותו מספר חשבונות (כולל אורחים) שמופיע בכרטיס המשתמשים בניהול. */
export async function accountCount(db) {
  return (await db.prepare("SELECT COUNT(*) AS n FROM participants").first()).n;
}
