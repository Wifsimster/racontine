import {
  consumeStagedUploads,
  resolveStagedUploads,
  type ResolvedUploads,
} from "../mcp-uploads.js";

export interface StagedUploads {
  resolve(userId: string, ids: string[]): Promise<ResolvedUploads>;
  consume(userId: string, ids: string[]): Promise<void>;
}

export class DbStagedUploads implements StagedUploads {
  resolve(userId: string, ids: string[]): Promise<ResolvedUploads> {
    return resolveStagedUploads(userId, ids);
  }
  consume(userId: string, ids: string[]): Promise<void> {
    return consumeStagedUploads(userId, ids);
  }
}
