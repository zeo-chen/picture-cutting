# Grid Image Cutter V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a macOS and Windows Tauri desktop application that imports 2K–4K grid images, proposes cut lines, supports exact manual correction, and exports pixel-accurate crops without using preview pixels.

**Architecture:** React and TypeScript render a three-column workbench and keep normalized cut-line state. Tauri commands call focused Rust modules for metadata probing, preview generation, seam analysis, geometry validation, and atomic export from the original file. Batch jobs reuse the same immutable crop specification so single-image and multi-image output follow identical pixel rules.

**Tech Stack:** Tauri 2, React, TypeScript, Vite, Zustand, SVG overlays, Vitest, Testing Library, Rust 1.86+, `image`, `png`, `kamadak-exif`, `rayon`, `serde`, `thiserror`, and Tauri dialog/opener plugins.

---

## File structure

The implementation will create these focused units:

```text
picture-cutting/
├── package.json                         # Frontend scripts and dependencies
├── vite.config.ts                       # Vite and Vitest configuration
├── src/
│   ├── app/App.tsx                      # Workbench composition only
│   ├── app/App.test.tsx                 # Main-flow component tests
│   ├── components/task-list/            # Import list and status filtering
│   ├── components/canvas/               # Preview image and SVG cut overlay
│   ├── components/settings/             # Template and export controls
│   ├── components/results/              # Batch summary and retry UI
│   ├── features/import/importImages.ts  # Dialog-to-store import orchestration
│   ├── features/export/exportImages.ts  # Export command orchestration
│   ├── lib/coordinates.ts                # Preview/normalized coordinate helpers
│   ├── lib/tauri.ts                      # Typed Tauri command wrappers
│   ├── store/workbenchStore.ts           # Frontend task and selection state
│   └── types/domain.ts                   # Shared frontend domain types
├── src-tauri/
│   ├── capabilities/default.json        # Minimal dialog/opener permissions
│   ├── src/lib.rs                        # Tauri builder and command registration
│   ├── src/main.rs                       # Desktop entry point only
│   ├── src/commands.rs                   # Request validation and DTO mapping
│   ├── src/domain.rs                     # Rust DTOs and domain types
│   ├── src/geometry.rs                   # Integer crop-region generation
│   ├── src/image_probe.rs                # Metadata and orientation probing
│   ├── src/preview.rs                    # Display-only preview generation
│   ├── src/export.rs                     # Original-pixel crop and encoding
│   ├── src/naming.rs                     # Output paths and collision handling
│   ├── src/templates.rs                  # Built-in and custom layouts
│   ├── src/detection.rs                  # Seam scoring and confidence
│   ├── src/batch.rs                      # Controlled-concurrency batch runner
│   └── tests/                            # Rust integration and image regression tests
├── tests/fixtures/                       # Deterministic generated image fixtures
└── docs/verification.md                  # macOS/Windows release checklist
```

The preview module is intentionally unable to export. The export module receives source paths and crop specifications and always decodes the source file again.

