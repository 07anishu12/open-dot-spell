// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/App.js";

// Minimal test mocking global fetch
describe("Web App Shell", () => {
  it("renders the application title and displays health response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "healthy",
        version: "0.1.0-alpha",
        privacy_mode: "local_only",
        database: "connected",
        worker: "active"
      })
    });

    render(<App />);
    expect(screen.getByText("Open Dot Spell")).toBeDefined();
    expect(screen.getByText("Checking system readiness...")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("healthy")).toBeDefined();
      expect(screen.getByText("0.1.0-alpha")).toBeDefined();
    });
  });
});
