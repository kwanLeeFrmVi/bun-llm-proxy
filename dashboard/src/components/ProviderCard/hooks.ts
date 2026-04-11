import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export function useProviderTest(connectionId: string | undefined, onRefresh?: () => Promise<void>) {
  const [testing, setTesting] = useState(false);

  const testConnection = useCallback(async () => {
    if (!connectionId) {
      toast.error("No connection to test");
      return;
    }

    setTesting(true);
    try {
      const result = await api.providers.test(connectionId);
      if (result.valid) {
        toast.success(`Connection tested successfully (${result.latencyMs}ms)`);
      } else {
        toast.error(`Test failed: ${result.error || "Unknown error"}`);
      }
      await onRefresh?.();
    } catch (err) {
      toast.error(`Test failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setTesting(false);
    }
  }, [connectionId, onRefresh]);

  return { testing, testConnection };
}
