import { extractFromImages } from "../vlm.js";
import type { CarnetDay } from "../domain/carnet.js";
import type { CarnetReader, GlossaryEntry } from "../ports.js";

export class AnthropicCarnetReader implements CarnetReader {
  read(
    pages: Buffer[],
    apiKey: string,
    glossary: GlossaryEntry[],
  ): Promise<CarnetDay[]> {
    return extractFromImages(pages, apiKey, glossary);
  }
}
