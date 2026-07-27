import { beforeEach, describe, expect, it } from "vitest";

import type { ImageTask } from "../types/domain";
import { useWorkbenchStore } from "./workbenchStore";

const task = (id: string): ImageTask => ({
  id,
  path: `/tmp/${id}.png`,
  name: `${id}.png`,
  width: 100,
  height: 100,
  status: "ready",
});

describe("workbenchStore", () => {
  beforeEach(() => {
    useWorkbenchStore.getState().reset();
  });

  it("selects the first task when adding two tasks", () => {
    useWorkbenchStore.getState().addTasks([task("a"), task("b")]);

    expect(useWorkbenchStore.getState().selectedTaskId).toBe("a");
  });

  it("sorts normalized line positions when setting lines", () => {
    useWorkbenchStore.getState().setLines("a", {
      vertical: [0.75, 0.25],
      horizontal: [0.5],
    });

    expect(
      useWorkbenchStore.getState().layouts.a.vertical.map(({ position }) => position),
    ).toEqual([0.25, 0.75]);
  });

  it("filters invalid positions, removes duplicates, and assigns stable IDs", () => {
    useWorkbenchStore.getState().setLines("a", {
      vertical: [0, 0.25, 0.25, 1, -0.5, 1.5],
      horizontal: [0.333333333],
    });

    expect(useWorkbenchStore.getState().layouts.a).toEqual({
      vertical: [{ id: "vertical-0.25000000", position: 0.25, locked: false }],
      horizontal: [
        { id: "horizontal-0.33333333", position: 0.333333333, locked: false },
      ],
    });
  });

  it("moves an unlocked line while preserving its ID and sorting the result", () => {
    useWorkbenchStore.getState().setLines("a", {
      vertical: [0.25, 0.75],
      horizontal: [],
    });
    const originalId = useWorkbenchStore.getState().layouts.a.vertical[1].id;

    useWorkbenchStore.getState().moveLine("a", "vertical", originalId, 0.1);

    expect(useWorkbenchStore.getState().layouts.a.vertical).toEqual([
      { id: originalId, position: 0.1, locked: false },
      { id: "vertical-0.25000000", position: 0.25, locked: false },
    ]);
  });

  it("does not move a locked line", () => {
    useWorkbenchStore.getState().setLines("a", {
      vertical: [0.25],
      horizontal: [],
    });
    const lineId = useWorkbenchStore.getState().layouts.a.vertical[0].id;
    useWorkbenchStore.getState().toggleLineLock("a", "vertical", lineId);

    useWorkbenchStore.getState().moveLine("a", "vertical", lineId, 0.75);

    expect(useWorkbenchStore.getState().layouts.a.vertical).toEqual([
      { id: lineId, position: 0.25, locked: true },
    ]);
  });

  it("toggles only the targeted line", () => {
    useWorkbenchStore.getState().setLines("a", {
      vertical: [0.25, 0.75],
      horizontal: [0.5],
    });
    const targetId = useWorkbenchStore.getState().layouts.a.vertical[1].id;

    useWorkbenchStore.getState().toggleLineLock("a", "vertical", targetId);

    expect(useWorkbenchStore.getState().layouts.a).toEqual({
      vertical: [
        { id: "vertical-0.25000000", position: 0.25, locked: false },
        { id: targetId, position: 0.75, locked: true },
      ],
      horizontal: [{ id: "horizontal-0.50000000", position: 0.5, locked: false }],
    });
  });

  it("restores empty workbench data and default export settings", () => {
    useWorkbenchStore.getState().addTasks([task("a")]);
    useWorkbenchStore.getState().setLines("a", {
      vertical: [0.25],
      horizontal: [],
    });
    useWorkbenchStore.setState({
      exportSettings: {
        format: "jpeg",
        quality: 70,
        outputDirectory: "/tmp/export",
        openDirectoryWhenDone: false,
      },
    });

    useWorkbenchStore.getState().reset();

    expect(useWorkbenchStore.getState()).toMatchObject({
      tasks: [],
      selectedTaskId: undefined,
      layouts: {},
      exportSettings: {
        format: "png",
        quality: 92,
        openDirectoryWhenDone: true,
      },
    });
  });
});
