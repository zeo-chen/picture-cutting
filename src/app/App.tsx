import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { CutCanvas } from "../components/CutCanvas";
import { SettingsPanel } from "../components/SettingsPanel";
import { TaskList } from "../components/TaskList";
import { createPreview, probeImages } from "../lib/tauri";
import { useWorkbenchStore } from "../store/workbenchStore";
import type { ImageTask } from "../types/domain";
import "../styles/global.css";

export function App() {
  const {
    tasks,
    selectedTaskId,
    layouts,
    addTasks,
    selectTask,
    setLines,
    moveLine,
    setTaskPreview,
    setTaskStatus,
  } = useWorkbenchStore();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string>();
  const selectedTask = useMemo(
    () => tasks.find(({ id }) => id === selectedTaskId),
    [selectedTaskId, tasks],
  );

  useEffect(() => {
    if (!selectedTask || selectedTask.previewUrl || selectedTask.status === "failed") return;
    let active = true;
    setTaskStatus(selectedTask.id, "analyzing");
    createPreview(selectedTask.path, 1600)
      .then((preview) => {
        if (!active) return;
        setTaskPreview(selectedTask.id, preview.dataUrl);
        setTaskStatus(selectedTask.id, "ready");
      })
      .catch((error) => {
        if (active) setTaskStatus(selectedTask.id, "failed", String(error));
      });
    return () => {
      active = false;
    };
  }, [selectedTask?.id, selectedTask?.path, selectedTask?.previewUrl]);

  const importImages = async () => {
    setImporting(true);
    setImportError(undefined);
    try {
      const chosen = await open({
        multiple: true,
        directory: false,
        filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp"] }],
      });
      const paths = typeof chosen === "string" ? [chosen] : chosen ?? [];
      if (!paths.length) return;

      const results = await Promise.allSettled(paths.map((path) => probeImages([path])));
      const goodTasks: ImageTask[] = [];
      const errors: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value[0]) {
          const info = result.value[0];
          goodTasks.push({
            id: info.path,
            path: info.path,
            name: info.name,
            width: info.width,
            height: info.height,
            status: "ready",
          });
        } else if (result.status === "rejected") {
          const filename = paths[index].split(/[\\/]/).pop() ?? paths[index];
          errors.push(`${filename}：${String(result.reason)}`);
        }
      });
      if (goodTasks.length) {
        addTasks(goodTasks);
        goodTasks.forEach((task) => {
          if (!layouts[task.id]) {
            setLines(task.id, { vertical: [0.5], horizontal: [0.5] });
          }
        });
      }
      if (errors.length) setImportError(`${errors.length} 个文件导入失败：${errors.join("；")}`);
    } catch (error) {
      setImportError(`无法打开图片：${String(error)}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="workbench">
      <TaskList
        tasks={tasks}
        selectedTaskId={selectedTaskId}
        importing={importing}
        importError={importError}
        onImport={importImages}
        onSelect={selectTask}
      />
      <CutCanvas
        task={selectedTask}
        layout={selectedTask ? layouts[selectedTask.id] : undefined}
        onMoveLine={(axis, lineId, position) => {
          if (selectedTask) moveLine(selectedTask.id, axis, lineId, position);
        }}
      />
      <SettingsPanel
        task={selectedTask}
        layout={selectedTask ? layouts[selectedTask.id] : undefined}
      />
    </div>
  );
}
