import { invoke } from "@tauri-apps/api/core";

import type { NormalizedLines } from "../types/domain";

export interface ImageInfo {
  path: string;
  name: string;
  width: number;
  height: number;
  format: string;
  orientationApplied: boolean;
}

export interface PreviewDto {
  dataUrl: string;
  width: number;
  height: number;
}

export interface ExportRequest {
  sourcePath: string;
  outputDirectory?: string;
  baseName?: string;
  lines: NormalizedLines;
}

export interface ExportedFile {
  index: number;
  path: string;
  width: number;
  height: number;
  lossless: boolean;
}

export const probeImages = (paths: string[]) =>
  invoke<ImageInfo[]>("probe_images", { paths });

export const createPreview = (path: string, maxEdge = 1600) =>
  invoke<PreviewDto>("create_preview", { path, maxEdge });

export const exportImage = (request: ExportRequest) =>
  invoke<ExportedFile[]>("export_image", { request });
