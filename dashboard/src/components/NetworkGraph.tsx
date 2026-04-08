import React, { forwardRef, useRef } from "react";
import { cn } from "@/lib/utils";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import {
  Network,
  Brain,
  Cpu,
  Sparkles,
  Box,
  Activity,
  MessageSquare,
} from "lucide-react";

const Circle = forwardRef<
  HTMLDivElement,
  {
    className?: string;
    children?: React.ReactNode;
    label?: string;
    glow?: boolean;
  }
>(({ className, children, label, glow }, ref) => {
  return (
    <div className='flex flex-col items-center gap-2 z-10'>
      <div
        ref={ref}
        className={cn(
          "z-10 flex h-12 w-12 items-center justify-center rounded-xl border-2 bg-card p-3 ambient-shadow",
          glow && "inner-glow border-primary text-primary",
          className,
        )}
      >
        {children}
      </div>
      {label && (
        <span className='text-[10px] font-medium text-muted-foreground whitespace-nowrap'>
          {label}
        </span>
      )}
    </div>
  );
});
Circle.displayName = "Circle";

export function NetworkGraph({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Central node
  const routerRef = useRef<HTMLDivElement>(null);

  // Provider nodes
  const div1Ref = useRef<HTMLDivElement>(null);
  const div2Ref = useRef<HTMLDivElement>(null);
  const div3Ref = useRef<HTMLDivElement>(null);
  const div4Ref = useRef<HTMLDivElement>(null);
  const div5Ref = useRef<HTMLDivElement>(null);
  const div6Ref = useRef<HTMLDivElement>(null);

  return (
    <div
      className={cn(
        "relative flex h-[400px] w-full items-center justify-center overflow-hidden rounded-xl border bg-surface-container-lowest p-10",
        className,
      )}
      ref={containerRef}
    >
      <div className='flex h-full w-full flex-col items-stretch justify-between gap-10 max-w-2xl'>
        <div className='flex flex-row items-center justify-between'>
          <Circle ref={div1Ref} label='Claude Code'>
            <Brain className='h-5 w-5 text-orange-500' />
          </Circle>
          <Circle ref={div2Ref} label='GitHub Copilot'>
            <Cpu className='h-5 w-5 text-blue-500' />
          </Circle>
          <Circle ref={div3Ref} label='NVIDIA NIM'>
            <Sparkles className='h-5 w-5 text-green-500' />
          </Circle>
        </div>

        <div className='flex flex-row items-center justify-between'>
          <Circle ref={div4Ref} label='Gemini'>
            <Box className='h-5 w-5 text-indigo-400' />
          </Circle>

          <Circle ref={routerRef} label='9Router' glow className='h-16 w-16'>
            <Network className='h-8 w-8' />
          </Circle>

          <Circle ref={div5Ref} label='Qwen Code'>
            <Activity className='h-5 w-5 text-purple-500' />
          </Circle>
        </div>

        <div className='flex flex-row items-center justify-center gap-32'>
          <Circle ref={div6Ref} label='Ollama'>
            <MessageSquare className='h-5 w-5 text-slate-400' />
          </Circle>
        </div>
      </div>

      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div1Ref}
        toRef={routerRef}
        duration={3}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div2Ref}
        toRef={routerRef}
        duration={4}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div3Ref}
        toRef={routerRef}
        duration={3.5}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div4Ref}
        toRef={routerRef}
        duration={5}
        curvature={-50}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div5Ref}
        toRef={routerRef}
        duration={4.5}
        curvature={50}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div6Ref}
        toRef={routerRef}
        duration={3.2}
      />
    </div>
  );
}
