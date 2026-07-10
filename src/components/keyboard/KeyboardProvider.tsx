import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { OnscreenKeyboard } from "@/components/keyboard/OnscreenKeyboard";

export type KeyboardTarget = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  onClose?: () => void;
  /** Max length; omit for unlimited. */
  maxLength?: number;
};

type KeyboardContextValue = {
  active: KeyboardTarget | null;
  open: (target: KeyboardTarget) => void;
  close: () => void;
  /** Keep docked keyboard display in sync when the bound field value changes externally. */
  syncValue: (value: string) => void;
  isOpen: boolean;
};

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<KeyboardTarget | null>(null);

  const open = useCallback((target: KeyboardTarget) => {
    setActive(target);
  }, []);

  const close = useCallback(() => {
    setActive((prev) => {
      prev?.onClose?.();
      return null;
    });
  }, []);

  const syncValue = useCallback((value: string) => {
    setActive((prev) => (prev ? { ...prev, value } : prev));
  }, []);

  const value = useMemo(
    () => ({
      active,
      open,
      close,
      syncValue,
      isOpen: active !== null,
    }),
    [active, open, close, syncValue],
  );

  return (
    <KeyboardContext.Provider value={value}>
      {children}
        {active ? (
        <OnscreenKeyboard
          value={active.value}
          maxLength={active.maxLength}
          onChange={(next) => {
            active.onChange(next);
            setActive((prev) => (prev ? { ...prev, value: next } : prev));
          }}
          onSubmit={() => {
            active.onSubmit?.();
            close();
          }}
          onDismiss={close}
        />
      ) : null}
    </KeyboardContext.Provider>
  );
}

export function useOnscreenKeyboard(): KeyboardContextValue {
  const ctx = useContext(KeyboardContext);
  if (!ctx) {
    throw new Error("useOnscreenKeyboard must be used within KeyboardProvider");
  }
  return ctx;
}
