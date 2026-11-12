import { pickThenUrl, dHash, rankThenImages, type ThenWho } from "./then-photo";
import { img } from "./img";
import type { GlimpseImage } from "@/app/api/glimpse/route";

const hashes = new Map<string, Promise<string | null>>();

/** Browser only: 9x8 grayscale difference hash of an image, or null when it cannot be read (no CORS, load error, timeout). */
function hashOf(url: string): Promise<string | null> {
  let p = hashes.get(url);
  if (!p) {
    p = new Promise<string | null>((done) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.referrerPolicy = "no-referrer";
      const t = setTimeout(() => done(null), 8000);
      im.onload = () => {
        clearTimeout(t);
        try {
          const c = document.createElement("canvas");
          c.width = 9; c.height = 8;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (!ctx) return done(null);
          ctx.drawImage(im, 0, 0, 9, 8);
          const d = ctx.getImageData(0, 0, 9, 8).data;
          const g: number[] = [];
          for (let i = 0; i < 72; i++) g.push(d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114);
          done(dHash(g));
        } catch { done(null); }
      };
      im.onerror = () => { clearTimeout(t); done(null); };
      im.src = url;
    });
    hashes.set(url, p);
  }
  return p;
}

/** The "Then" photo: the best role-search image that looks like a picture from the work (not a headshot, see `thenScore`) and is not the profile ("Now") photo, by address and by look. null keeps the profile photo. */
export function pickThen(images: GlimpseImage[] | undefined, profilePath: string | null | undefined, who: ThenWho): Promise<string | null> {
  const nowUrl = profilePath ? img(profilePath, "w185") : null;
  const ranked = rankThenImages((images ?? []).map((i) => ({ thumb: i.thumb, page: i.page, title: i.title, w: i.w, h: i.h })), who);
  return pickThenUrl(ranked.map((i) => i.thumb), nowUrl, hashOf);
}
