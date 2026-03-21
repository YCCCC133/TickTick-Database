import type { NextRequest } from "next/server";

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const withProtocol = value.startsWith("http") ? value : `https://${value}`;
    const url = new URL(withProtocol);
    return url.origin;
  } catch {
    return null;
  }
}

export function getPublicOrigin(request?: NextRequest): string {
  if (request) {
    return request.nextUrl.origin;
  }

  const vercelUrl = normalizeOrigin(process.env.VERCEL_URL);
  if (vercelUrl) return vercelUrl;

  const configured = normalizeOrigin(process.env.COZE_PROJECT_DOMAIN_DEFAULT);
  if (configured) return configured;

  return "http://localhost:5000";
}
