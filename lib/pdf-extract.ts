/**
 * Edge-compatible PDF text extraction using pdfjs-serverless.
 * Uses ArrayBuffer (no Node Buffer) for Cloudflare Workers / Edge runtimes.
 */
import { resolvePDFJS } from "pdfjs-serverless";

export async function extractTextFromPDF(
  data: ArrayBuffer | Uint8Array
): Promise<string> {
  const { getDocument } = await resolvePDFJS();
  const uint8 = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

  const doc = await getDocument({
    data: uint8,
    useSystemFonts: true,
  }).promise;

  const numPages = doc.numPages;
  const pageTexts: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pageTexts.push(text);
  }

  return pageTexts.join("\n");
}
