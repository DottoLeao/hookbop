import { NextResponse, type NextRequest } from 'next/server';
import { resolveShareRedirect } from '@/lib/youtube/shareRedirect';

// The target of the Android share menu (see src/app/manifest.ts). Reading the request's search params makes this
// run at request time, so it is never prerendered. Like every page it is for members only (see src/proxy.ts).
export function GET(request: NextRequest) {
  const target = resolveShareRedirect(request.nextUrl.searchParams);
  // 307 keeps the method. The origin is the one the request came to, so previews and localhost stay where they are.
  return NextResponse.redirect(new URL(target, request.nextUrl.origin), 307);
}
