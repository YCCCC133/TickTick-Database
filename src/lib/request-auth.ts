import type { NextRequest } from "next/server";

export function getRequestAuthToken(request: NextRequest): string | null {
  const headerToken = request.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (headerToken) {
    return headerToken;
  }

  const cookieToken = request.cookies.get("auth_token")?.value?.trim();
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}
