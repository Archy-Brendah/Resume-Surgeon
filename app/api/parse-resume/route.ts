import { NextResponse } from "next/server";
import { parseResumeStructured } from "@/lib/parse-resume-structured";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Extract text from a PDF buffer using pdfjs-serverless (works in Next.js/Node without workers). */
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { getDocument } = await import("pdfjs-serverless");
  const data = new Uint8Array(buffer);
  const doc = await getDocument({
    data,
    useSystemFonts: true,
  }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = (textContent.items as { str?: string }[])
      .map((item) => item.str ?? "")
      .join(" ");
    parts.push(pageText);
    if (typeof page.cleanup === "function") page.cleanup();
  }
  if (typeof doc.destroy === "function") await doc.destroy();
  return parts.join("\n\n").replace(/\r\n/g, "\n").trim();
}
const ALLOWED_TYPES = ["application/pdf", "text/plain"];
const ALLOWED_EXTENSIONS = [".pdf", ".txt"];

function hasAllowedType(file: File): boolean {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (ALLOWED_EXTENSIONS.includes(ext)) return true;
  return ALLOWED_TYPES.includes(file.type);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5 MB." },
        { status: 400 }
      );
    }
    if (!hasAllowedType(file)) {
      return NextResponse.json(
        { error: "Only PDF and TXT files are supported." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();

    if (name.endsWith(".txt") || file.type === "text/plain") {
      const text = buffer.toString("utf-8").trim();
      const parsed = parseResumeStructured(text || "");
      return NextResponse.json(parsed);
    }

    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      try {
        const text = await extractTextFromPdf(buffer);
        const parsed = parseResumeStructured(text || "");
        return NextResponse.json(parsed);
      } catch (e) {
        console.warn("PDF extract error:", e);
        return NextResponse.json(
          { error: "Could not read this PDF. Try uploading a .txt file or paste your resume text." },
          { status: 503 }
        );
      }
    }

    return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
  } catch (err) {
    console.error("parse-resume error:", err);
    return NextResponse.json({ error: "Failed to parse file." }, { status: 500 });
  }
}
