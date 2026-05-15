"use client";

import { useEffect, useState } from "react";

/**
 * Cursor / VS Code Simple Browser and some embedded webviews do not expose WebGL,
 * so MapLibre stays blank. Prompt users to open the app in a real browser.
 */
export default function WebglPreviewBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      const gl =
        c.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ??
        c.getContext("webgl", { failIfMajorPerformanceCaveat: false }) ??
        c.getContext("experimental-webgl", { failIfMajorPerformanceCaveat: false });
      setShow(!gl);
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <div
      role="status"
      className="mb-4 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100"
    >
      <strong className="text-amber-50">No WebGL in this preview.</strong> Embedded browser panels
      often cannot run MapLibre. Use <strong>Open in Browser</strong> (Chrome, Firefox, or Safari) and
      open <code className="text-amber-200">http://localhost:3000/prototype</code> while{" "}
      <code className="text-amber-200">npm run dev</code> is running.
    </div>
  );
}
