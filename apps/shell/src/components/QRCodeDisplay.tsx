import React, { useMemo } from "react";
import { generateQRCodeSVG } from "~/lib/qr-code";

interface QRCodeDisplayProps {
  data: string;
  size?: number;
}

export function QRCodeDisplay({ data, size = 200 }: QRCodeDisplayProps): React.ReactElement {
  const svgHtml = useMemo(() => {
    try {
      return generateQRCodeSVG(data, size);
    } catch {
      return null;
    }
  }, [data, size]);

  if (!svgHtml) {
    return (
      <div
        className="flex items-center justify-center bg-surface-2 border border-border rounded-lg text-xs text-muted"
        style={{ width: size, height: size }}
      >
        QR code unavailable
      </div>
    );
  }

  return (
    <div
      className="inline-block rounded-lg overflow-hidden border border-border"
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
}
