import { stepCountIs, streamText, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { watchCast, type WatchFace } from "./answer";
import { linkPeople } from "./connect";
import { getAllCredits, getEpisode, getTitle, search } from "./tmdb";
import { spoilerPoint, type Watch } from "./watching";
import type { LibItem, MediaType, Title } from "./types";

/**
 * BENCHED: the AI version of Watching now's Ask. Off unless ASK_AI=1 (needs Vercel AI Gateway credits). The live feature is the
 * no-AI engine in answer.ts; this stays so it can be switched back on, and answers free-form questions the rules can't.
 */
export const aiEnabled = () => process.env.ASK_AI === "1";

/** Through Vercel AI Gateway: on Vercel it signs in with the project's OIDC token, so no API key is needed. Override with ASK_MODEL. */
const MODELS = [...new Set([process.env.ASK_MODEL, "anthropic/claude-sonnet-5.5", "anthropic/claude-sonnet-4.5", "anthropic/claude-haiku-4.5"].filter(Boolean) as string[])];

const yearOf = (l: { year: string }) => (l.year ? ` (${l.year})` : "");

/** Everything the assistant should know without looking anything up. Kept compact: names, roles and the user's own history. */
function context(w: Watch, t: Title, faces: WatchFace[], lib: LibItem[], spoilers: boolean): string {
  const crew = Object.entries(t.crewBy).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.slice(0, 4).map((p) => p.name).join(", ")}`).join("; ");
  const cast = faces.map((f) => `- ${f.name}${f.role ? ` as ${f.role}` : ""}${f.guest ? " (guest this episode)" : ""} [person id ${f.id}]` +
    (f.hits.length ? ` — the user has watched them in: ${f.hits.map((h) => h.title + yearOf(h)).join(", ")}` : "")).join("\n");
  const seen = lib.filter((l) => l.status !== "watchlist" && l.key !== t.key).slice(0, 400)
    .map((l) => `${l.title}${yearOf(l)}${l.status === "watched" ? "" : ` [${l.status}]`}${l.rating ? ` ★${l.rating}` : ""}`).join("; ");
  return [
    `TITLE: ${t.title}${yearOf(t)} — ${t.type === "tv" ? "TV series" : "film"} [TMDB ${t.type} ${t.id}${t.imdbId ? `, IMDb ${t.imdbId}` : ""}]`,
    t.tagline && `Tagline: ${t.tagline}`,
    `Genres: ${t.genres.join(", ") || "unknown"}. Runtime: ${t.runtime ? `${t.runtime} min${t.type === "tv" ? " per episode" : ""}` : "unknown"}.`,
    t.type === "tv" && t.seasons.length && `Seasons: ${t.seasons.map((s) => `S${s.n} (${s.eps} eps)`).join(", ")}`,
    t.overview && `Overview: ${t.overview}`,
    crew && `Crew: ${crew}`,
    `WHERE THEY ARE: ${spoilerPoint(w)} ${spoilers ? "They said spoilers are fine." : "No spoilers: never reveal anything that happens after this point (twists, deaths, who the villain is, the ending, later episodes), even indirectly. If a question can't be answered without spoilers, say so and offer to answer anyway if they ask again with spoilers on."}`,
    `CAST ON SCREEN:\n${cast || "(unknown)"}`,
    `THE USER HAS SEEN (their library): ${seen || "(nothing yet)"}`,
  ].filter(Boolean).join("\n");
}

const SYSTEM = `You are the watch companion inside Typecast, a personal film & TV app. The user is watching something RIGHT NOW and glancing at their phone,
so answer fast and short: lead with the answer in one or two sentences, then at most a few tight bullets. No preamble, no "Great question".
- "Where do I know them from" means titles in THEIR library first (given below), then the actor's best-known other work.
- For cast connections, other films, co-stars or episodes, use the tools rather than guessing; TMDB data beats memory for credits.
- For trivia, production, real events, music and filming locations, use what you know, and say "reportedly" when unsure. Never invent facts.
- If they describe someone ("the guy with the beard", "the detective"), match them to the cast and character names.
- Respect the spoiler rule exactly. Plain text, light markdown (bold, bullets) only.`;

const pick = (x: { kind: string }): x is { kind: "person"; id: number; name: string; photo: string | null; dept: string; knownFor: string[] } => x.kind === "person";

function tools(w: Watch, lib: LibItem[]) {
  const status = new Map(lib.map((l) => [l.key, l.status]));
  const findPerson = async (name: string) => (await search(name, "person")).filter(pick)[0] ?? null;
  return {
    person_credits: tool({
      description: "Someone's acting/directing credits from TMDB, most popular first, marked with whether the user has seen each. Use for 'what else was X in', 'where do I know X from'.",
      inputSchema: z.object({ name: z.string().describe("Person's name"), id: z.number().optional().describe("TMDB person id, when known from the cast list") }),
      execute: async ({ name, id }) => {
        const pid = id ?? (await findPerson(name))?.id;
        if (!pid) return { error: `No one called ${name} on TMDB.` };
        const p = await getAllCredits(pid);
        return { name: p.name, credits: p.known.slice(0, 30).map((k) => ({ title: k.title, year: k.year, type: k.type, role: k.role, userStatus: status.get(k.key) ?? null })) };
      },
    }),
    shared_work: tool({
      description: "What two people have done together (titles both were in), or co-stars that link them if none.",
      inputSchema: z.object({ a: z.string(), b: z.string(), aId: z.number().optional(), bId: z.number().optional() }),
      execute: async ({ a, b, aId, bId }) => {
        const [x, y] = await Promise.all([aId ?? findPerson(a).then((p) => p?.id), bId ?? findPerson(b).then((p) => p?.id)]);
        if (!x || !y) return { error: "Couldn't find both people." };
        const l = await linkPeople(x, y);
        return {
          together: l.shared.slice(0, 15).map((s) => ({ title: s.title, year: s.year, roles: s.roles, userStatus: status.get(s.key) ?? null })),
          linkedVia: l.bridges.map((br) => `${br.person.name}: ${br.viaA.title} with ${l.a.name}, ${br.viaB.title} with ${l.b.name}`),
        };
      },
    }),
    title_info: tool({
      description: "Look up another film or series on TMDB: overview, year, director and top cast.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const hit = (await search(query, "title")).find((h) => h.kind === "title");
        if (!hit || hit.kind !== "title") return { error: `Nothing found for ${query}.` };
        const t = await getTitle(hit.type as MediaType, hit.id);
        return { title: t.title, year: t.year, type: t.type, overview: t.overview, director: t.crew, cast: t.people.slice(0, 12).map((c) => `${c.name} as ${c.role}`), userStatus: status.get(t.key) ?? null };
      },
    }),
    ...(w.type === "tv" ? {
      episode: tool({
        description: "The name, cast and guest stars of an episode of the series being watched.",
        inputSchema: z.object({ season: z.number(), episode: z.number() }),
        execute: async ({ season, episode }) => {
          const ep = await getEpisode(w.id, season, episode);
          return { name: ep.name, cast: ep.cast.map((c) => `${c.name} as ${c.role}`), guests: ep.guests.map((c) => `${c.name} as ${c.role}`) };
        },
      }),
    } : {}),
  };
}

export interface AskInput { messages: { role: "user" | "assistant"; content: string }[]; spoilers: boolean }

/**
 * Streams the answer as plain text. Tries each model in turn: one that fails before saying anything (unknown id, provider down)
 * hands over to the next, so the companion keeps working when model names change.
 */
export async function ask(w: Watch, lib: LibItem[], input: AskInput): Promise<ReadableStream<Uint8Array>> {
  const { title, faces } = await watchCast(w, lib);
  const messages: ModelMessage[] = input.messages.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  const system = `${SYSTEM}\n\n${context(w, title, faces, lib, input.spoilers)}`;
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(ctl) {
      let last = "";
      for (const model of MODELS) {
        let said = false;
        try {
          const r = streamText({ model, system, messages, tools: tools(w, lib), stopWhen: stepCountIs(5), maxOutputTokens: 900, maxRetries: 1 });
          for await (const part of r.fullStream) {
            if (part.type === "text-delta") { said = true; ctl.enqueue(enc.encode(part.text)); }
            else if (part.type === "error") throw part.error;
          }
          if (said) { ctl.close(); return; }
          last = "empty answer";
        } catch (e) {
          last = String((e as Error)?.message ?? e).slice(0, 300);
          console.error(JSON.stringify({ ask_error: last, model }));
          if (said) { ctl.enqueue(enc.encode("\n\n(The answer was cut off. Ask again?)")); ctl.close(); return; }
        }
      }
      ctl.enqueue(enc.encode(`⚠ Couldn't reach the AI right now. ${/credit|billing|payment|quota/i.test(last) ? "AI Gateway credits may have run out." : "Try again in a moment."}`));
      ctl.close();
    },
  });
}
