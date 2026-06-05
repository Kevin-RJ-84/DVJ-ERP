import { NextResponse, type NextRequest } from "next/server";
import { getJwtCookieName, verifyAuthToken } from "@/lib/auth";
import { enrichAuthPayload } from "@/lib/auth-session-resolve";

const PUBLIC_PATH_PREFIXES = ["/login", "/forgot-password", "/invite"];
const PUBLIC_API_PATHS = [
  "/api/auth/login",
  "/api/auth/forgot-password",
  "/api/auth/verify-otp",
  "/api/auth/reset-password",
];
const PUBLIC_API_PREFIXES = ["/api/auth/invite/"];
/** Page/API prefixes → JWT permission required (any match in `permissions[]` grants access). */
function permissionsRequiredForPath(request: NextRequest): string[] | null {
  const { pathname } = request.nextUrl;
  const method = request.method;
  if (pathname.startsWith("/api/dashboard")) {
    return ["dashboard.view", "replenishment.view"];
  }
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return ["dashboard.view", "replenishment.view"];
  }
  if (pathname === "/excel-config" || pathname.startsWith("/excel-config/")) {
    return ["excel_config.view"];
  }
  if (pathname === "/users" || pathname.startsWith("/users/")) {
    return ["users.view"];
  }
  if (pathname === "/roles" || pathname.startsWith("/roles/")) {
    return ["roles.view"];
  }
  if (
    pathname === "/replenishment-history" ||
    pathname.startsWith("/replenishment-history/")
  ) {
    return ["replenishment_history.view"];
  }
  if (pathname === "/settings") {
    return ["settings.view"];
  }
  if (pathname === "/api/users/profile" || pathname === "/api/users/avatar") {
    return null;
  }
  if (pathname.startsWith("/api/users")) {
    return ["users.view"];
  }
  if (pathname.startsWith("/api/excel-config")) {
    return ["excel_config.view"];
  }
  if (pathname.startsWith("/api/settings")) {
    return ["settings.view"];
  }
  if (pathname.startsWith("/api/roles")) {
    return ["roles.view"];
  }
  if (pathname.startsWith("/api/permissions")) {
    return ["roles.view"];
  }
  if (pathname === "/api/replenishment/undo") {
    return ["replenishment.undo"];
  }
  if (pathname === "/api/replenishment/confirm") {
    return ["replenishment.confirm"];
  }
  if (pathname.startsWith("/api/replenishment/history")) {
    return ["replenishment_history.view"];
  }
  if (pathname.startsWith("/api/stock-replenishment/thresholds")) {
    return method === "POST" ? ["settings.edit"] : ["settings.view"];
  }
  if (pathname.startsWith("/api/stock-replenishment")) {
    return ["stock_replenishment.view", "replenishment.view"];
  }
  if (pathname === "/stock-replenishment" || pathname.startsWith("/stock-replenishment/")) {
    return ["stock_replenishment.view", "replenishment.view"];
  }
  return null;
}

function isPublicPath(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isInvitePath(pathname: string) {
  return pathname === "/invite" || pathname.startsWith("/invite/");
}

function isPublicApiPath(pathname: string) {
  if (PUBLIC_API_PATHS.includes(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

/** Files in /public — must bypass auth or `next/image` gets HTML redirects instead of bytes. */
function isPublicStaticAsset(pathname: string) {
  if (pathname.startsWith("/api/")) {
    return false;
  }
  return /\.(?:svg|png|jpe?g|gif|webp|ico|woff2?|ttf|txt|xml|webmanifest)$/i.test(
    pathname,
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(getJwtCookieName())?.value;
  const isPublic = isPublicPath(pathname) || isPublicApiPath(pathname);

  let authPayload: Awaited<ReturnType<typeof verifyAuthToken>> | null = null;
  if (token) {
    try {
      authPayload = await enrichAuthPayload(await verifyAuthToken(token));
    } catch {
      authPayload = null;
    }
  }

  if (!authPayload && !isPublic) {
    if (isApiPath(pathname)) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (authPayload && isPublicPath(pathname) && !isInvitePath(pathname)) {
    const destination = authPayload.isFirstLogin ? "/change-password" : "/";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  if (
    authPayload &&
    authPayload.isFirstLogin &&
    pathname !== "/change-password" &&
    pathname !== "/api/auth/change-password"
  ) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { message: "Password reset required before continuing." },
        { status: 403 },
      );
    }

    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  const required = permissionsRequiredForPath(request);
  if (
    authPayload &&
    required &&
    !required.some((p) => authPayload.permissions.includes(p))
  ) {
    if (isApiPath(pathname)) {
      return NextResponse.json({ message: "Forbidden." }, { status: 403 });
    }

    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
