/**
 * בניית סרטון הנתונים בדפדפן של הגולש — בלי שרת ובלי עלות.
 * מסלול ראשי: WebCodecs מקודד את התמונה ל-H.264, והמוזיקה — קובץ AAC קבוע באתר — נארזת כמו שהיא ל-MP4
 * (בלי מקודד שמע: אין כזה בכל דפדפן, והמוזיקה ממילא זהה בכל סרטון). מהיר מזמן אמת, וקובץ שווטסאפ מקבל.
 * גיבוי: הקלטה בזמן אמת (MediaRecorder) לדפדפן בלי WebCodecs; MP4 כשנתמך, אחרת WebM.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { drawPromo, promoFx, PROMO, type PromoData } from "./promoVideo";

const { W, H, FPS, DUR } = PROMO;
const FRAMES = FPS * DUR, RATE = 48000;
export interface PromoFile { blob: Blob; name: string; type: string }
const NAME = "elections26-polls-vs-guesses";  // שם באנגלית: שם עברי לא עבר בהורדה בחלק מהדפדפנים
const canvas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const musicUrl = () => `${import.meta.env.BASE_URL}promo/music.aac`;

/** מסגרות AAC מתוך קובץ ADTS (כותרת של 7 או 9 בתים לכל מסגרת) */
function adtsFrames(buf: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i + 7 <= buf.length;) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xf0) !== 0xf0) break;
    const head = buf[i + 1] & 1 ? 7 : 9, len = ((buf[i + 3] & 3) << 11) | (buf[i + 4] << 3) | (buf[i + 5] >> 5);
    if (len <= head || i + len > buf.length) break;
    out.push(buf.subarray(i + head, i + len)); i += len;
  }
  return out;
}

async function webCodecs(d: PromoData, aac: Uint8Array | null, onProgress: (k: number) => void): Promise<PromoFile | null> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return null;
  const video = { codec: "avc1.640028", width: W, height: H, bitrate: 5_000_000, framerate: FPS };
  if (!(await VideoEncoder.isConfigSupported(video).catch(() => null))?.supported) return null;
  const frames = aac ? adtsFrames(aac).slice(1) : [];  // המסגרת הראשונה = ריפוד הפתיחה של AAC (1024 דגימות); בלעדיה השמע מדויק לתמונה
  const muxer = new Muxer({ target: new ArrayBufferTarget(), fastStart: "in-memory", firstTimestampBehavior: "offset", video: { codec: "avc", width: W, height: H, frameRate: FPS }, ...(frames.length ? { audio: { codec: "aac" as const, numberOfChannels: 2, sampleRate: RATE } } : {}) });
  let failed: unknown = null;
  const ve = new VideoEncoder({ output: (ch, meta) => muxer.addVideoChunk(ch, meta), error: e => { failed = e; } });
  ve.configure(video);
  const cv = canvas(W, H), ctx = cv.getContext("2d")!, fx = promoFx(canvas);
  for (let i = 0; i < FRAMES; i++) {
    if (failed) throw failed;
    drawPromo(ctx, i / FPS, d, fx);
    const frame = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    ve.encode(frame, { keyFrame: i % (FPS * 2) === 0 }); frame.close();
    while (ve.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
    if (i % 10 === 0) { onProgress(i / FRAMES); await new Promise(r => setTimeout(r, 0)); }
  }
  await ve.flush(); ve.close();
  if (failed) throw failed;
  // AAC-LC, 48kHz, סטריאו: AudioSpecificConfig = 0x11 0x90; כל מסגרת = 1024 דגימות
  const step = 1024 / RATE * 1e6, meta = { decoderConfig: { codec: "mp4a.40.2", sampleRate: RATE, numberOfChannels: 2, description: new Uint8Array([0x11, 0x90]) } };
  frames.slice(0, Math.ceil(DUR * 1e6 / step)).forEach((f, i) => muxer.addAudioChunkRaw(f, "key", Math.round(i * step), Math.round(step), i ? undefined : meta));
  muxer.finalize();
  onProgress(1);
  return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), name: `${NAME}.mp4`, type: "video/mp4" };
}

/** גיבוי: מנגנים ומקליטים בזמן אמת (20 שניות) */
async function realtime(d: PromoData, aac: Uint8Array | null, onProgress: (k: number) => void): Promise<PromoFile> {
  const cv = canvas(W, H), ctx = cv.getContext("2d")!, fx = promoFx(canvas);
  drawPromo(ctx, 0, d, fx);
  const stream = cv.captureStream(FPS), ac = new AudioContext({ sampleRate: RATE });
  const audio = aac ? await ac.decodeAudioData(aac.slice().buffer).catch(() => null) : null;
  let src: AudioBufferSourceNode | null = null;
  if (audio) { const dest = ac.createMediaStreamDestination(); src = ac.createBufferSource(); src.buffer = audio; src.connect(dest); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t)); }
  const type = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find(t => MediaRecorder.isTypeSupported(t)) ?? "";
  const rec = new MediaRecorder(stream, { mimeType: type || undefined, videoBitsPerSecond: 5_000_000 }), parts: Blob[] = [];
  rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
  const done = new Promise<void>(r => { rec.onstop = () => r(); });
  rec.start(250); src?.start();
  const t0 = ac.currentTime;
  try {
    await new Promise<void>((r, fail) => {
      const tick = () => {
        // שגיאה בציור — מסיימים בכישלון (ולא נתקעים על "יוצרים סרטון…")
        try { const t = ac.currentTime - t0; drawPromo(ctx, Math.min(t, DUR), d, fx); onProgress(Math.min(1, t / DUR)); if (t >= DUR) r(); else requestAnimationFrame(tick); } catch (e) { fail(e); }
      };
      requestAnimationFrame(tick);
    });
  } catch (e) { rec.stop(); src?.stop(); void ac.close(); throw e; }
  rec.stop(); await done; void ac.close();
  const mp4 = (rec.mimeType || type).includes("mp4");
  return { blob: new Blob(parts, { type: mp4 ? "video/mp4" : "video/webm" }), name: `${NAME}.${mp4 ? "mp4" : "webm"}`, type: mp4 ? "video/mp4" : "video/webm" };
}

/** הסרטון כקובץ. onProgress — 0..1 */
export async function renderPromoVideo(d: PromoData, onProgress: (k: number) => void = () => {}): Promise<PromoFile> {
  const aac = await fetch(musicUrl()).then(r => r.ok ? r.arrayBuffer() : null).then(b => b && new Uint8Array(b)).catch(() => null);
  try { const f = await webCodecs(d, aac, onProgress); if (f) return f; } catch { /* נופלים להקלטה בזמן אמת */ }
  return realtime(d, aac, onProgress);
}
