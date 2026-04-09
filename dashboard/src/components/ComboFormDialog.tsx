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

export default function ComboFormDialog({
  isOpen,
  comboId,
  initialName,
  initialModels,
  allModels,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  comboId: string | null;
  initialName: string;
  initialModels: string[];
  allModels: string[];
  onSave: (name: string, models: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [modelSearch, setModelSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setSelected([...initialModels]);
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
      prev.includes(modelId)
        ? prev.filter((m) => m !== modelId)
        : [...prev, modelId],
    );
  };

  const removeModel = (modelId: string) => {
    setSelected((prev) => prev.filter((m) => m !== modelId));
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
  const available = useMemo(() => {
    const q = modelSearch.toLowerCase();
    return allModels
      .filter((m) => !selected.includes(m))
      .filter((m) => m.toLowerCase().includes(q));
  }, [allModels, selected, modelSearch]);

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
              ? "Update combo name and models"
              : "Create a model combo with fallback support"}
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

          {/* Selected models (ordered list) */}
          <div className='space-y-1.5'>
            <Label>Selected Models ({selected.length})</Label>
            {selected.length > 0 ? (
              <ScrollArea className='h-45 rounded-md border border-input bg-card/50 shadow-sm p-2'>
                <TooltipProvider delayDuration={300}>
                  <div className='flex flex-col gap-1'>
                    {selected.map((model, index) => (
                      <div
                        key={model}
                        className='flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/40 hover:bg-muted transition-colors border border-transparent hover:border-border/50'
                      >
                        <Badge
                          variant='secondary'
                          className='text-[10px] h-4 w-4 p-0 flex items-center justify-center shrink-0 font-mono bg-background text-muted-foreground shadow-sm'
                        >
                          {index + 1}
                        </Badge>
                        <code className='flex-1 min-w-0 text-xs font-mono text-foreground truncate'>
                          {model}
                        </code>
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
                                onClick={() => removeModel(model)}
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
                  {available.slice(0, 50).map((modelId) => (
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
                      <code className='font-mono text-foreground truncate'>
                        {modelId}
                      </code>
                    </CommandItem>
                  ))}
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
