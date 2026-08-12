/**
 * Best-effort OCR of a card photo. Extracts likely card-name candidates
 * from the top portion of the image (where GA titles usually sit).
 */
export async function extractCardNameCandidates(
  image: Blob | HTMLCanvasElement,
): Promise<string[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");

  try {
    const {
      data: { text },
    } = await worker.recognize(image);
    return rankNameCandidates(text);
  } finally {
    await worker.terminate();
  }
}

export function rankNameCandidates(ocrText: string): string[] {
  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.replace(/[^A-Za-z0-9' :-]/g, "").trim())
    .filter((line) => line.length >= 3);

  const scored = lines
    .map((line) => {
      const letters = (line.match(/[A-Za-z]/g) ?? []).length;
      const ratio = letters / Math.max(line.length, 1);
      // Prefer title-like lines: mostly letters, not too long.
      const lengthScore = line.length >= 4 && line.length <= 40 ? 1 : 0.4;
      return { line, score: ratio * lengthScore };
    })
    .filter((item) => item.score >= 0.55)
    .sort((a, b) => b.score - a.score);

  const unique: string[] = [];
  for (const item of scored) {
    const normalized = item.line.replace(/\s+/g, " ").trim();
    if (!unique.some((u) => u.toLowerCase() === normalized.toLowerCase())) {
      unique.push(normalized);
    }
    if (unique.length >= 5) break;
  }
  return unique;
}
