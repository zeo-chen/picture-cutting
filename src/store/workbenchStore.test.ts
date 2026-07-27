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

  it("does not add duplicate task IDs", () => {
    useWorkbenchStore.getState().addTasks([task("a"), task("a")]);
    useWorkbenchStore.getState().addTasks([task("a"), task("b")]);

    expect(useWorkbenchStore.getState().tasks.map(({ id }) => id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("stores a shallow clone of each accepted task", () => {
    const incomingTask = task("a");

    useWorkbenchStore.getState().addTasks([incomingTask]);
    incomingTask.name = "mutated.png";

    expect(useWorkbenchStore.getState().tasks[0].name).toBe("a.png");
  });

  it("selects only existing tasks and accepts undefined for deselection", () => {
    useWorkbenchStore.getState().addTasks([task("a"), task("b")]);

    useWorkbenchStore.getState().selectTask("b");
    expect(useWorkbenchStore.getState().selectedTaskId).toBe("b");

    useWorkbenchStore.getState().selectTask("missing");
    expect(useWorkbenchStore.getState().selectedTaskId).toBe("b");

    useWorkbenchStore.getState().selectTask(undefined);
    expect(useWorkbenchStore.getState().selectedTaskId).toBeUndefined();
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

  it("deduplicates positions that share the same canonical ID", () => {
    useWorkbenchStore.getState().setLines("a", {
      vertical: [0.250000001, 0.250000002],
      horizontal: [],
    });

    expect(useWorkbenchStore.getState().layouts.a.vertical).toEqual([
      {
        id: "vertical-0.25000000",
        position: 0.250000001,
        locked: false,
      },
    ]);
  });

  it("preserves line identity and lock across a same-ID recalculation", () => {
    useWorkbenchStore.getState().setLines("a", {
      vertical: [0.25],
      horizontal: [],
    });
    const lineId = useWorkbenchStore.getState().layouts.a.vertical[0].id;
    useWorkbenchStore.getState().toggleLineLock("a", "vertical", lineId);

    useWorkbenchStore.getState().setLines("a", {
      vertical: [0.250000004],
      horizontal: [],
    });

    expect(useWorkbenchStore.getState().layouts.a.vertical).toEqual([
      { id: lineId, position: 0.250000004, locked: true },
    ]);
  });

  it("restores an exact-position line before a canonical-ID match", () => {
    useWorkbenchStore.setState({
      layouts: {
        a: {
          vertical: [
            { id: "vertical-0.10000000", position: 0.25, locked: true },
            { id: "vertical-0.25000000", position: 0.5, locked: false },
          ],
          horizontal: [],
        },
      },
    });

    useWorkbenchStore.getState().setLines("a", {
      vertical: [0.25],
      horizontal: [],
    });

    expect(useWorkbenchStore.getState().layouts.a.vertical).toEqual([
      { id: "vertical-0.10000000", position: 0.25, locked: true },
    ]);
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

  it("rejects invalid movement boundaries", () => {
    useWorkbenchStore.getState().setLines("a", {
      vertical: [0.25],
      horizontal: [],
    });
    const lineId = useWorkbenchStore.getState().layouts.a.vertical[0].id;

    for (const position of [0, 1, -0.1, 1.1, Number.NaN]) {
      useWorkbenchStore.getState().moveLine("a", "vertical", lineId, position);
    }

    expect(useWorkbenchStore.getState().layouts.a.vertical[0].position).toBe(0.25);
  });

  it("rejects movement to another line's canonical position", () => {
    useWorkbenchStore.getState().setLines("a", {
      vertical: [0.25, 0.75],
      horizontal: [],
    });
    const lineId = useWorkbenchStore.getState().layouts.a.vertical[0].id;

    useWorkbenchStore
      .getState()
      .moveLine("a", "vertical", lineId, 0.750000001);

    expect(useWorkbenchStore.getState().layouts.a.vertical[0].position).toBe(0.25);
  });

  it("adds a valid line with a stable ID and sorted position", () => {
    useWorkbenchStore.getState().setLines("a", {
      vertical: [0.75],
      horizontal: [],
    });

    useWorkbenchStore.getState().addLine("a", "vertical", 0.25);

    expect(useWorkbenchStore.getState().layouts.a.vertical).toEqual([
      { id: "vertical-0.25000000", position: 0.25, locked: false },
      { id: "vertical-0.75000000", position: 0.75, locked: false },
    ]);
  });

  it("rejects invalid add-line boundaries", () => {
    for (const position of [0, 1, -0.1, 1.1, Number.NaN]) {
      useWorkbenchStore.getState().addLine("a", "horizontal", position);
    }

    expect(useWorkbenchStore.getState().layouts.a).toBeUndefined();
  });

  it("rejects add-line canonical collisions", () => {
    useWorkbenchStore.getState().setLines("a", {
      vertical: [0.25],
      horizontal: [],
    });

    useWorkbenchStore.getState().addLine("a", "vertical", 0.250000001);

    expect(useWorkbenchStore.getState().layouts.a.vertical).toHaveLength(1);
  });

  it("rejects add-line IDs already retained by a moved line", () => {
    useWorkbenchStore.getState().setLines("a", {
      vertical: [0.25],
      horizontal: [],
    });
    const lineId = useWorkbenchStore.getState().layouts.a.vertical[0].id;
    useWorkbenchStore.getState().moveLine("a", "vertical", lineId, 0.5);

    useWorkbenchStore.getState().addLine("a", "vertical", 0.25);

    expect(useWorkbenchStore.getState().layouts.a.vertical).toEqual([
      { id: lineId, position: 0.5, locked: false },
    ]);
  });

  it("removes an unlocked line", () => {
    useWorkbenchStore.getState().setLines("a", {
      vertical: [0.25, 0.75],
      horizontal: [],
    });

    useWorkbenchStore
      .getState()
      .removeLine("a", "vertical", "vertical-0.25000000");

    expect(useWorkbenchStore.getState().layouts.a.vertical).toEqual([
      { id: "vertical-0.75000000", position: 0.75, locked: false },
    ]);
  });

  it("does not remove a locked line", () => {
    useWorkbenchStore.getState().setLines("a", {
      vertical: [0.25],
      horizontal: [],
    });
    const lineId = useWorkbenchStore.getState().layouts.a.vertical[0].id;
    useWorkbenchStore.getState().toggleLineLock("a", "vertical", lineId);

    useWorkbenchStore.getState().removeLine("a", "vertical", lineId);

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

  it("sets a failed task error and clears it on a non-failed status", () => {
    useWorkbenchStore.getState().addTasks([task("a")]);

    useWorkbenchStore.getState().setTaskStatus("a", "failed", "broken image");
    expect(useWorkbenchStore.getState().tasks[0]).toMatchObject({
      status: "failed",
      error: "broken image",
    });

    useWorkbenchStore.getState().setTaskStatus("a", "ready");
    expect(useWorkbenchStore.getState().tasks[0]).toMatchObject({ status: "ready" });
    expect(useWorkbenchStore.getState().tasks[0].error).toBeUndefined();
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
