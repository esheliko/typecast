import { pickThenUrl, dHash } from "./then-photo";
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

/** The "Then" photo: the first image of the role search that is not the profile ("Now") photo, by address and by look. null keeps the profile photo. */
export function pickThen(images: GlimpseImage[] | undefined, profilePath: string | null | undefined): Promise<string | null> {
  const nowUrl = profilePath ? img(profilePath, "w185") : null;
  return pickThenUrl((images ?? []).map((i) => i.thumb), nowUrl, hashOf);
}
