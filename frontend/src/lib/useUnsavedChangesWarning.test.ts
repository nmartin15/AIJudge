import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useUnsavedChangesWarning } from "./useUnsavedChangesWarning";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useUnsavedChangesWarning", () => {
  it("attaches beforeunload handler when hasUnsavedChanges is true", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    renderHook(() => useUnsavedChangesWarning(true));
    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  it("does not attach handler when hasUnsavedChanges is false", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    renderHook(() => useUnsavedChangesWarning(false));
    const beforeUnloadCalls = addSpy.mock.calls.filter(
      ([event]) => event === "beforeunload"
    );
    expect(beforeUnloadCalls).toHaveLength(0);
  });

  it("removes handler on cleanup", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useUnsavedChangesWarning(true));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function)
    );
  });

  it("calls preventDefault on the beforeunload event", () => {
    const handlers: EventListenerOrEventListenerObject[] = [];
    vi.spyOn(window, "addEventListener").mockImplementation(
      (event: string, handler: EventListenerOrEventListenerObject) => {
        if (event === "beforeunload") handlers.push(handler);
      }
    );

    renderHook(() => useUnsavedChangesWarning(true));
    expect(handlers).toHaveLength(1);

    const event = new Event("beforeunload") as BeforeUnloadEvent;
    const preventSpy = vi.spyOn(event, "preventDefault");
    (handlers[0] as EventListener)(event);
    expect(preventSpy).toHaveBeenCalled();
  });
});
