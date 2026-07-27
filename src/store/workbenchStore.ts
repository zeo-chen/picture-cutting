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

const canonicalLineId = (axis: LineAxis, position: number) =>
  `${axis}-${position.toFixed(8)}`;

const allocateLineId = (
  axis: LineAxis,
  position: number,
  existingIds: Set<string>,
) => {
  const baseId = canonicalLineId(axis, position);
  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
};

const normalize = (axis: LineAxis, values: number[]) => {
  const positionsById = new Map<string, number>();

  [...new Set(values.filter((value) => value > 0 && value < 1))]
    .sort((a, b) => a - b)
    .forEach((position) => {
      const id = canonicalLineId(axis, position);
      if (!positionsById.has(id)) {
        positionsById.set(id, position);
      }
    });

  return [...positionsById.values()];
};

const createLine = (axis: LineAxis, position: number): CutLine => ({
  id: canonicalLineId(axis, position),
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
      const uniqueTasks = incomingTasks.flatMap((task) => {
        if (knownIds.has(task.id)) {
          return [];
        }
        knownIds.add(task.id);
        return [{ ...task }];
      });
      const tasks = [...state.tasks, ...uniqueTasks];

      return {
        tasks,
        selectedTaskId: state.selectedTaskId ?? tasks[0]?.id,
      };
    }),

  selectTask: (taskId) =>
    set((state) => {
      if (taskId !== undefined && !state.tasks.some(({ id }) => id === taskId)) {
        return state;
      }
      return { selectedTaskId: taskId };
    }),

  setLines: (taskId, lines) =>
    set((state) => {
      const existingLayout = state.layouts[taskId];
      const buildLines = (axis: LineAxis) => {
        const existingLines = existingLayout?.[axis] ?? [];
        const usedLines = new Set<CutLine>();
        const usedIds = new Set<string>();

        return normalize(axis, lines[axis]).flatMap((position) => {
          const desiredId = canonicalLineId(axis, position);
          const existing =
            existingLines.find(
              (line) => line.position === position && !usedLines.has(line),
            ) ??
            existingLines.find(
              (line) =>
                canonicalLineId(axis, line.position) === desiredId &&
                !usedLines.has(line),
            ) ??
            existingLines.find(
              (line) => line.id === desiredId && !usedLines.has(line),
            );
          const nextLine =
            existing && !usedIds.has(existing.id)
              ? { ...existing, position }
              : {
                  ...createLine(axis, position),
                  id: allocateLineId(axis, position, usedIds),
                };

          if (existing) {
            usedLines.add(existing);
          }
          usedIds.add(nextLine.id);
          return [nextLine];
        });
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
      const targetId = canonicalLineId(axis, position);
      if (
        !layout ||
        !line ||
        line.locked ||
        !(position > 0 && position < 1) ||
        layout[axis].some(
          (candidate) =>
            candidate.id !== lineId &&
            canonicalLineId(axis, candidate.position) === targetId,
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
      const positionId = canonicalLineId(axis, position);
      if (
        !(position > 0 && position < 1) ||
        layout[axis].some(
          (line) => canonicalLineId(axis, line.position) === positionId,
        )
      ) {
        return state;
      }

      const existingIds = new Set(layout[axis].map(({ id }) => id));
      const line = {
        ...createLine(axis, position),
        id: allocateLineId(axis, position, existingIds),
      };
      const lines = [...layout[axis], line].sort((a, b) => a.position - b.position);

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
