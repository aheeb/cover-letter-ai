"use client";

import { ExternalLink } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

type PdfPreviewProps = {
  previewUrl: string | null;
  pdfUrl: string;
  title: string;
  errorLabel: string;
  openLabel: string;
};

/** Shows a server-rendered preview image with the original PDF as a fallback. */
export function PdfPreview({
  previewUrl,
  pdfUrl,
  title,
  errorLabel,
  openLabel,
}: PdfPreviewProps) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="bg-muted/20 p-3">
      {!previewUrl || failed ? (
        <p className="p-4 text-center text-sm text-muted-foreground">{errorLabel}</p>
      ) : (
        <Image
          src={previewUrl}
          alt={title}
          width={1224}
          height={1584}
          unoptimized
          onError={() => setFailed(true)}
          className="mx-auto block h-auto w-full max-w-[900px] rounded-sm bg-white shadow-sm"
        />
      )}
      <a
        href={pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mx-auto mt-3 flex w-fit items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-4"
      >
        {openLabel}
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
