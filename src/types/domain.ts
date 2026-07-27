export type TaskStatus =
  | "analyzing"
  | "ready"
  | "needs-review"
  | "exporting"
  | "success"
  | "failed";

export interface ImageTask {
  id: string;
  path: string;
  name: string;
  width: number;
  height: number;
  previewUrl?: string;
  status: TaskStatus;
  error?: string;
}

export interface NormalizedLines {
  vertical: number[];
  horizontal: number[];
}

export interface CutLine {
  id: string;
  position: number;
  locked: boolean;
}

export interface LayoutDraft {
  vertical: CutLine[];
  horizontal: CutLine[];
}

export interface LayoutProposal extends NormalizedLines {
  templateId: string;
  confidence: number;
  requiresReview: boolean;
}

export type ExportFormat = "png" | "jpeg" | "webp-lossless" | "webp-lossy";

export interface ExportSettings {
  format: ExportFormat;
  quality: number;
  outputDirectory?: string;
  openDirectoryWhenDone: boolean;
}
