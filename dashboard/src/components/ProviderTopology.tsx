import { useMemo, useCallback, useRef } from "react";
import { ReactFlow, Handle, Position, type Node, type Edge, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  getProviderConfig,
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
} from "@/constants/providers";
import type { ProviderNode } from "@/lib/api";

// ─── Node Data Types ──────────────────────────────────────────────────────────

export interface ProviderNodeData extends Record<string, unknown> {
  label: string;
  color: string;
  textIcon: string;
  active: boolean;
}

export interface RouterNodeData extends Record<string, unknown> {
  activeCount: number;
}

// ─── Custom Nodes ────────────────────────────────────────────────────────────

function ProviderNode({ data }: NodeProps<Node<ProviderNodeData>>) {
  const { label, color, textIcon, active } = data;
  return (
    <div
      className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg border-2 transition-all duration-300 bg-[--surface-container-lowest]"
      style={{
        borderColor: active ? color : "var(--color-border)",
        boxShadow: active ? `0 0 16px ${color}40` : "none",
        minWidth: "150px",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom"
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right"
        className="!bg-transparent !border-0 !w-0 !h-0"
      />

      {/* Provider icon badge */}
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 text-white text-sm font-bold"
        style={{ backgroundColor: `${color}` }}
      >
        {textIcon}
      </div>

      {/* Provider name */}
      <span
        className="text-sm font-medium truncate"
        style={{ color: active ? color : "var(--color-text)" }}
      >
        {label}
      </span>

      {/* Active ping indicator */}
      {active && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ backgroundColor: color }}
          />
          <span
            className="relative inline-flex rounded-full h-2 w-2"
            style={{ backgroundColor: color }}
          />
        </span>
      )}
    </div>
  );
}

function RouterNode({ data }: NodeProps<Node<RouterNodeData>>) {
  return (
    <div className="flex items-center justify-center px-5 py-3 rounded-xl border-2 border-[--primary] bg-[--primary]/5 shadow-md min-w-[130px]">
      <Handle
        type="source"
        position={Position.Top}
        id="top"
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!bg-transparent !border-0 !w-0 !h-0"
      />

      <img src="/logo.svg" alt="LLM Gateway" className="w-6 h-6 mr-2" />
      <span className="text-sm font-bold text-[--primary]">LLM Gateway</span>
      {data.activeCount > 0 && (
        <span className="ml-2 px-1.5 py-0.5 rounded-full bg-[--primary] text-white text-xs font-bold">
          {data.activeCount}
        </span>
      )}
    </div>
  );
}

const nodeTypes = { provider: ProviderNode, router: RouterNode };

// ─── Layout Algorithm ─────────────────────────────────────────────────────────

