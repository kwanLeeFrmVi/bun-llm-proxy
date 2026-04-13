/**
 * Format model ID to display name (e.g., "claude-opus-4-6" -> "Claude Opus 4.6")
 * @param modelId - The model ID to format.
 * @returns A formatted display name.
 */
export function formatModelName(modelId: string): string {
  return modelId
    .split(/[-/]/)
    .map((part) => {
      // Capitalize first letter
      const formatted = part.charAt(0).toUpperCase() + part.slice(1);
      // Convert version pattern "4-6" to "4.6", "4-5-20251001" to "4.5"
      if (/^\d+$/.test(part)) return part; // Pure numbers stay as is
      if (/^\d+-\d+$/.test(part)) return part.replace("-", "."); // "4-6" -> "4.6"
      if (/^\d+-\d+-\d+$/.test(part)) return part.replace(/-/g, "."); // "4-5-20251001" -> "4.5.20251001"
      return formatted;
    })
    .join(" ");
}
