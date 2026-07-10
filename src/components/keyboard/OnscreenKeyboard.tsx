import { useState, type ReactNode } from "react";
import { Delete, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type OnscreenKeyboardProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  onDismiss?: () => void;
  maxLength?: number;
};

const ROW1 = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"];
const ROW2 = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
const ROW3 = ["z", "x", "c", "v", "b", "n", "m"];
const NUM_ROW = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const SYMBOL_ROW = ["-", "/", ":", ";", "(", ")", "$", "&", "@", '"'];

type Layout = "letters" | "numbers";
type ShiftState = false | "once" | "lock";

function Key({
  label,
  wide,
  active,
  onPress,
  className,
  children,
}: {
  label?: string;
  wide?: boolean;
  active?: boolean;
  onPress: () => void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
      className={cn(
        "flex h-11 min-w-0 flex-1 items-center justify-center rounded-md border border-white/10 bg-white/10 text-[15px] font-medium text-white select-none transition active:bg-white/25",
        wide && "flex-[1.6]",
        active && "bg-white/25",
        className,
      )}
      aria-label={label}
    >
      {children ?? label}
    </button>
  );
}

/**
 * Docked QWERTY keyboard for embedded displays (no native soft keyboard).
 */
export function OnscreenKeyboard({
  value,
  onChange,
  onSubmit,
  onDismiss,
  maxLength,
}: OnscreenKeyboardProps) {
  const [layout, setLayout] = useState<Layout>("letters");
  const [shift, setShift] = useState<ShiftState>(false);

  function insert(char: string) {
    if (maxLength != null && value.length >= maxLength) return;
    onChange(value + char);
    if (shift === "once") setShift(false);
  }

  function backspace() {
    onChange(value.slice(0, -1));
  }

  const letterCase = (ch: string) =>
    shift ? ch.toUpperCase() : ch.toLowerCase();

  return (
    <div
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-black/95 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md hud-fade-in"
      role="group"
      aria-label="On-screen keyboard"
    >
      <div className="mx-auto mb-1.5 flex w-full max-w-3xl items-center justify-end px-1">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            onDismiss?.();
          }}
          className="rounded-md px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500 transition hover:text-zinc-300"
        >
          Hide
        </button>
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5">
        {layout === "numbers" ? (
          <>
            <div className="flex gap-1.5">
              {NUM_ROW.map((k) => (
                <Key key={k} label={k} onPress={() => insert(k)} />
              ))}
            </div>
            <div className="flex gap-1.5">
              {SYMBOL_ROW.map((k) => (
                <Key key={k} label={k} onPress={() => insert(k)} />
              ))}
            </div>
            <div className="flex gap-1.5">
              <Key
                label="abc"
                wide
                onPress={() => setLayout("letters")}
                className="text-[12px] uppercase tracking-wide text-zinc-300"
              />
              <Key label="." onPress={() => insert(".")} />
              <Key label="," onPress={() => insert(",")} />
              <Key label="'" onPress={() => insert("'")} />
              <Key label="?" onPress={() => insert("?")} />
              <Key label="!" onPress={() => insert("!")} />
              <Key
                label="backspace"
                wide
                onPress={backspace}
                className="text-zinc-200"
              >
                <Delete className="h-4 w-4" />
              </Key>
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-1.5">
              {ROW1.map((k) => (
                <Key
                  key={k}
                  label={letterCase(k)}
                  onPress={() => insert(letterCase(k))}
                />
              ))}
            </div>
            <div className="flex gap-1.5 px-3">
              {ROW2.map((k) => (
                <Key
                  key={k}
                  label={letterCase(k)}
                  onPress={() => insert(letterCase(k))}
                />
              ))}
            </div>
            <div className="flex gap-1.5">
              <Key
                label="shift"
                wide
                active={Boolean(shift)}
                onPress={() =>
                  setShift((s) =>
                    s === "once" ? "lock" : s === "lock" ? false : "once",
                  )
                }
                className="text-[12px] uppercase tracking-wide text-zinc-300"
              >
                {shift === "lock" ? "⇪" : "⇧"}
              </Key>
              {ROW3.map((k) => (
                <Key
                  key={k}
                  label={letterCase(k)}
                  onPress={() => insert(letterCase(k))}
                />
              ))}
              <Key
                label="backspace"
                wide
                onPress={backspace}
                className="text-zinc-200"
              >
                <Delete className="h-4 w-4" />
              </Key>
            </div>
          </>
        )}

        <div className="flex gap-1.5">
          {layout === "letters" ? (
            <Key
              label="123"
              wide
              onPress={() => setLayout("numbers")}
              className="text-[12px] uppercase tracking-wide text-zinc-300"
            />
          ) : (
            <Key
              label="abc"
              wide
              onPress={() => setLayout("letters")}
              className="text-[12px] uppercase tracking-wide text-zinc-300"
            />
          )}
          <Key
            label="space"
            onPress={() => insert(" ")}
            className="flex-[5] text-[12px] uppercase tracking-wide text-zinc-400"
          >
            space
          </Key>
          <Key
            label="done"
            wide
            onPress={() => {
              onSubmit?.();
            }}
            className="bg-emerald-500/20 text-emerald-200"
          >
            <CornerDownLeft className="h-4 w-4" />
          </Key>
        </div>
      </div>
    </div>
  );
}
