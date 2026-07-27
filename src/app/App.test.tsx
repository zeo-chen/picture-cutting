import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders the image task, cutting canvas, and cutting settings landmarks", () => {
    render(<App />);

    expect(
      screen.getByRole("complementary", { name: "图片任务" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("main", { name: "切割画布" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "切割设置" }),
    ).toBeInTheDocument();
  });
});
