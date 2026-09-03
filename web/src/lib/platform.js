// Detects Apple platforms (macOS, iOS, iPadOS) so we can opt in to the host
// OS's own rounded, inset "sheet" look for modals, rather than applying it
// everywhere. CSS alone can't reliably distinguish "Safari on a Mac" from
// other browsers/OSes, so this checks the platform at runtime instead.
export function isApplePlatform() {
  if (typeof navigator === "undefined") return false;

  // Modern Chromium API: reports platform without needing the full UA string.
  const uaPlatform = navigator.userAgentData?.platform;
  if (uaPlatform) return /mac/i.test(uaPlatform);

  const platform = navigator.platform || "";
  const ua = navigator.userAgent || "";
  const isMac = /Mac/.test(platform);
  // iPadOS 13+ reports as "MacIntel" but exposes multi-touch, unlike a Mac.
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (isMac && navigator.maxTouchPoints > 1);
  return isMac || isIOS;
}
