import { extractFromImages } from "../vlm.js";
import type { CarnetDay } from "../domain/carnet.js";
import type { CarnetReader, GlossaryEntry } from "../ports.js";

/**
 * La lecture de carnet par l'API vision d'Anthropic. Le port `CarnetReader` ne
 * dit rien du fournisseur : un VLM local (option prévue au plan produit) se
 * branche en écrivant une autre classe ici, sans toucher aux services.
 */
export class AnthropicCarnetReader implements CarnetReader {
  read(
    pages: Buffer[],
    apiKey: string,
    glossary: GlossaryEntry[],
  ): Promise<CarnetDay[]> {
    return extractFromImages(pages, apiKey, glossary);
  }
}
