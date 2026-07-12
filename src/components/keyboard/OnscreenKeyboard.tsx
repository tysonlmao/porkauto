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
        "flex h-10 min-w-0 flex-1 items-center justify-center rounded-md border border-white/10 bg-white/10 text-[14px] font-medium text-white select-none transition active:bg-white/25",
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
 * Sits bottom-right as a panel to the left of the destination/media controls.
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
      className="pointer-events-auto fixed z-50 w-[min(28rem,calc(100vw-min(22rem,calc(100vw-2.5rem))-3.5rem))] overflow-hidden rounded-xl border border-white/10 bg-black/95 p-2 shadow-2xl backdrop-blur-md hud-fade-in safe-bottom"
      style={{
        // Sit just left of the destination/media controls column (22rem + gap + safe-right).
        right:
          "calc(1.25rem + env(safe-area-inset-right, 0px) + min(22rem, calc(100vw - 2.5rem)) + 0.5rem)",
      }}
      role="group"
      aria-label="On-screen keyboard"
    >
      <div className="mb-1.5 flex items-center justify-end px-1">
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
      <div className="flex w-full flex-col gap-1.5">
        {layout === "numbers" ? (
          <>
            <div className="flex gap-1">
              {NUM_ROW.map((k) => (
                <Key key={k} label={k} onPress={() => insert(k)} />
              ))}
            </div>
            <div className="flex gap-1">
              {SYMBOL_ROW.map((k) => (
                <Key key={k} label={k} onPress={() => insert(k)} />
              ))}
            </div>
            <div className="flex gap-1">
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
            <div className="flex gap-1">
              {ROW1.map((k) => (
                <Key
                  key={k}
                  label={letterCase(k)}
                  onPress={() => insert(letterCase(k))}
                />
              ))}
            </div>
            <div className="flex gap-1 px-2">
              {ROW2.map((k) => (
                <Key
                  key={k}
                  label={letterCase(k)}
                  onPress={() => insert(letterCase(k))}
                />
              ))}
            </div>
            <div className="flex gap-1">
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

        <div className="flex gap-1">
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
            onPress={() => {
              insert(" ");
              if (layout === "numbers") setLayout("letters");
            }}
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
