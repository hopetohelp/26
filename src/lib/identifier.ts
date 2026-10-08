/** שם משתמש יכול להיות כתובת מייל (הכרעת בעלים 8.10.2026). מייל לא מוצג בשלמותו ולא משותף: מסתירים את רוב המקומי. */
export const isEmail = (name: string | null | undefined): boolean => !!name && name.includes("@");

export function maskIdentifier(name: string): string {
  const at = name.lastIndexOf("@");
  if (at < 1) return name;
  return `${name[0]}***${name.slice(at)}`;
}
