import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { X, ChevronUp, ChevronDownIcon, Plus } from "lucide-react";

const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

export interface ModelWithWeight {
  model: string;
  weight: number;
}

const STRATEGIES = [
  { value: "fallback", label: "Fallback", description: "Try models in order, use first success" },
  { value: "round-robin", label: "Round Robin", description: "Rotate through models" },
  { value: "weight", label: "Weight", description: "Random selection by weight" },
  { value: "speed", label: "Speed", description: "Pick fastest by TTFT" },
] as const;

export default function ComboFormDialog({
  isOpen,
  comboId,
  initialName,
  initialModels,
  allModels,
  allCombos,
  allModelTypes,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  comboId: string | null;
  initialName: string;
  initialModels: ModelWithWeight[];
  allModels: string[];
  allCombos?: string[];  // List of combo names for nested support
  allModelTypes?: Record<string, "combo" | "model">;  // Mark which models are combos
  onSave: (name: string, models: ModelWithWeight[]) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ModelWithWeight[]>([]);
  const [strategy, setStrategy] = useState<typeof STRATEGIES[number]["value"]>("fallback");
  const [modelSearch, setModelSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setSelected([...initialModels]);
      setStrategy("fallback");
      setModelSearch("");
      setNameError("");
    }
  }, [isOpen, initialName, initialModels]);

  const validateName = (v: string) => {
    if (!v.trim()) {
      setNameError("Name is required");
      return false;
    }
    if (!VALID_NAME_REGEX.test(v)) {
      setNameError("Only a-z, A-Z, 0-9, -, _ and . allowed");
      return false;
    }
    setNameError("");
    return true;
  };

  const toggleModel = (modelId: string) => {
    setSelected((prev) =>
      prev.some((m) => m.model === modelId)
        ? prev.filter((m) => m.model !== modelId)
        : [...prev, { model: modelId, weight: 1 }],
    );
  };

  const removeModel = (modelId: string) => {
    setSelected((prev) => prev.filter((m) => m.model !== modelId));
  };

  const updateWeight = (modelId: string, weight: number) => {
    setSelected((prev) =>
      prev.map((m) => (m.model === modelId ? { ...m, weight: Math.max(1, Math.round(weight)) } : m)),
    );
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const arr = [...selected];
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    setSelected(arr);
  };

  const moveDown = (index: number) => {
    if (index === selected.length - 1) return;
    const arr = [...selected];
    [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
    setSelected(arr);
  };

  const handleSave = async () => {
    if (!validateName(name)) return;
    setSaving(true);
    await onSave(name.trim(), selected);
    setSaving(false);
  };

  // Filter available models (not already selected) by search
  // Also exclude current combo being edited to prevent self-reference
  const available = useMemo(() => {
    const q = modelSearch.toLowerCase();
    const currentComboName = comboId ? initialName : null;
    return allModels
      .filter((m) => !selected.some((s) => s.model === m))
      .filter((m) => m !== currentComboName) // Prevent self-reference
      .filter((m) => m.toLowerCase().includes(q));
  }, [allModels, selected, modelSearch, comboId, initialName]);

  const isEdit = !!comboId;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className='sm:max-w-md max-h-[85vh] flex flex-col'>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Combo" : "Create Combo"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update combo name, strategy, and models"
              : "Create a model combo with routing strategies"}
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-4 py-2 overflow-y-auto flex-1 min-h-0'>
          {/* Name */}
          <div className='space-y-1.5'>
            <Label htmlFor='combo-name'>Combo Name</Label>
            <Input
              id='combo-name'
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value) validateName(e.target.value);
                else setNameError("");
              }}
              placeholder='my-combo'
              aria-invalid={!!nameError}
            />
            {nameError ? (
              <p className='text-[10px] text-destructive mt-0.5'>{nameError}</p>
            ) : (
              <p className='text-[10px] text-muted-foreground mt-0.5'>
                Only a-z, A-Z, 0-9, -, _ and . allowed
              </p>
            )}
          </div>

          {/* Strategy */}
          <div className='space-y-1.5'>
            <Label htmlFor='combo-strategy'>Routing Strategy</Label>
            <select
              id='combo-strategy'
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as typeof STRATEGIES[number]["value"])}
              className='flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
            >
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label} — {s.description}
                </option>
              ))}
            </select>
          </div>

          {/* Selected models (ordered list with weights) */}
          <div className='space-y-1.5'>
            <Label>Selected Models ({selected.length})</Label>
            {selected.length > 0 ? (
              <ScrollArea className='h-45 rounded-md border border-input bg-card/50 shadow-sm p-2'>
                <TooltipProvider delayDuration={300}>
                  <div className='flex flex-col gap-1'>
                    {selected.map((item, index) => (
                      <div
                        key={item.model}
                        className='flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/40 hover:bg-muted transition-colors border border-transparent hover:border-border/50'
                      >
                        <Badge
                          variant='secondary'
                          className='text-[10px] h-4 w-4 p-0 flex items-center justify-center shrink-0 font-mono bg-background text-muted-foreground shadow-sm'
                        >
                          {index + 1}
                        </Badge>
                        <code className='flex-1 min-w-0 text-xs font-mono text-foreground truncate'>
                          {item.model}
                        </code>
                        {allModelTypes?.[item.model] === "combo" && (
                          <Badge variant='outline' className='text-[9px] px-1.5 py-0 h-4 ml-2 bg-primary/10 text-primary border-primary/30 shrink-0'>
                            Combo
                          </Badge>
                        )}
                        {(strategy === "weight" || strategy === "speed") && (
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={item.weight}
                            onChange={(e) => updateWeight(item.model, parseInt(e.target.value) || 1)}
                            className="w-16 h-6 text-xs"
                          />
                        )}
                        <div className='flex items-center gap-0.5'>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant='ghost'
                                size='icon-xs'
                                onClick={() => moveUp(index)}
                                disabled={index === 0}
                              >
                                <ChevronUp className='w-3.5 h-3.5' />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side='top' className='text-[10px]'>
                              Move up
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant='ghost'
                                size='icon-xs'
                                onClick={() => moveDown(index)}
                                disabled={index === selected.length - 1}
                              >
                                <ChevronDownIcon className='w-3.5 h-3.5' />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side='top' className='text-[10px]'>
                              Move down
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant='ghost'
                                size='icon-xs'
                                className='hover:bg-destructive/10 hover:text-destructive'
                                onClick={() => removeModel(item.model)}
                              >
                                <X className='w-3.5 h-3.5' />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side='top' className='text-[10px]'>
                              Remove
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                  </div>
                </TooltipProvider>
              </ScrollArea>
            ) : (
              <div className='flex flex-col items-center justify-center h-45 rounded-md border border-dashed border-input bg-card/30 p-4 text-center'>
                <p className='text-xs text-muted-foreground italic'>
                  No models selected
                </p>
                <p className='text-[10px] text-muted-foreground/70 mt-1'>
                  Search and pick from the list below
                </p>
              </div>
            )}
          </div>

          {/* Search & pick models */}
          <div className='space-y-1.5'>
            <Label>Add Models</Label>
            <Command className='rounded-lg border border-input shadow-sm bg-card'>
              <CommandInput
                placeholder='Search models...'
                value={modelSearch}
                onValueChange={setModelSearch}
              />
              <CommandList>
                <CommandEmpty className='py-4 text-center text-xs text-muted-foreground'>
                  No matching models
                </CommandEmpty>
                <CommandGroup>
                  {available.slice(0, 50).map((modelId) => {
                    const isCombo = allModelTypes?.[modelId] === "combo";
                    return (
                      <CommandItem
                        key={modelId}
                        value={modelId}
                        onSelect={() => {
                          toggleModel(modelId);
                          setModelSearch("");
                        }}
                        className='text-xs cursor-pointer'
                      >
                        <Plus className='w-3.5 h-3.5 text-primary shrink-0 mr-2 opacity-70' />
                        <code className='font-mono text-foreground truncate flex-1'>
                          {modelId}
                        </code>
                        {isCombo && (
                          <Badge variant='outline' className='text-[9px] px-1.5 py-0 h-4 ml-2 bg-primary/10 text-primary border-primary/30 shrink-0'>
                            Combo
                          </Badge>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' size='sm' onClick={onClose}>
            Cancel
          </Button>
          <Button
            size='sm'
            onClick={handleSave}
            disabled={!name.trim() || !!nameError || saving}
          >
            {saving ? "Saving…" : isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
