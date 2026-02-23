import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFormPersistence } from "./useFormPersistence";

const sampleData = {
  activeStep: 1,
  selectedTemplateId: "blank",
  plaintiffNarrative: "My story",
  defendantNarrative: "Their story",
  amountClaimed: 1500,
  judgeId: "common_sense" as const,
  plaintiffName: "Alice",
  plaintiffAddress: "",
  plaintiffPhone: "",
  defendantName: "Bob",
  defendantAddress: "",
  defendantPhone: "",
  evidenceRole: "plaintiff" as const,
  evidenceType: "document" as const,
  evidenceTitle: "",
  evidenceDescription: "",
  timelineDate: "",
  timelineDescription: "",
  timelineSource: "plaintiff" as const,
  timelineDisputed: false,
};

beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useFormPersistence", () => {
  it("restore returns null when no data is saved", () => {
    const { result } = renderHook(() => useFormPersistence());
    expect(result.current.restore()).toBeNull();
  });

  it("save + restore round-trips data through sessionStorage", () => {
    const { result } = renderHook(() => useFormPersistence());
    act(() => {
      result.current.save(sampleData);
      vi.advanceTimersByTime(1000); // flush debounce
    });

    const restored = result.current.restore();
    expect(restored).not.toBeNull();
    expect(restored!.plaintiffNarrative).toBe("My story");
    expect(restored!.version).toBe(1);
  });

  it("clear removes saved data", () => {
    const { result } = renderHook(() => useFormPersistence());
    act(() => {
      result.current.save(sampleData);
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.restore()).not.toBeNull();

    act(() => result.current.clear());
    expect(result.current.restore()).toBeNull();
  });

  it("debounces writes — does not write immediately", () => {
    const { result } = renderHook(() => useFormPersistence());
    act(() => result.current.save(sampleData));

    expect(sessionStorage.getItem("wyoming-ai-judge-form")).toBeNull();

    act(() => vi.advanceTimersByTime(1000));
    expect(sessionStorage.getItem("wyoming-ai-judge-form")).not.toBeNull();
  });

  it("discards data older than 24 hours", () => {
    const { result } = renderHook(() => useFormPersistence());

    const stale = {
      ...sampleData,
      savedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      version: 1 as const,
    };
    sessionStorage.setItem("wyoming-ai-judge-form", JSON.stringify(stale));

    expect(result.current.restore()).toBeNull();
  });

  it("discards data with wrong version", () => {
    const { result } = renderHook(() => useFormPersistence());

    const bad = {
      ...sampleData,
      savedAt: new Date().toISOString(),
      version: 99,
    };
    sessionStorage.setItem("wyoming-ai-judge-form", JSON.stringify(bad));

    expect(result.current.restore()).toBeNull();
  });
});
