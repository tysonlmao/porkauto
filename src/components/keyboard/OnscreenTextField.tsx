import { useId, useEffect, useRef } from "react";
import { useOnscreenKeyboard } from "./KeyboardProvider";
import { cn } from "@/lib/utils";

type OnscreenTextFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
  /** Open the keyboard when this field mounts (e.g. search panel opens). */
  autoOpen?: boolean;
  maxLength?: number;
};

/**
 * Text field that uses the app on-screen keyboard only (no native soft keyboard).
 */
export function OnscreenTextField({
  value,
  onChange,
  onSubmit,
  placeholder,
  className,
  autoOpen = false,
  maxLength,
}: OnscreenTextFieldProps) {
  const id = useId();
  const { open, active, syncValue } = useOnscreenKeyboard();
  const focused = active?.id === id;
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);
  onChangeRef.current = onChange;
  onSubmitRef.current = onSubmit;

  function activate() {
    open({
      id,
      value,
      onChange: (v) => onChangeRef.current(v),
      onSubmit: () => onSubmitRef.current?.(),
      maxLength,
    });
  }

  useEffect(() => {
    if (autoOpen) activate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  useEffect(() => {
    if (focused) syncValue(value);
  }, [value, focused, syncValue]);

  return (
    <button
      type="button"
      onClick={activate}
      className={cn(
        "w-full truncate bg-transparent text-left text-base text-white outline-none md:text-sm",
        !value && "text-zinc-600",
        className,
      )}
      aria-label={placeholder ?? "Text input"}
    >
      {value || placeholder}
    </button>
  );
}