function buildLayout(
  providers: Array<{ provider: string; requests: number }>,
  activeSet: Set<string>,
  lastSet: Set<string>,
  errorSet: Set<string>,
  providerNodes?: ProviderNode[]
): { nodes: Node[]; edges: Edge[] } {
  const nodeW = 180;
  const nodeH = 30;
  const routerW = 120;
  const routerH = 44;
  const nodeGap = 24;
  const count = providers.length;

  const minRx = ((nodeW + nodeGap) * count) / (2 * Math.PI);
  const rx = Math.max(320, minRx);
  const ry = Math.max(200, rx * 0.55);

  if (count === 0) {
    return {
      nodes: [
        {
          id: "router",
          type: "router",
          position: { x: 0, y: 0 },
          data: { activeCount: 0 },
          draggable: false,
        } satisfies Node,
      ],
      edges: [],
    };
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: "router",
    type: "router",
    position: { x: -routerW / 2, y: -routerH / 2 },
    data: { activeCount: activeSet.size },
    draggable: false,
  });

  // Calculate max requests for usage scaling
  const maxRequests = Math.max(...providers.map((p) => p.requests), 1);

  const edgeStyle = (active: boolean, last: boolean, error: boolean, requests: number) => {
    // Power curve for more extreme visual differentiation
    const usageRatio = requests / maxRequests;
    const scaled = Math.pow(usageRatio, 0.6); // curve: amplifies mid-low differences
    const strokeWidth = 0.5 + scaled * 5.5; // 0.5 to 6
    const opacity = 0.05 + scaled * 0.95; // 0.05 to 1.0

    if (error) return { stroke: "#ef4444", strokeWidth, opacity: Math.max(opacity, 0.5) };
    if (active) return { stroke: "#22c55e", strokeWidth, opacity: Math.max(opacity, 0.2) };
    if (last)
      return {
        stroke: "#f59e0b",
        strokeWidth: Math.max(strokeWidth, 1),
        opacity: Math.max(opacity, 0.2),
      };
    return {
      stroke: "var(--color-border)",
      strokeWidth,
      opacity,
    };
  };

  providers.forEach((p, i) => {
    const config = getProviderConfig(p.provider);
    const active = activeSet.has(p.provider?.toLowerCase());
    const last = !active && lastSet.has(p.provider?.toLowerCase());
    const error = !active && errorSet.has(p.provider?.toLowerCase());
    const nodeId = `provider-${p.provider}`;

    // For compatible providers, use the actual node name if available
    const isCompatible =
      isOpenAICompatibleProvider(p.provider) || isAnthropicCompatibleProvider(p.provider);
    const providerNode = isCompatible ? providerNodes?.find((n) => n.id === p.provider) : undefined;

    const data: ProviderNodeData = {
      label: providerNode?.name ?? (config.name !== p.provider ? config.name : p.provider),
      color: config.color,
      textIcon: config.textIcon,
      active,
    };

    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
    const cx = rx * Math.cos(angle);
    const cy = ry * Math.sin(angle);

    let sourceHandle: string, targetHandle: string;
    if (
      Math.abs(angle + Math.PI / 2) < Math.PI / 4 ||
      Math.abs(angle - (3 * Math.PI) / 2) < Math.PI / 4
    ) {
      sourceHandle = "top";
      targetHandle = "bottom";
    } else if (Math.abs(angle - Math.PI / 2) < Math.PI / 4) {
      sourceHandle = "bottom";
      targetHandle = "top";
    } else if (cx > 0) {
      sourceHandle = "right";
      targetHandle = "left";
    } else {
      sourceHandle = "left";
      targetHandle = "right";
    }

    nodes.push({
      id: nodeId,
      type: "provider",
      position: { x: cx - nodeW / 2, y: cy - nodeH / 2 },
      data,
      draggable: false,
    });

    edges.push({
      id: `e-${nodeId}`,
      source: "router",
      sourceHandle,
      target: nodeId,
      targetHandle,
      animated: active,
      style: edgeStyle(active, last, error, p.requests),
    });
  });

  return { nodes, edges };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export interface ProviderTopologyProps {
  providers: Array<{
    provider: string;
    requests: number;
    cost: number;
    tokens: number;
  }>;
  lastProvider?: string;
  errorProvider?: string;
  nodes?: ProviderNode[];
}

export function ProviderTopology({
  providers,
  lastProvider,
  errorProvider,
  nodes,
}: ProviderTopologyProps) {
  const activeKey = useMemo(
    () =>
      providers
        .filter((p) => p.requests > 0)
        .map((p) => p.provider?.toLowerCase())
        .sort()
        .join(","),
    [providers]
  );
  const lastKey = lastProvider?.toLowerCase() ?? "";
  const errorKey = errorProvider?.toLowerCase() ?? "";

  const activeSet = useMemo(() => new Set(activeKey ? activeKey.split(",") : []), [activeKey]);
  const lastSet = useMemo(() => new Set(lastKey ? [lastKey] : []), [lastKey]);
  const errorSet = useMemo(() => new Set(errorKey ? [errorKey] : []), [errorKey]);

  const { nodes: flowNodes, edges } = useMemo(
    () => buildLayout(providers, activeSet, lastSet, errorSet, nodes),
    [providers, activeKey, lastKey, errorKey, nodes]
  );

  const providersKey = useMemo(
    () =>
      providers
        .map((p) => p.provider)
        .sort()
        .join(","),
    [providers]
  );

  const rfInstance = useRef<{
    fitView: (opts: { padding: number }) => void;
  } | null>(null);
  const onInit = useCallback((instance: { fitView: (opts: { padding: number }) => void }) => {
    rfInstance.current = instance;
    setTimeout(() => instance.fitView({ padding: 0.3 }), 50);
  }, []);

  return (
    <div className="w-full" style={{ height: 480 }}>
      {providers.length === 0 ? (
        <div className="h-full flex items-center justify-center text-[--on-surface-variant] text-sm">
          No providers connected
        </div>
      ) : (
        <ReactFlow
          key={providersKey}
          nodes={flowNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          onInit={onInit}
          proOptions={{ hideAttribution: true }}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        />
      )}
    </div>
  );
}
