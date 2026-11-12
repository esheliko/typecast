/** Small line icons for the About tabs and facts (decorative; the text next to them names the thing). */
const P: Record<string, string> = {
  Story: "M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Zm4 3h6M8 12h6",
  Making: "M4 8h16v11H4zM4 8l2-4 3 4M9 8l3-4 3 4M15 8l3-4 2 4",
  Reception: "m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8L12 3Z",
  Watching: "M3 6h18v11H3zM8 21h8M12 17v4M10 9.5v4l4-2-4-2Z",
  "Story so far": "M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Zm4 3h6M8 12h6",
  "This episode": "M4 6h16v12H4zM9 10l5 2-5 2v-4Z",
  "What it's about": "M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Zm4 3h6M8 12h6",
  "Based on a true story?": "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
  "Who made it": "M4 8h16v11H4zM4 8l2-4 3 4M9 8l3-4 3 4",
  Music: "M9 18V6l10-2v12M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm10-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z",
  "Where it was filmed": "M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Zm0-8.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  Trivia: "M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3ZM10 19h4M10.5 21h3",
  Rating: "m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8L12 3Z",
  Awards: "M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 13v4M8 21h8M10 17h4",
  "How long is left": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 1.5",
  "Episodes left": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 1.5",
  "Post-credits scene?": "M4 5h16v14H4zM8 15h8M9 11h6",
  "Where to stream": "M3 6h18v11H3zM8 21h8M12 17v4M10 9.5v4l4-2-4-2Z",
};
export function FactIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={P[name] ?? P.Story} />
    </svg>
  );
}
