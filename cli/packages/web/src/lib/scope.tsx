// Which scope a toggle acts on: "global" writes to ~/.claude, "project" to the folder agentry was started in.
// The sidebar's scope switcher sets it; list screens read it when they call a write procedure.
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

export type Scope = "global" | "project";

interface ScopeValue {
  scope: Scope;
  setScope: (scope: Scope) => void;
}

const ScopeContext = createContext<ScopeValue>({
  scope: "project",
  setScope: () => undefined,
});

export const ScopeProvider = ({ children }: { children: ReactNode }) => {
  const [scope, setScope] = useState<Scope>("project");
  const value = useMemo(() => ({ scope, setScope }), [scope]);
  return (
    <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
  );
};

export const useScope = () => useContext(ScopeContext);
