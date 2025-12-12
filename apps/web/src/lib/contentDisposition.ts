export function parseFilenameFromContentDisposition(
  value: string | null
): string | null {
  if (!value) return null;

  // Basic: attachment; filename="foo.docx"
  const match = /filename="([^"]+)"/i.exec(value);
  if (match?.[1]) return match[1];

  return null;
}
