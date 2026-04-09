import type { ProviderConnection, ProviderNode } from "@/lib/api";
import {
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
} from "@/constants/providers";
import type { StatusVariant } from "./types";

export function statusVariant(conn: ProviderConnection): StatusVariant {
  if (conn.isActive === false) return "default";
  if (conn.testStatus === "active" || conn.testStatus === "success")
    return "success";
  if (
    conn.testStatus === "error" ||
    conn.testStatus === "expired" ||
    conn.testStatus === "unavailable"
  )
    return "error";
  return "default";
}

export function statusLabel(conn: ProviderConnection): string {
  if (conn.isActive === false) return "disabled";
  return conn.testStatus ?? "unknown";
}

export function statusColor(variant: string): string {
  if (variant === "success") return "text-green-600";
  if (variant === "error") return "text-red-500";
  return "text-[--on-surface-variant]";
}

export function getLogoPath(providerId: string, node?: ProviderNode): string {
  if (node) {
    if (isAnthropicCompatibleProvider(node.type ?? "")) {
      return "/providers/anthropic-m.webp";
    }
    if (isOpenAICompatibleProvider(node.type ?? "")) {
      return node.apiType === "responses"
        ? "/providers/oai-r.webp"
        : "/providers/oai-cc.webp";
    }
  }
  return `/providers/${providerId}.webp`;
}
