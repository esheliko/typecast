import { NextResponse } from "next/server";
import { getLibrary, getProfile } from "@/lib/library";

export async function GET() {
  const [library, profile] = await Promise.all([getLibrary(), getProfile()]);
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), profile, library }, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="typecast-backup.json"' },
  });
}
