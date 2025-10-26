import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Check } from "lucide-react";
import { toast } from "react-toastify";

interface Chain {
  id: number;
  name: string;
  logo?: string;
}

const SUPPORTED_CHAINS: Chain[] = [
  { id: 1135, name: "Lisk" },
  { id: 42220, name: "Celo" },
];

interface ChainSelectorProps {
  currentChainId?: number;
  onChainSwitch: (chainId: number) => Promise<void>;
  disabled?: boolean;
}

export function ChainSelector({ 
  currentChainId, 
  onChainSwitch,
  disabled = false 
}: ChainSelectorProps) {
  const [isSwitching, setIsSwitching] = useState(false);

  const currentChain = SUPPORTED_CHAINS.find(
    (chain) => chain.id === currentChainId
  );

  const handleChainSwitch = async (chainId: number) => {
    if (chainId === currentChainId || isSwitching) return;
    
    setIsSwitching(true);
    try {
      await onChainSwitch(chainId);
      const chainName = SUPPORTED_CHAINS.find(c => c.id === chainId)?.name;
      toast.success(`Switched to ${chainName}`);
    } catch (error: any) {
      console.error("Failed to switch chain:", error);
      toast.error(`Failed to switch chain: ${error.message}`);
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || isSwitching}
          className="text-xs sm:text-sm gap-1 sm:gap-2"
        >
          <span className="hidden sm:inline">
            {currentChain?.name || "Select Chain"}
          </span>
          <span className="sm:hidden">
            {currentChain?.name || "Chain"}
          </span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {SUPPORTED_CHAINS.map((chain) => (
          <DropdownMenuItem
            key={chain.id}
            onClick={() => handleChainSwitch(chain.id)}
            disabled={isSwitching}
            className="cursor-pointer flex items-center justify-between"
          >
            <span>{chain.name}</span>
            {currentChainId === chain.id && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}