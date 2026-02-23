import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useToasts } from "./useToasts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useToasts", () => {
  it("starts with an empty toast list", () => {
    const { result } = renderHook(() => useToasts());
    expect(result.current.toasts).toEqual([]);
  });

  it("adds a toast with default type 'info'", () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.addToast("Hello"));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe("Hello");
    expect(result.current.toasts[0].type).toBe("info");
  });

  it("adds a toast with a custom type", () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.addToast("Saved!", "success"));
    expect(result.current.toasts[0].type).toBe("success");
  });

  it("removes a toast by id", () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.addToast("Toast A"));
    const id = result.current.toasts[0].id;
    act(() => result.current.removeToast(id));
    expect(result.current.toasts).toHaveLength(0);
  });

  it("auto-removes toasts after 4 seconds", () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.addToast("Ephemeral"));
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.toasts).toHaveLength(0);
  });

  it("handles multiple toasts independently", () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      result.current.addToast("First");
      result.current.addToast("Second", "error");
    });
    expect(result.current.toasts).toHaveLength(2);

    const firstId = result.current.toasts[0].id;
    act(() => result.current.removeToast(firstId));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe("Second");
  });
});
