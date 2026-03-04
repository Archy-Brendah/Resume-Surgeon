import { NextResponse } from "next/server";

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function suggestCleanUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  try {
    let href = trimmed;
    if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
    const u = new URL(href);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "") || "";

    if (host === "linkedin.com" || host === "www.linkedin.com") {
      const match = path.match(/\/in\/([^/?]+)/);
      return match ? `linkedin.com/in/${match[1]}` : `linkedin.com${path}`;
    }
    if (host === "github.com") {
      const parts = path.split("/").filter(Boolean);
      return parts.length >= 1 ? `github.com/${parts[0]}` : "github.com";
    }
    if (host === "twitter.com" || host === "x.com") {
      const match = path.match(/\/([^/?]+)/);
      return match ? `${host}/${match[1]}` : host;
    }
    return `${host}${path}`;
  } catch {
    return trimmed;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const urlParam = searchParams.get("url");
  if (!urlParam?.trim()) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400 }
    );
  }

  const raw = urlParam.trim();
  let href = raw;
  if (!/^https?:\/\//i.test(href)) href = `https://${href}`;

  if (!isValidUrl(href)) {
    return NextResponse.json({
      valid: false,
      cleanUrl: null,
      suggestion: suggestCleanUrl(raw),
    });
  }

  const cleanUrl = suggestCleanUrl(raw);

  let valid = false;
  try {
    const res = await fetch(href, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "ResumeSurgeon-LinkChecker/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    valid = res.ok || res.status < 400;
  } catch {
    valid = false;
  }

  return NextResponse.json({
    valid,
    cleanUrl: cleanUrl !== raw ? cleanUrl : undefined,
    suggestion: cleanUrl !== raw ? cleanUrl : undefined,
  });
}
