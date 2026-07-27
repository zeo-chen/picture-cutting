import "../styles/global.css";

export function App() {
  return (
    <div className="workbench">
      <aside aria-label="图片任务" className="panel panel--left">
        图片任务
      </aside>
      <main aria-label="切割画布" className="canvas-panel">
        导入图片后开始切割
      </main>
      <aside aria-label="切割设置" className="panel panel--right">
        切割设置
      </aside>
    </div>
  );
}
