import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Alert from "../src/components/Alert.jsx";

describe("Alert", () => {
  it("renders its children", () => {
    render(<Alert type="success">Account created.</Alert>);
    expect(screen.getByText("Account created.")).toBeDefined();
  });

  it("uses an assertive role for errors and a polite role otherwise", () => {
    const { rerender } = render(<Alert>Something broke.</Alert>);
    expect(screen.getByRole("alert")).toBeDefined();

    rerender(<Alert type="success">All good.</Alert>);
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("applies the modifier class for its type", () => {
    render(<Alert type="warning">Heads up.</Alert>);
    expect(screen.getByRole("status").className).toContain("alert--warning");
  });
});
