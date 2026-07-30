import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Single-user gate. This dashboard runs on the Supabase service-role key
// (RLS is bypassed) and holds real founders' names, emails and LinkedIn
// URLs, and its Server Actions are POST endpoints reachable directly —
// not just through the UI. So every request, page and action alike, has to
// present the shared credential before it reaches the app.
//
// HTTP Basic over HTTPS is deliberate: no session store, no login route to
// get wrong, and the browser remembers it after one prompt. It is a gate,
// not an identity system — if this ever gets a second user, replace it with
// real auth rather than handing out the same password.

const REALM = 'Basic realm="Targets", charset="UTF-8"';

function unauthorized() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": REALM,
      // Never let an intermediary cache a 401 or the credentialed page.
      "Cache-Control": "no-store",
    },
  });
}

// Length-independent comparison, so a wrong guess can't be narrowed down by
// timing the response.
function secretsMatch(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

export function proxy(request: NextRequest) {
  const expected = process.env.DASHBOARD_PASSWORD;

  // Fail closed. A missing password must never mean "let everyone in" —
  // that is exactly how this kind of gate quietly stops gating.
  if (!expected) {
    return new NextResponse(
      "DASHBOARD_PASSWORD is not configured; refusing to serve.",
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();

  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length));
  } catch {
    return unauthorized();
  }

  // "user:password" — the username is ignored, only the secret matters.
  const password = decoded.slice(decoded.indexOf(":") + 1);
  if (!secretsMatch(password, expected)) return unauthorized();

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own build output. Server Actions POST to the
  // page routes they were defined on, so covering pages covers the actions.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
