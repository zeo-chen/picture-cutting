import { useMemo, useRef, useState } from "react";

import type { ImageTask, LayoutDraft } from "../types/domain";

type Axis = keyof LayoutDraft;

interface CutCanvasProps {
  task?: ImageTask;
  layout?: LayoutDraft;
  onMoveLine: (axis: Axis, lineId: string, position: number) => void;
}

const clampInside = (position: number, size: number) => {
  const edge = Math.min(0.499999, 1 / Math.max(2, size));
  return Math.max(edge, Math.min(1 - edge, position));
};

export function CutCanvas({ task, layout, onMoveLine }: CutCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ axis: Axis; lineId: string }>();

  const regions = useMemo(() => {
    const xs = [0, ...(layout?.vertical.map(({ position }) => position) ?? []), 1];
    const ys = [0, ...(layout?.horizontal.map(({ position }) => position) ?? []), 1];
    return ys.slice(0, -1).flatMap((top, row) =>
      xs.slice(0, -1).map((left, column) => ({
        index: row * (xs.length - 1) + column + 1,
        x: (left + xs[column + 1]) / 2,
        y: (top + ys[row + 1]) / 2,
      })),
    );
  }, [layout]);

  const moveFromPointer = (event: React.PointerEvent) => {
    if (!dragging || !stageRef.current || !task) return;
    const rect = stageRef.current.getBoundingClientRect();
    const position = dragging.axis === "vertical"
      ? (event.clientX - rect.left) / rect.width
      : (event.clientY - rect.top) / rect.height;
    const size = dragging.axis === "vertical" ? task.width : task.height;
    onMoveLine(dragging.axis, dragging.lineId, clampInside(position, size));
  };

  return (
    <main aria-label="切割画布" className="canvas-panel">
      <div className="canvas-toolbar">
        <div>
          <span className="eyebrow eyebrow--dark">切割预览</span>
          <strong>{task?.name ?? "未选择图片"}</strong>
        </div>
        {task && <span>{task.width} × {task.height} px · 原图像素导出</span>}
      </div>

      <div className="canvas-workspace">
        {!task ? (
          <div className="canvas-empty">
            <div className="canvas-empty__mark">＋</div>
            <h2>导入图片开始切割</h2>
            <p>图片仅在本机处理，不会上传到网络</p>
          </div>
        ) : task.status === "analyzing" || !task.previewUrl ? (
          <div className="canvas-empty"><span className="spinner" />正在生成清晰预览…</div>
        ) : task.status === "failed" && !task.previewUrl ? (
          <div className="canvas-empty canvas-empty--error">{task.error ?? "预览生成失败"}</div>
        ) : (
          <div className="image-stage-shell">
            <div
              className="image-stage"
              ref={stageRef}
              onPointerMove={moveFromPointer}
              onPointerUp={() => setDragging(undefined)}
              onPointerCancel={() => setDragging(undefined)}
            >
              <img alt={`${task.name} 预览`} draggable={false} src={task.previewUrl} />
              <svg className="cut-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
                {regions.map((region) => (
                  <g key={region.index} className="region-label">
                    <circle cx={region.x * 100} cy={region.y * 100} r="2.7" vectorEffect="non-scaling-stroke" />
                    <text x={region.x * 100} y={region.y * 100} dominantBaseline="central" textAnchor="middle">
                      {region.index}
                    </text>
                  </g>
                ))}
                {layout?.vertical.map((line) => (
                  <line
                    className="cut-line cut-line--vertical"
                    key={line.id}
                    x1={line.position * 100}
                    x2={line.position * 100}
                    y1="0"
                    y2="100"
                    vectorEffect="non-scaling-stroke"
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDragging({ axis: "vertical", lineId: line.id });
                    }}
                  />
                ))}
                {layout?.horizontal.map((line) => (
                  <line
                    className="cut-line cut-line--horizontal"
                    key={line.id}
                    x1="0"
                    x2="100"
                    y1={line.position * 100}
                    y2={line.position * 100}
                    vectorEffect="non-scaling-stroke"
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDragging({ axis: "horizontal", lineId: line.id });
                    }}
                  />
                ))}
              </svg>
            </div>
            <p>拖动青色切割线调整位置，编号为导出顺序</p>
          </div>
        )}
      </div>
    </main>
  );
}
