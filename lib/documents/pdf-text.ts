import { extractText, getDocumentProxy } from "unpdf";

export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

/** Extracts selectable text page by page. */
export async function extractPdfPages(bytes: Uint8Array): Promise<{ pages: string[]; pageCount: number }> {
  // pdf.js may transfer (detach) the buffer: always pass a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [text]).map((t) => t ?? "");
  return { pages, pageCount: totalPages };
}

export interface TextChunk {
  pageNumber: number;
  chunkIndex: number;
  content: string;
}

/** Splits page text into ~maxChars chunks on whitespace boundaries (search/citation units). */
export function chunkPages(pages: string[], maxChars = 1500): TextChunk[] {
  const chunks: TextChunk[] = [];
  let index = 0;
  pages.forEach((raw, i) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) return;
    let start = 0;
    while (start < text.length) {
      let end = Math.min(text.length, start + maxChars);
      if (end < text.length) {
        const space = text.lastIndexOf(" ", end);
        if (space > start + maxChars * 0.6) end = space;
      }
      chunks.push({ pageNumber: i + 1, chunkIndex: index++, content: text.slice(start, end).trim() });
      start = end;
    }
  });
  return chunks;
}

/** Page-tagged text for LLM prompts, so the model can cite page numbers. */
export function tagPages(pages: string[]): string {
  return pages.map((p, i) => `--- Pagina ${i + 1} ---\n${p.trim()}`).join("\n\n");
}
