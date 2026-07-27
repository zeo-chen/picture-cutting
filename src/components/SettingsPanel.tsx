import { useMemo, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import { exportImage, type ExportedFile } from "../lib/tauri";
import { useWorkbenchStore } from "../store/workbenchStore";
import type { ImageTask, LayoutDraft, NormalizedLines } from "../types/domain";

type Axis = keyof LayoutDraft;

interface SettingsPanelProps {
  task?: ImageTask;
  layout?: LayoutDraft;
}

const templates: { label: string; hint: string; lines: NormalizedLines }[] = [
  { label: "2 × 2", hint: "四宫格", lines: { vertical: [0.5], horizontal: [0.5] } },
  { label: "3 × 3", hint: "九宫格", lines: { vertical: [1 / 3, 2 / 3], horizontal: [1 / 3, 2 / 3] } },
  { label: "左右两图", hint: "竖向切线", lines: { vertical: [0.5], horizontal: [] } },
  { label: "上下两图", hint: "横向切线", lines: { vertical: [], horizontal: [0.5] } },
];

const hasCenter = (layout: LayoutDraft | undefined, axis: Axis) =>
  layout?.[axis].some(({ position }) => Math.abs(position - 0.5) < 0.00000001) ?? false;

export function SettingsPanel({ task, layout }: SettingsPanelProps) {
  const { setLines, moveLine, addLine, removeLine, setTaskStatus } = useWorkbenchStore();
  const [exported, setExported] = useState<ExportedFile[]>();
  const [exportError, setExportError] = useState<string>();
  const [revealing, setRevealing] = useState(false);

  const regionCount = useMemo(
    () => ((layout?.vertical.length ?? 0) + 1) * ((layout?.horizontal.length ?? 0) + 1),
    [layout],
  );

  const applyTemplate = (lines: NormalizedLines) => {
    if (!task) return;
    setLines(task.id, lines);
    setExported(undefined);
    setExportError(undefined);
  };

  const exportCurrent = async () => {
    if (!task || !layout) return;
    setTaskStatus(task.id, "exporting");
    setExportError(undefined);
    setExported(undefined);
    try {
      const files = await exportImage({
        sourcePath: task.path,
        lines: {
          vertical: layout.vertical.map(({ position }) => position),
          horizontal: layout.horizontal.map(({ position }) => position),
        },
      });
      setExported(files);
      setTaskStatus(task.id, "success");
    } catch (error) {
      const message = String(error);
      setExportError(message);
      setTaskStatus(task.id, "failed", message);
    }
  };

  const revealOutput = async () => {
    const firstPath = exported?.[0]?.path;
    if (!firstPath) return;
    setRevealing(true);
    try {
      await revealItemInDir(firstPath);
    } catch (error) {
      setExportError(`无法打开输出位置：${String(error)}`);
    } finally {
      setRevealing(false);
    }
  };

  const lineRows = (axis: Axis, title: string, size: number) => (
    <section className="settings-section">
      <div className="section-title-row">
        <h3>{title}</h3>
        <button
          className="text-button"
          disabled={!task || hasCenter(layout, axis)}
          onClick={() => task && addLine(task.id, axis, 0.5)}
        >
          ＋ 中心线
        </button>
      </div>
      {layout?.[axis].length ? (
        <div className="line-list">
          {layout[axis].map((line, index) => {
            const pixel = Math.round(line.position * size);
            return (
              <div className="line-row" key={line.id}>
                <span className={`axis-dot axis-dot--${axis}`} />
                <label>{axis === "vertical" ? "竖线" : "横线"} {index + 1}</label>
                <div className="pixel-input">
                  <input
                    aria-label={`${axis === "vertical" ? "竖线" : "横线"} ${index + 1} 像素位置`}
                    max={size - 1}
                    min={1}
                    type="number"
                    value={pixel}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (task && Number.isInteger(value) && value > 0 && value < size) {
                        moveLine(task.id, axis, line.id, value / size);
                      }
                    }}
                  />
                  <span>px</span>
                </div>
                <button
                  aria-label={`删除${axis === "vertical" ? "竖线" : "横线"} ${index + 1}`}
                  className="icon-button"
                  onClick={() => task && removeLine(task.id, axis, line.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="section-empty">当前没有{axis === "vertical" ? "竖向" : "横向"}切割线</p>
      )}
    </section>
  );

  return (
    <aside aria-label="切割设置" className="panel panel--right settings-panel">
      <div className="panel-heading panel-heading--compact">
        <div>
          <span className="eyebrow">参数</span>
          <h2>切割设置</h2>
        </div>
        {task && <span className="region-count">{regionCount} 张</span>}
      </div>

      <section className="settings-section">
        <h3>常用布局</h3>
        <div className="template-grid">
          {templates.map((template) => (
            <button key={template.label} disabled={!task} onClick={() => applyTemplate(template.lines)}>
              <strong>{template.label}</strong>
              <span>{template.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {lineRows("vertical", "竖向切割线", task?.width ?? 1)}
      {lineRows("horizontal", "横向切割线", task?.height ?? 1)}

      <div className="export-card">
        <div className="export-summary">
          <span>输出格式</span>
          <strong>PNG · 原图像素</strong>
        </div>
        <p>默认保存到原图旁的切图文件夹，文件按区域顺序编号。</p>
        <button
          className="primary-button export-button"
          disabled={!task || !layout || task.status === "exporting"}
          onClick={exportCurrent}
        >
          {task?.status === "exporting" ? "正在导出…" : `导出 ${regionCount} 张切图`}
        </button>
        {exportError && <div className="notice notice--error">{exportError}</div>}
        {exported && (
          <div className="notice notice--success">
            <strong>已成功导出 {exported.length} 张</strong>
            <span title={exported[0]?.path}>{exported[0]?.path}</span>
            <button className="reveal-button" disabled={revealing} onClick={revealOutput}>
              {revealing ? "正在打开…" : "打开输出位置"}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
