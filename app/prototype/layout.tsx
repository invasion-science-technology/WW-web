import type { Metadata } from "next";

import { PrototypeAuthProvider } from "@/components/prototype/prototype-auth";
import PrototypeGate from "@/components/prototype/prototype-gate";
import PrototypeShell from "@/components/prototype/prototype-shell";
import WebglPreviewBanner from "@/components/prototype/webgl-preview-banner";

export const metadata: Metadata = {
  title: "Field lab — WeedWatch AI prototype",
  description:
    "Stage 1 local prototype: sign-in, California AOI map, mock acquisition pipeline, synthetic weed output; Open-Meteo at centroid.",
};

export default function PrototypeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrototypeAuthProvider>
      <PrototypeShell>
        <WebglPreviewBanner />
        <PrototypeGate>{children}</PrototypeGate>
      </PrototypeShell>
    </PrototypeAuthProvider>
  );
}
