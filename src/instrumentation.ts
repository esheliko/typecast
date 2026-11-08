/**
 * One structured line in the Vercel runtime logs for every failed server render, route handler or server action.
 * Production hides the real message from the browser and shows only a digest; the digest printed here is the same one,
 * so "Reference 2918209373" on screen finds the cause with: node scripts/logs.mjs --digest 2918209373
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string; renderSource?: string },
) {
  const e = err as { digest?: string; message?: string; stack?: string } | undefined;
  console.error(JSON.stringify({
    event: "request_error",
    digest: e?.digest ?? null,
    message: e?.message ?? String(err),
    route: context.routePath,
    routeType: context.routeType, // render | route | action | proxy
    renderSource: context.renderSource ?? null,
    method: request.method,
    path: request.path.split("?")[0], // never log query strings
    stack: e?.stack?.split("\n").slice(0, 6).join("\n"),
  }));
}
