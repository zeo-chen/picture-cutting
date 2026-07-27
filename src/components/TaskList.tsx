import type { ImageTask } from "../types/domain";

interface TaskListProps {
  tasks: ImageTask[];
  selectedTaskId?: string;
  importing: boolean;
  importError?: string;
  onImport: () => void;
  onSelect: (taskId: string) => void;
}

const statusText = {
  analyzing: "生成预览中",
  ready: "待导出",
  "needs-review": "待确认",
  exporting: "导出中",
  success: "已导出",
  failed: "处理失败",
};

export function TaskList({
  tasks,
  selectedTaskId,
  importing,
  importError,
  onImport,
  onSelect,
}: TaskListProps) {
  return (
    <aside aria-label="图片任务" className="panel panel--left task-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">本地处理</span>
          <h1>宫格切图</h1>
        </div>
        <span className="task-count">{tasks.length}</span>
      </div>

      <button className="primary-button import-button" disabled={importing} onClick={onImport}>
        <span aria-hidden="true">＋</span>
        {importing ? "正在读取…" : "导入图片"}
      </button>
      <p className="helper-text">支持 PNG、JPEG、WebP，可多选</p>
      {importError && <div className="notice notice--error">{importError}</div>}

      <div className="task-list">
        {tasks.length === 0 ? (
          <div className="task-empty">
            <div className="empty-icon" aria-hidden="true">▧</div>
            <strong>还没有图片</strong>
            <span>导入后即可设置切割线</span>
          </div>
        ) : (
          tasks.map((task) => (
            <button
              className={`task-card ${task.id === selectedTaskId ? "is-selected" : ""}`}
              key={task.id}
              onClick={() => onSelect(task.id)}
            >
              <span className="task-card__icon" aria-hidden="true">IMG</span>
              <span className="task-card__body">
                <strong title={task.name}>{task.name}</strong>
                <span>{task.width} × {task.height} px</span>
                <span className={`status status--${task.status}`}>
                  {statusText[task.status]}
                </span>
                {task.error && <span className="task-error">{task.error}</span>}
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
