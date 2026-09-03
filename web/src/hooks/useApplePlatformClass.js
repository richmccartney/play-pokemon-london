import { useEffect } from "react";
import { isApplePlatform } from "../lib/platform";

// Tags <html> so CSS can opt specific components (e.g. the event drawer)
// in to Apple's native rounded "sheet" look only on macOS/iOS/iPadOS,
// matching the host operating system's own modal design language.
export function useApplePlatformClass() {
  useEffect(() => {
    document.documentElement.classList.toggle("is-apple", isApplePlatform());
  }, []);
}
