// The id of the deployment that is currently live. Open tabs poll this (see UpdateWatcher) to notice a new deploy.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ id: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}
