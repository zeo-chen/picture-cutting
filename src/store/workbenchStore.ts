import { create } from "zustand";

import type {
  CutLine,
  ExportSettings,
  ImageTask,
  LayoutDraft,
  NormalizedLines,
  TaskStatus,
} from "../types/domain";

type LineAxis = keyof LayoutDraft;

export interface WorkbenchState {
  tasks: ImageTask[];
  selectedTaskId?: string;
  layouts: Record<string, LayoutDraft>;
  exportSettings: ExportSettings;
  addTasks: (tasks: ImageTask[]) => void;
  selectTask: (taskId?: string) => void;
  setLines: (taskId: string, lines: NormalizedLines) => void;
  moveLine: (
    taskId: string,
    axis: LineAxis,
    lineId: string,
    position: number,
  ) => void;
  addLine: (taskId: string, axis: LineAxis, position: number) => void;
  removeLine: (taskId: string, axis: LineAxis, lineId: string) => void;
  toggleLineLock: (taskId: string, axis: LineAxis, lineId: string) => void;
  setTaskStatus: (taskId: string, status: TaskStatus, error?: string) => void;
  reset: () => void;
}

const defaultExportSettings: ExportSettings = {
  format: "png",
  quality: 92,
  openDirectoryWhenDone: true,
};

const normalize = (values: number[]) =>
  [...new Set(values.filter((value) => value > 0 && value < 1))].sort(
    (a, b) => a - b,
  );

const createLine = (axis: LineAxis, position: number): CutLine => ({
  id: `${axis}-${position.toFixed(8)}`,
  position,
  locked: false,
});

const createInitialState = () => ({
  tasks: [] as ImageTask[],
  selectedTaskId: undefined,
  layouts: {} as Record<string, LayoutDraft>,
  exportSettings: { ...defaultExportSettings },
});

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  ...createInitialState(),

  addTasks: (incomingTasks) =>
    set((state) => {
      const knownIds = new Set(state.tasks.map(({ id }) => id));
      const uniqueTasks = incomingTasks.filter(({ id }) => {
        if (knownIds.has(id)) {
          return false;
        }
        knownIds.add(id);
        return true;
      });
      const tasks = [...state.tasks, ...uniqueTasks];

      return {
        tasks,
        selectedTaskId: state.selectedTaskId ?? tasks[0]?.id,
      };
    }),

  selectTask: (taskId) => set({ selectedTaskId: taskId }),

  setLines: (taskId, lines) =>
    set((state) => {
      const existingLayout = state.layouts[taskId];
      const buildLines = (axis: LineAxis) => {
        const existingByPosition = new Map(
          (existingLayout?.[axis] ?? []).map((line) => [line.position, line]),
        );

        return normalize(lines[axis]).map(
          (position) => existingByPosition.get(position) ?? createLine(axis, position),
        );
      };

      return {
        layouts: {
          ...state.layouts,
          [taskId]: {
            vertical: buildLines("vertical"),
            horizontal: buildLines("horizontal"),
          },
        },
      };
    }),

  moveLine: (taskId, axis, lineId, position) =>
    set((state) => {
      const layout = state.layouts[taskId];
      const line = layout?.[axis].find(({ id }) => id === lineId);
      if (
        !layout ||
        !line ||
        line.locked ||
        !(position > 0 && position < 1) ||
        layout[axis].some(
          (candidate) => candidate.id !== lineId && candidate.position === position,
        )
      ) {
        return state;
      }

      const movedLines = layout[axis]
        .map((candidate) =>
          candidate.id === lineId ? { ...candidate, position } : candidate,
        )
        .sort((a, b) => a.position - b.position);

      return {
        layouts: {
          ...state.layouts,
          [taskId]: { ...layout, [axis]: movedLines },
        },
      };
    }),

  addLine: (taskId, axis, position) =>
    set((state) => {
      const layout = state.layouts[taskId] ?? { vertical: [], horizontal: [] };
      if (
        !(position > 0 && position < 1) ||
        layout[axis].some((line) => line.position === position)
      ) {
        return state;
      }

      const lines = [...layout[axis], createLine(axis, position)].sort(
        (a, b) => a.position - b.position,
      );

      return {
        layouts: {
          ...state.layouts,
          [taskId]: { ...layout, [axis]: lines },
        },
      };
    }),

  removeLine: (taskId, axis, lineId) =>
    set((state) => {
      const layout = state.layouts[taskId];
      const line = layout?.[axis].find(({ id }) => id === lineId);
      if (!layout || !line || line.locked) {
        return state;
      }

      return {
        layouts: {
          ...state.layouts,
          [taskId]: {
            ...layout,
            [axis]: layout[axis].filter(({ id }) => id !== lineId),
          },
        },
      };
    }),

  toggleLineLock: (taskId, axis, lineId) =>
    set((state) => {
      const layout = state.layouts[taskId];
      if (!layout || !layout[axis].some(({ id }) => id === lineId)) {
        return state;
      }

      return {
        layouts: {
          ...state.layouts,
          [taskId]: {
            ...layout,
            [axis]: layout[axis].map((line) =>
              line.id === lineId ? { ...line, locked: !line.locked } : line,
            ),
          },
        },
      };
    }),

  setTaskStatus: (taskId, status, error) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === taskId
          ? { ...task, status, error: status === "failed" ? error : undefined }
          : task,
      ),
    })),

  reset: () => set(createInitialState()),
}));
