import { useMemo } from "react";
import type { ProviderCatalog, ProviderNode } from "@/lib/api";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/constants/providers";

export function getLogoPath(providerId: string, node?: ProviderNode): string {
  if (node) {
    if (isAnthropicCompatibleProvider(node.type ?? "")) {
      return "/providers/anthropic-m.webp";
    }
    if (isOpenAICompatibleProvider(node.type ?? "")) {
      return node.apiType === "responses" ? "/providers/oai-r.webp" : "/providers/oai-cc.webp";
    }
  }
  return `/providers/${providerId}.webp`;
}

export function getProviderName(
  providerId: string,
  catalog?: ProviderCatalog,
  node?: ProviderNode
): string {
  if (node) {
    return (
      node.name ??
      (isAnthropicCompatibleProvider(node.type ?? "")
        ? "Anthropic Compatible"
        : "OpenAI Compatible")
    );
  }
  return catalog?.name ?? providerId;
}

export function getApiTypeLabel(node: ProviderNode): string {
  if (isAnthropicCompatibleProvider(node.type ?? "")) return "Messages";
  return node.apiType === "responses" ? "Responses" : "Chat";
}

export function useProviderMeta(
  providerId: string,
  catalog?: ProviderCatalog,
  node?: ProviderNode
) {
  return useMemo(
    () => ({
      name: getProviderName(providerId, catalog, node),
      logoPath: getLogoPath(providerId, node),
      apiTypeLabel: node ? getApiTypeLabel(node) : undefined,
      isAnthropicCompat: isAnthropicCompatibleProvider(node?.type ?? ""),
      isOpenAICompat: isOpenAICompatibleProvider(node?.type ?? ""),
    }),
    [providerId, catalog, node]
  );
}
