/** כתובות הפרסום. הקישורים בדפדפן נשארים באתר שבו הגולש נמצא; הנתונים הנבנים משתמשים בכתובת הקבועה. */
export const LEGACY_SITE_URL = "https://hopetohelp.github.io/26/";
export const PARALLEL_SITE_URL = "https://26.hopetohelp.net/";

export const siteUrl = () =>
  typeof window !== "undefined" && window.location.origin === new URL(PARALLEL_SITE_URL).origin
    ? PARALLEL_SITE_URL
    : LEGACY_SITE_URL;
