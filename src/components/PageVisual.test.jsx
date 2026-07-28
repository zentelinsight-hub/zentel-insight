/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { pageVisualMap } from "../data/pageVisuals";
import PageVisual from "./PageVisual";

afterEach(cleanup);

describe("page visuals", () => {
  it.each(Object.entries(pageVisualMap))("renders %s with its exact asset contract", (visualKey, visual) => {
    render(<PageVisual visualKey={visualKey} placement={visualKey.includes("Dashboard") ? "dashboard" : "public"} />);

    const image = screen.getByRole("img", { name: visual.alt });
    expect(image).toHaveAttribute("src", visual.src);
    expect(image).toHaveAttribute("width", String(visual.width));
    expect(image).toHaveAttribute("height", String(visual.height));
    expect(image).toHaveAttribute("loading", visual.loading);
    expect(image).toHaveAttribute("decoding", "async");
  });

  it("shows a professional fallback after an image error", () => {
    const visual = pageVisualMap.mainHomepage;
    render(<PageVisual visualKey="mainHomepage" />);

    fireEvent.error(screen.getByRole("img", { name: visual.alt }));

    expect(screen.getByRole("img", { name: `${visual.alt} unavailable` })).toBeInTheDocument();
    expect(screen.getByText("Page illustration unavailable")).toBeInTheDocument();
  });
});
