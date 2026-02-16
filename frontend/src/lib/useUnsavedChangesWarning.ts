import { useEffect } from "react";

/**
 * Warns the user before leaving the page when there are unsaved changes.
 *
 * Uses the `beforeunload` event, which is the only reliable cross-browser
 * way to intercept tab close / reload / back-button navigation.
 *
 * @param hasUnsavedChanges — whether the form currently has unsaved data
 */
export function useUnsavedChangesWarning(hasUnsavedChanges: boolean): void {
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      // Modern browsers ignore the custom message, but setting returnValue
      // is required to trigger the browser's built-in "Leave site?" dialog.
      e.preventDefault();
      // Legacy support (Chrome < 119)
      e.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);
}