## Task 1: Scaffold the Tauri application and test harness

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/App.test.tsx`
- Create: `src/styles/global.css`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Generate the Tauri React TypeScript skeleton**

Run from the repository root:

```bash
npm create tauri-app@latest . -- --template react-ts --manager npm --tauri-version 2 --force
npm install
npm install zustand zod
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install @tauri-apps/plugin-dialog @tauri-apps/plugin-opener
```

Expected: Tauri creates the frontend and `src-tauri` skeleton without deleting `docs/` or `.gitignore`.

- [ ] **Step 2: Add the failing workbench smoke test**

Create `src/app/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the three workbench regions", () => {
    render(<App />);
    expect(screen.getByRole("complementary", { name: "图片任务" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "切割画布" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "切割设置" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- --run src/app/App.test.tsx`

Expected: FAIL because `App` does not yet export the required workbench landmarks.

- [ ] **Step 4: Implement the minimal three-column shell**

Replace `src/app/App.tsx` with:

```tsx
import "../styles/global.css";

export function App() {
  return (
    <div className="workbench">
      <aside aria-label="图片任务" className="panel panel--left">图片任务</aside>
      <main aria-label="切割画布" className="canvas-panel">导入图片后开始切割</main>
      <aside aria-label="切割设置" className="panel panel--right">切割设置</aside>
    </div>
  );
}
```

Add the layout rules to `src/styles/global.css`:

```css
:root { font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif; color: #e5e7eb; background: #11151b; }
* { box-sizing: border-box; }
body { margin: 0; min-width: 1024px; min-height: 100vh; }
button, input, select { font: inherit; }
.workbench { display: grid; grid-template-columns: 260px minmax(0, 1fr) 300px; min-height: 100vh; }
.panel { background: #f8fafc; color: #172033; padding: 16px; }
.panel--left { border-right: 1px solid #dce2ea; }
.panel--right { border-left: 1px solid #dce2ea; }
.canvas-panel { display: grid; place-items: center; min-width: 0; background: #20252d; }
```

Configure `package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest",
    "test:run": "vitest run",
    "tauri": "tauri"
  }
}
```

- [ ] **Step 5: Run frontend and Rust smoke checks**

Run:

```bash
npm test -- --run src/app/App.test.tsx
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit the scaffold**

```bash
git add package.json package-lock.json vite.config.ts tsconfig*.json index.html src src-tauri
git commit -m "chore: scaffold Tauri image cutter"
```

## Task 2: Define shared domain types and workbench state

**Files:**
- Create: `src/types/domain.ts`
- Create: `src/store/workbenchStore.ts`
- Create: `src/store/workbenchStore.test.ts`
- Create: `src-tauri/src/domain.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing store tests**

Create `src/store/workbenchStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useWorkbenchStore } from "./workbenchStore";

describe("workbench store", () => {
  beforeEach(() => useWorkbenchStore.getState().reset());

  it("selects the first imported task", () => {
    useWorkbenchStore.getState().addTasks([
      { id: "a", path: "/tmp/a.png", name: "a.png", width: 4000, height: 3000, status: "ready" },
      { id: "b", path: "/tmp/b.png", name: "b.png", width: 4000, height: 3000, status: "ready" }
    ]);
    expect(useWorkbenchStore.getState().selectedTaskId).toBe("a");
  });

  it("stores normalized lines in ascending order", () => {
    useWorkbenchStore.getState().setLines("a", { vertical: [0.75, 0.25], horizontal: [0.5] });
    expect(useWorkbenchStore.getState().layouts.a.vertical.map((line) => line.position)).toEqual([0.25, 0.75]);
  });
});
```

- [ ] **Step 2: Run the store test to verify it fails**

Run: `npm test -- --run src/store/workbenchStore.test.ts`

Expected: FAIL because the store and types do not exist.

- [ ] **Step 3: Implement frontend domain types**

Create `src/types/domain.ts`:

```ts
export type TaskStatus = "analyzing" | "ready" | "needs-review" | "exporting" | "success" | "failed";

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
```

- [ ] **Step 4: Implement the Zustand store**

Create `src/store/workbenchStore.ts` with an explicit `WorkbenchState` containing `tasks`, `selectedTaskId`, `layouts: Record<string, LayoutDraft>`, `exportSettings`, `addTasks`, `selectTask`, `setLines`, `moveLine`, `addLine`, `removeLine`, `toggleLineLock`, `setTaskStatus`, and `reset`. `setLines` must filter values to `0 < value < 1`, remove duplicates, sort ascending, and create stable IDs in the form `${axis}-${position.toFixed(8)}`. Movement preserves the existing ID so selection remains stable.

Use this exact normalization helper inside the file:

```ts
const normalize = (values: number[]) =>
  [...new Set(values.filter((value) => value > 0 && value < 1))].sort((a, b) => a - b);
```

Convert a `LayoutDraft` to the Rust-facing `NormalizedLines` only in `src/lib/tauri.ts` by mapping each line to `line.position`. Lock state is an editor concern and is never sent to the crop engine.

Initialize export settings as:

```ts
{ format: "png", quality: 92, openDirectoryWhenDone: true }
```

- [ ] **Step 5: Define matching Rust DTOs**

Create `src-tauri/src/domain.rs` with serde camelCase DTOs:

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    pub path: PathBuf,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub orientation_applied: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedLines {
    pub vertical: Vec<f64>,
    pub horizontal: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CropRegion {
    pub index: usize,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}
```

Register the module with `mod domain;` in `src-tauri/src/lib.rs`.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npm test -- --run src/store/workbenchStore.test.ts
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

Commit:

```bash
git add src/types src/store src-tauri/src/domain.rs src-tauri/src/lib.rs
git commit -m "feat: define image cutting domain state"
```

## Task 3: Build the pixel-exact geometry engine

**Files:**
- Create: `src-tauri/src/geometry.rs`
- Create: `src-tauri/tests/geometry_test.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing geometry tests**

Create `src-tauri/tests/geometry_test.rs`:

```rust
use picture_cutting_lib::domain::NormalizedLines;
use picture_cutting_lib::geometry::build_regions;

#[test]
fn two_by_two_uses_every_pixel_once() {
    let regions = build_regions(3840, 2160, &NormalizedLines {
        vertical: vec![0.5],
        horizontal: vec![0.5],
    }).unwrap();
    assert_eq!(regions.len(), 4);
    assert_eq!((regions[0].width, regions[0].height), (1920, 1080));
    assert_eq!(regions.iter().map(|r| r.width as u64 * r.height as u64).sum::<u64>(), 3840 * 2160);
}

#[test]
fn odd_dimensions_assign_remainder_without_gaps() {
    let regions = build_regions(5, 3, &NormalizedLines {
        vertical: vec![0.5],
        horizontal: vec![],
    }).unwrap();
    assert_eq!((regions[0].x, regions[0].width), (0, 3));
    assert_eq!((regions[1].x, regions[1].width), (3, 2));
}

#[test]
fn rejects_duplicate_pixel_boundaries() {
    let error = build_regions(3, 3, &NormalizedLines {
        vertical: vec![0.49, 0.5],
        horizontal: vec![],
    }).unwrap_err();
    assert!(error.to_string().contains("duplicate pixel boundary"));
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test geometry_test`

Expected: FAIL because `geometry` and `build_regions` do not exist.

- [ ] **Step 3: Implement integer boundary generation**

Create `src-tauri/src/geometry.rs` with:

```rust
use crate::domain::{CropRegion, NormalizedLines};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum GeometryError {
    #[error("image dimensions must be positive")]
    EmptyImage,
    #[error("cut line must be between zero and one")]
    InvalidNormalizedLine,
    #[error("duplicate pixel boundary")]
    DuplicatePixelBoundary,
}

fn boundaries(size: u32, lines: &[f64]) -> Result<Vec<u32>, GeometryError> {
    if size == 0 { return Err(GeometryError::EmptyImage); }
    let mut pixels = vec![0];
    for &line in lines {
        if !(0.0 < line && line < 1.0) { return Err(GeometryError::InvalidNormalizedLine); }
        pixels.push((line * size as f64).round() as u32);
    }
    pixels.push(size);
    pixels.sort_unstable();
    if pixels.windows(2).any(|pair| pair[0] == pair[1]) {
        return Err(GeometryError::DuplicatePixelBoundary);
    }
    Ok(pixels)
}

pub fn build_regions(width: u32, height: u32, lines: &NormalizedLines) -> Result<Vec<CropRegion>, GeometryError> {
    let xs = boundaries(width, &lines.vertical)?;
    let ys = boundaries(height, &lines.horizontal)?;
    let mut regions = Vec::new();
    for y in ys.windows(2) {
        for x in xs.windows(2) {
            regions.push(CropRegion {
                index: regions.len() + 1,
                x: x[0],
                y: y[0],
                width: x[1] - x[0],
                height: y[1] - y[0],
            });
        }
    }
    Ok(regions)
}
```

Make `domain` and `geometry` public from `src-tauri/src/lib.rs` so integration tests can import them.

- [ ] **Step 4: Run geometry tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test geometry_test`

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/geometry.rs src-tauri/src/domain.rs src-tauri/src/lib.rs src-tauri/tests/geometry_test.rs
git commit -m "feat: add pixel exact crop geometry"
```

## Task 4: Probe source images and generate display-only previews

**Files:**
- Create: `src-tauri/src/image_probe.rs`
- Create: `src-tauri/src/preview.rs`
- Create: `src-tauri/tests/image_probe_test.rs`
- Create: `tests/fixtures/generate-fixtures.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add image dependencies and deterministic fixtures**

Add these Rust dependencies to `src-tauri/Cargo.toml`:

```toml
image = { version = "0.25", features = ["png", "jpeg", "webp"] }
kamadak-exif = "0.6"
png = "0.17"
thiserror = "2"
tempfile = "3"
```

Create a fixture generator that writes a 5 × 3 RGBA PNG where each pixel is `[x * 20, y * 40, 100, 255]`. Run it from a Rust integration-test helper or build it once with a small example binary so the binary fixture is reproducible rather than hand-edited.

- [ ] **Step 2: Write failing probe tests**

Create `src-tauri/tests/image_probe_test.rs`:

```rust
use picture_cutting_lib::image_probe::probe_image;
use std::path::Path;

#[test]
fn reports_dimensions_and_format() {
    let info = probe_image(Path::new("../tests/fixtures/pattern-5x3.png")).unwrap();
    assert_eq!((info.width, info.height), (5, 3));
    assert_eq!(info.format, "png");
}
```

- [ ] **Step 3: Run the test to verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test image_probe_test`

Expected: FAIL because `probe_image` is missing.

- [ ] **Step 4: Implement image probing**

In `src-tauri/src/image_probe.rs`, implement `probe_image(path: &Path) -> Result<ImageInfo, ProbeError>` using `image::ImageReader::open(path)?.with_guessed_format()?`. Reject formats other than PNG, JPEG, and WebP. Read EXIF orientation for JPEG and swap reported width/height for orientations 5 through 8. Return a user-readable `UnsupportedFormat` or `Decode` error through `thiserror`.

- [ ] **Step 5: Implement preview generation**

In `src-tauri/src/preview.rs`, implement:

```rust
pub struct PreviewResult {
    pub rgba: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

pub fn generate_preview(path: &Path, max_edge: u32) -> Result<PreviewResult, PreviewError>
```

Decode the image, apply EXIF orientation, use `thumbnail(max_edge, max_edge)`, and return RGBA bytes. Assert `max_edge` is between 256 and 4096. This module must expose no export-to-file function.

- [ ] **Step 6: Add preview dimension tests and run all Rust tests**

Add tests asserting a 4000 × 3000 fixture requested at `max_edge = 1600` produces 1600 × 1200 and that the original fixture is unchanged on disk.

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/image_probe.rs src-tauri/src/preview.rs src-tauri/src/lib.rs src-tauri/tests tests/fixtures
git commit -m "feat: probe images and create safe previews"
```

## Task 5: Export pixel-identical PNG crops atomically

**Files:**
- Create: `src-tauri/src/naming.rs`
- Create: `src-tauri/src/export.rs`
- Create: `src-tauri/tests/export_regression_test.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing pixel-regression tests**

Create `src-tauri/tests/export_regression_test.rs` that:

1. Creates the 5 × 3 deterministic RGBA source.
2. Builds regions for a vertical line at 0.5.
3. Calls `export_crops` with PNG settings.
4. Decodes both output files.
5. Reconstructs the original image in memory.
6. Asserts every reconstructed RGBA byte equals the source byte.
7. Asserts the regions are 3 × 3 and 2 × 3.

Use this request type:

```rust
let request = ExportRequest {
    source_path: source.clone(),
    output_directory: Some(output.path().to_path_buf()),
    base_name: "pattern".into(),
    format: ExportFormat::Png,
    quality: 92,
    lines: NormalizedLines { vertical: vec![0.5], horizontal: vec![] },
};
```

- [ ] **Step 2: Run the export test to verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --test export_regression_test`

Expected: FAIL because export types and functions are missing.

- [ ] **Step 3: Implement collision-safe naming**

In `src-tauri/src/naming.rs`, implement:

```rust
pub fn available_output_path(directory: &Path, base: &str, index: usize, extension: &str) -> PathBuf
```

The first candidate is `base_01.extension`. If it exists, try `base_01_2.extension`, then increment until unused. Sanitize only platform-invalid filename characters and retain Chinese characters. Add `default_output_directory(source)` that returns a sibling directory named `原文件名_切图` and creates it when the request's `output_directory: Option<PathBuf>` is `None`.

- [ ] **Step 4: Implement original-source export**

In `src-tauri/src/export.rs`, define serde-compatible `ExportFormat`, `ExportRequest`, and `ExportedFile`. Implement `export_crops` to:

- decode and orient the source once per single-image request;
- call `geometry::build_regions`;
- crop immutable views from the oriented original image;
- encode PNG with the `png` crate using the original color type and bit depth when supported;
- copy an available ICC profile and pixel-density metadata into PNG chunks;
- write to a temporary file in the destination directory;
- flush and atomically rename to the final collision-safe name;
- remove the temporary file after any encoding error.

JPEG and WebP variants must validate `1..=100` quality. Their implementation can use `image` encoders, but their DTO must report `lossless: false` for JPEG and lossy WebP.

- [ ] **Step 5: Run regression and error tests**

Add cases for a zero-size region rejection, unwritable destination, Chinese basename, and pre-existing output collision.

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --test export_regression_test
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all tests pass and the reconstructed PNG pixels match exactly.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/naming.rs src-tauri/src/export.rs src-tauri/src/lib.rs src-tauri/tests/export_regression_test.rs
git commit -m "feat: export pixel exact image crops"
```

## Task 6: Expose typed Tauri commands for import, preview, and export

**Files:**
- Create: `src-tauri/src/commands.rs`
- Create: `src/lib/tauri.ts`
- Create: `src/lib/tauri.test.ts`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Write failing frontend wrapper tests**

Mock `@tauri-apps/api/core` and assert `probeImages(["/a.png"])` invokes `probe_images` with `{ paths: ["/a.png"] }`, while `exportImage(request)` invokes `export_image` with `{ request }`.

- [ ] **Step 2: Implement Rust commands**

Add commands with these signatures:

```rust
#[tauri::command]
pub async fn probe_images(paths: Vec<PathBuf>) -> Result<Vec<ImageInfo>, CommandErrorDto>;

#[tauri::command]
pub async fn create_preview(path: PathBuf, max_edge: u32) -> Result<PreviewDto, CommandErrorDto>;

#[tauri::command]
pub async fn export_image(request: ExportRequest) -> Result<Vec<ExportedFile>, CommandErrorDto>;
```

Use `tauri::async_runtime::spawn_blocking` for decode and export work. Return stable error codes such as `unsupported_format`, `decode_failed`, `invalid_geometry`, and `write_failed`, plus a user-readable Chinese message.

- [ ] **Step 3: Register commands and minimal permissions**

Register the commands in `src-tauri/src/lib.rs`. In `src-tauri/capabilities/default.json`, allow only core window access, dialog open/save, and opener reveal/open-path permissions required by the app.

- [ ] **Step 4: Implement TypeScript wrappers**

In `src/lib/tauri.ts`, use `invoke<T>()` and map the Rust DTOs to the types in `src/types/domain.ts`. Convert preview RGBA bytes to an `ImageData`-backed object URL in one helper and expose a revocation function so old previews can be released.

- [ ] **Step 5: Run command wrapper and Rust tests**

Run:

```bash
npm test -- --run src/lib/tauri.test.ts
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib src/types src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat: connect image engine to Tauri commands"
```

## Task 7: Implement image import and the task list

**Files:**
- Create: `src/features/import/importImages.ts`
- Create: `src/features/import/importImages.test.ts`
- Create: `src/components/task-list/TaskList.tsx`
- Create: `src/components/task-list/TaskList.test.tsx`
- Create: `src/components/task-list/task-list.css`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Write failing import orchestration tests**

Test that selecting PNG/JPEG/WebP paths calls `probeImages`, creates stable task IDs from path plus file metadata, selects the first item, and records a failed task rather than dropping a damaged file. Add a drag-and-drop test that ignores unsupported files while retaining all supported paths.

- [ ] **Step 2: Implement import orchestration**

Use `open` from `@tauri-apps/plugin-dialog` with `multiple: true` and filters for `png`, `jpg`, `jpeg`, and `webp`. Add a second “导入文件夹” action using a directory dialog followed by a Rust `list_supported_images` command that scans only the selected directory, not subdirectories. Register Tauri window drag-drop events and pass supported dropped paths through the same `probeImages` flow. Add tasks to the store, then request a 1600-pixel preview only for the selected item.

- [ ] **Step 3: Write failing task-list component tests**

Cover:

- “导入图片” calls the import action;
- selecting a row changes the active task;
- status filters show “待确认” and “失败” tasks;
- Chinese filenames render unchanged.

- [ ] **Step 4: Implement the task list**

Render an accessible list with thumbnail, filename, `width × height`, and a status badge. Keep it virtualizable by exposing a simple `visibleTasks` array and stable row keys; do not add a virtualization dependency until measured task counts require it.

- [ ] **Step 5: Wire the left panel and verify**

Replace the placeholder left panel in `App.tsx` with `TaskList`.

Run:

```bash
npm test -- --run src/features/import src/components/task-list
npm run build
```

Expected: PASS and production build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/features/import src/components/task-list src/app/App.tsx src/store
git commit -m "feat: import images into task workbench"
```

## Task 8: Implement the SVG cut-line canvas and exact keyboard controls

**Files:**
- Create: `src/lib/coordinates.ts`
- Create: `src/lib/coordinates.test.ts`
- Create: `src/components/canvas/CutCanvas.tsx`
- Create: `src/components/canvas/CutCanvas.test.tsx`
- Create: `src/components/canvas/cut-canvas.css`
- Create: `src/components/settings/LineInspector.tsx`
- Create: `src/components/settings/LineInspector.test.tsx`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Write failing coordinate tests**

Test these exact cases:

```ts
expect(pixelToNormalized(1920, 3840)).toBe(0.5);
expect(normalizedToPixel(0.5, 3840)).toBe(1920);
expect(normalizedToPixel(0.5, 5)).toBe(3);
expect(clampLine(0, 100)).toBe(1 / 100);
```

The frontend rounding rule must match Rust: `Math.round(value * size)`.

- [ ] **Step 2: Implement coordinate helpers and verify parity**

Implement `pixelToNormalized`, `normalizedToPixel`, `clientPointToNormalized`, and `clampLine`. Run frontend tests and add a Rust parity fixture containing normalized values `0.25`, `0.5`, and `0.75` over odd and even dimensions.

- [ ] **Step 3: Write failing canvas interaction tests**

Test that:

- a 2 × 2 layout renders one vertical and one horizontal SVG line;
- dragging a vertical line updates only the normalized vertical value;
- ArrowRight moves the selected line by one original pixel;
- Shift+ArrowRight moves it by ten original pixels;
- Delete removes an unlocked selected line;
- a locked line ignores drag and keyboard movement;
- region labels render in row-major order.

- [ ] **Step 4: Implement the canvas**

Render the preview as an `<img draggable={false}>` and cut lines/handles as a sibling absolutely positioned `<svg>`. Keep zoom and pan transforms on a shared wrapper. Use pointer capture during dragging. Store only normalized lines; derive original pixel labels from the current task dimensions.

Add controls for “适应窗口”, “100%”, zoom in, and zoom out. At 100%, one CSS image pixel must represent one oriented source pixel before display-scale rounding.

- [ ] **Step 5: Implement exact pixel entry and locking controls**

`LineInspector.tsx` lists the selected line's axis, current original-pixel coordinate, and lock state. Submitting a pixel value converts it with `pixelToNormalized`, rejects coordinates at or beyond the image edges, and calls `moveLine`. Its lock button calls `toggleLineLock`. Tests must cover exact entry at pixel 1920 of width 3840, invalid value 0, invalid value 3840, and the locked-state label.

- [ ] **Step 6: Wire the center panel and run tests**

Run:

```bash
npm test -- --run src/lib/coordinates.test.ts src/components/canvas/CutCanvas.test.tsx src/components/settings/LineInspector.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/coordinates.ts src/lib/coordinates.test.ts src/components/canvas src/components/settings/LineInspector* src/app/App.tsx
git commit -m "feat: add precise cut line canvas"
```

## Task 9: Add built-in templates and persistent custom templates

**Files:**
- Create: `src-tauri/src/templates.rs`
- Create: `src-tauri/tests/templates_test.rs`
- Create: `src/components/settings/TemplateSelector.tsx`
- Create: `src/components/settings/TemplateSelector.test.tsx`
- Create: `src/features/templates/templateStorage.ts`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing built-in template tests**

Assert that `two_by_two` returns vertical `[0.5]` and horizontal `[0.5]`, `three_by_three` returns `[1/3, 2/3]` for both axes, and asymmetric templates return their named axis layout.

- [ ] **Step 2: Implement built-in templates**

Define a serializable `LayoutTemplate { id, name, vertical, horizontal, built_in }` and return the templates listed in the design: 2 × 2, 3 × 3, 1 × 2, 2 × 1, 1 × 3, 3 × 1, 1 × 4, 4 × 1, and four asymmetric one-plus-two/two-plus-one layouts.

- [ ] **Step 3: Write failing custom-template tests**

Test that saving the current normalized lines creates a user template, rejects an empty name, and replacing an existing template requires the same generated ID rather than creating duplicates.

- [ ] **Step 4: Implement persistent custom templates**

Store custom templates as versioned JSON in the Tauri app config directory using an atomic temporary-file rename. Expose `list_templates`, `save_template`, and `delete_template` commands. Built-in templates cannot be deleted.

- [ ] **Step 5: Implement the selector UI**

Render built-in and custom groups, apply a selected template to the active image, provide “保存当前布局”, and require confirmation before deleting a custom template.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml templates
npm test -- --run src/components/settings/TemplateSelector.test.tsx
```

Expected: PASS.

Commit:

```bash
git add src-tauri/src/templates.rs src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/tests/templates_test.rs src/components/settings src/features/templates
git commit -m "feat: add reusable grid templates"
```

## Task 10: Implement rule-based seam detection and review confidence

**Files:**
- Create: `src-tauri/src/detection.rs`
- Create: `src-tauri/tests/detection_test.rs`
- Modify: `src-tauri/src/domain.rs`
- Modify: `src-tauri/src/commands.rs`
- Create: `src/components/settings/DetectionStatus.tsx`
- Create: `src/components/settings/DetectionStatus.test.tsx`

- [ ] **Step 1: Create deterministic detection fixtures**

Generate fixtures for a seamless 2 × 2 image, a 3 × 3 image, a horizontal triptych, and a natural single image that should remain low confidence. Each region must use different deterministic textures, not solid separator lines.

- [ ] **Step 2: Write failing detector tests**

Assert:

- the 2 × 2 fixture chooses `two_by_two` and proposes 0.5 lines within one analysis pixel;
- the 3 × 3 fixture chooses `three_by_three`;
- the natural image has confidence below the forced-review threshold;
- all returned lines are sorted and inside `(0, 1)`.

- [ ] **Step 3: Implement seam scoring**

Analyze a grayscale image whose longest edge is at most 1024. For every candidate template, score narrow bands around its expected cuts using:

- gradient discontinuity across the cut;
- low cross-boundary color continuity;
- consistency of the score across the cut length;
- a penalty for moving far from the template's nominal ratio.

Return:

```rust
pub struct DetectionProposal {
    pub template_id: String,
    pub lines: NormalizedLines,
    pub confidence: f64,
    pub requires_review: bool,
}
```

Clamp confidence to `0.0..=1.0`. Mark confidence below `0.70` as required review and `0.70..0.85` as suggested review. Keep thresholds in named constants covered by tests.

- [ ] **Step 4: Expose detection and status UI**

Add `detect_layout(path)` as a blocking Tauri command. Render the template name, percentage, and one of “高”, “建议检查”, or “需要人工确认”. Applying a proposal updates the canvas but never starts export automatically.

- [ ] **Step 5: Run detector tests and commit**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --test detection_test
npm test -- --run src/components/settings/DetectionStatus.test.tsx
```

Expected: PASS for deterministic fixtures.

Commit:

```bash
git add src-tauri/src/detection.rs src-tauri/src/domain.rs src-tauri/src/commands.rs src-tauri/tests/detection_test.rs tests/fixtures src/components/settings/DetectionStatus*
git commit -m "feat: suggest grid layouts from image seams"
```

## Task 11: Add single-image and controlled-concurrency batch export

**Files:**
- Create: `src-tauri/src/batch.rs`
- Create: `src-tauri/tests/batch_test.rs`
- Create: `src/features/export/exportImages.ts`
- Create: `src/features/export/exportImages.test.ts`
- Create: `src/components/settings/ExportSettings.tsx`
- Create: `src/components/settings/ExportSettings.test.tsx`
- Create: `src/components/results/ExportSummary.tsx`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Write failing batch engine tests**

Test a batch with two valid sources and one damaged file. Assert two tasks succeed, one fails with its stable error code, and successful files remain present. Add a test that a source with a mismatched aspect ratio is marked `needs_review` in unified-template mode.

- [ ] **Step 2: Implement the Rust batch runner**

Define `BatchRequest`, `BatchItem`, `BatchItemResult`, and `BatchSummary`. Use a Rayon pool capped at `min(available_parallelism, 4)`. Each item calls the same `export_crops` function used by single export. Catch each item error into its result instead of returning early.

Unified-template mode compares each source aspect ratio with the reference ratio; a relative difference above 2% produces `needs_review`. Per-image mode requires an accepted proposal or manual layout for every exported item.

- [ ] **Step 3: Write failing frontend export tests**

Cover default PNG settings, JPEG/WebP quality visibility, “导出当前图片”, “批量导出全部”, progress updates, failed-item retry, and the option to export only confirmed tasks.

- [ ] **Step 4: Implement export orchestration and UI**

The frontend creates immutable request snapshots before invoking Rust. Disable line editing only for tasks currently exporting. Show counts for success, failure, and pending review. Use the opener plugin to reveal the output directory only after at least one successful output and only when the setting is enabled.

- [ ] **Step 5: Run batch and UI tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --test batch_test
npm test -- --run src/features/export src/components/settings/ExportSettings.test.tsx src/components/results
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/batch.rs src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/tests/batch_test.rs src/features/export src/components/settings/ExportSettings* src/components/results src/app/App.tsx
git commit -m "feat: export single and batch crop tasks"
```

## Task 12: Complete error UX, settings persistence, and accessibility

**Files:**
- Create: `src/features/settings/settingsStorage.ts`
- Create: `src/features/settings/settingsStorage.test.ts`
- Create: `src/components/common/ErrorBanner.tsx`
- Create: `src/components/common/ConfirmDialog.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/store/workbenchStore.ts`

- [ ] **Step 1: Write failing settings and error tests**

Test persistence for export format, quality, output directory, and open-directory preference. Test that invalid persisted JSON falls back to PNG quality 92. Test that an engine error code renders a Chinese action message and a retry button when retry is safe.

- [ ] **Step 2: Implement versioned settings persistence**

Use a versioned JSON record:

```ts
interface PersistedSettingsV1 {
  version: 1;
  exportSettings: ExportSettings;
}
```

Validate with Zod before applying it to the store. Never persist source image paths or task history.

- [ ] **Step 3: Implement accessible error and confirmation UI**

Use `role="alert"` for blocking errors, `aria-live="polite"` for progress, visible focus styles, keyboard-accessible dialogs, and descriptive labels for cut lines such as “垂直切割线 1，像素 1920”. Ensure every pointer operation has a keyboard equivalent.

- [ ] **Step 4: Run the frontend suite and accessibility checks**

Run:

```bash
npm test -- --run
npm run build
```

Expected: all tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/settings src/components/common src/app/App.tsx src/styles/global.css src/store/workbenchStore.ts
git commit -m "feat: persist safe settings and improve error UX"
```

## Task 13: Verify pixel quality, performance, and cross-platform release builds

**Files:**
- Create: `src-tauri/tests/quality_matrix_test.rs`
- Create: `src-tauri/benches/export_benchmark.rs`
- Create: `docs/verification.md`
- Modify: `src-tauri/Cargo.toml`
- Modify: `README.md`
- Create: `.github/workflows/build.yml`

- [ ] **Step 1: Add the complete image quality matrix**

Create tests for:

- even and odd dimensions;
- transparent RGBA PNG;
- grayscale and RGB PNG;
- JPEG and WebP input to PNG output;
- EXIF orientations 1, 3, 6, and 8;
- ICC profile and DPI propagation when present;
- Chinese, spaces, and long filenames;
- output collision and write failure cleanup.

For every PNG case, reconstruct exported regions and compare decoded pixel bytes with the oriented source bytes.

- [ ] **Step 2: Add a 4K performance benchmark**

Generate a deterministic 3840 × 2160 image in memory and benchmark preview creation plus 2 × 2 PNG export. Record timing and peak-memory observations in `docs/verification.md`; do not turn hardware-specific timings into brittle test assertions. Assert only that the benchmark completes and produces four 1920 × 1080 files.

- [ ] **Step 3: Add CI build coverage**

Create `.github/workflows/build.yml` with macOS and Windows jobs that run:

```bash
npm ci
npm test -- --run
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

Upload the unsigned application bundles as workflow artifacts. Signing and notarization remain release-environment configuration, not hard-coded repository secrets.

- [ ] **Step 4: Write the manual release checklist**

Document installation, file-dialog import, drag import, 100% preview, pixel coordinate editing, template reuse, single export, both batch modes, failed-task retry, output reveal, Chinese paths, and clean uninstall on both operating systems.

- [ ] **Step 5: Run full local verification**

Run:

```bash
npm test -- --run
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

Expected: every command exits 0 and a macOS bundle is created locally. Windows bundle verification completes in CI or on a Windows machine.

- [ ] **Step 6: Commit final verification assets**

```bash
git add src-tauri/tests/quality_matrix_test.rs src-tauri/benches src-tauri/Cargo.toml docs/verification.md README.md .github/workflows/build.yml
git commit -m "test: verify image quality and desktop builds"
```

## Task 14: Final acceptance against the approved design

**Files:**
- Modify: `docs/verification.md`
- Reference: `docs/superpowers/specs/2026-07-27-grid-image-cutter-design.md`

- [ ] **Step 1: Check every V1 requirement**

Create a traceability table in `docs/verification.md` mapping each V1 requirement to its automated test, manual check, or both. No requirement may be marked complete without evidence.

- [ ] **Step 2: Run the final clean verification suite**

Run from a clean checkout:

```bash
npm ci
npm test -- --run
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
git status --short
```

Expected: all build and test commands exit 0; `git status --short` is empty.

- [ ] **Step 3: Perform sample-image acceptance**

Import representative 2K, 3K, and 4K AI images. For each, record automatic proposal, manual correction if required, output dimensions, and pixel reconstruction result. Confirm that no preview image was used as an export source by tracing the Tauri export request back to the original path.

- [ ] **Step 4: Commit the acceptance record**

```bash
git add docs/verification.md
git commit -m "docs: record V1 acceptance evidence"
```
