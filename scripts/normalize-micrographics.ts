/**
 * Normalize curated Micrographics SVGs to currentColor and emit React components.
 * Run: bun run scripts/normalize-micrographics.ts
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, basename } from "path";

const ROOT = join(import.meta.dir, "..");
const ASSETS = join(ROOT, "src/assets/micrographics");
const OUT_COMP = join(ROOT, "src/components/graphics/icons");
const OUT_SCENE = join(ROOT, "src/components/graphics/scenes");

/** Porkauto-flavored text replacements for editable scenes (applied to tspan contents). */
const SCENE_TEXT: Record<string, Record<string, string>> = {
  "device-link.svg": {
    "DEVICE LINK — ACTIVE": "DEVICE LINK — WAITING",
    "DEVICE LINK - ACTIVE": "DEVICE LINK — WAITING",
    "VOLTAGE: 12V — CURRENT: 1.8A": "SCAN QR OR ENTER CODE",
    "VOLTAGE: 12V - CURRENT: 1.8A": "SCAN QR OR ENTER CODE",
    "SECURITY–LAYER": "PAIRING LAYER",
    "SECURITY-LAYER": "PAIRING LAYER",
    UNLOCKED: "READY",
    "CODE: 0xFF02": "CODE: PAIR",
  },
  "device-online.svg": {
    DEVICE: "DEVICE",
    "REMOTE INTERFACE — ONLINE": "COMPANION LINK — ONLINE",
    "REMOTE INTERFACE - ONLINE": "COMPANION LINK — ONLINE",
    "LATENCY: 10ms": "LATENCY: OK",
    "SIGNAL: STRONG": "SIGNAL: STRONG",
  },
  "access-granted.svg": {
    "ACCESS: GRANTED": "ACCESS: GRANTED",
    "LATENCY: 10ms": "LINK CONFIRMED",
    "SIGNAL: STRONG": "COMPANION PAIRED",
    SNAPSHOT: "LINKED",
  },
  "sensor-array.svg": {
    "SENSOR ARRAY — PROCESSING": "SENSOR ARRAY — REQUESTING",
    "SENSOR ARRAY - PROCESSING": "SENSOR ARRAY — REQUESTING",
    "TEMP: 23°C": "GPS + MOTION",
    "PRESSURE: 1.2kPa": "TAP ALLOW ACCESS",
    SYSTEM: "SENSORS",
  },
  "sensor-config.svg": {
    CONFIG: "SENSORS",
    "TARGET: SUBSYSTEM-03": "TARGET: LOCATION + IMU",
    "SENSOR ARRAY — PROCESSING": "SENSOR ARRAY — REQUESTING",
    "SENSOR ARRAY - PROCESSING": "SENSOR ARRAY — REQUESTING",
    "GATEWAY UNIT — ONLINE – BANDWIDTH: 2.4Gbps": "AWAITING SAFARI PERMISSION",
    "GATEWAY UNIT - ONLINE - BANDWIDTH: 2.4Gbps": "AWAITING SAFARI PERMISSION",
  },
  "route-activated.svg": {
    "[ACTIVATED]": "[ACTIVATED]",
    "PRIMARY ROUTE — VERIFIED": "PRIMARY ROUTE — LOCKED",
    "PRIMARY ROUTE - VERIFIED": "PRIMARY ROUTE — LOCKED",
    "CHECKSUM: OK | THROUGHPUT: HIGH": "NAVIGATION ARMED",
    "CHECKSUM: OK — THROUGHPUT: HIGH": "NAVIGATION ARMED",
  },
  "reconnecting.svg": {
    "FREQUENCY REGISTERED": "SIGNAL CHECK",
    "DECIPHERING...": "RECONNECTING…",
    OVERRIDE: "LINK",
    "COMMUNICATIONS": "NETWORK",
    "RECONNECTING [+]": "RECONNECTING",
  },
  "install-complete.svg": {
    INSTALLED: "LINKED",
    "100%": "OK",
    "PRE-PATCH": "PAIRING",
    COMPLETE: "COMPLETE",
    MODE: "READY",
  },
  "sector-status.svg": {
    "SECTOR C — DEGRADED": "DISPLAY — STANDBY",
    "SECTOR C - DEGRADED": "DISPLAY — STANDBY",
    "SIGNAL: WEAK": "AWAITING PAIR",
    "STATE: OFFLINE": "STATE: UNPAIRED",
    "SECURITY LAYER": "PAIRING LAYER",
    "LOCKED // CODE: 0xFF01": "SCAN TO CONTINUE",
  },
};

function toPascal(name: string): string {
  return name
    .replace(/\.svg$/i, "")
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

function normalizeSvg(raw: string, sceneFile?: string): string {
  let out = raw;

  // Color → currentColor (keep fill:none)
  out = out.replace(/stroke:\s*#000\b/gi, "stroke: currentColor");
  out = out.replace(/fill:\s*#000\b/gi, "fill: currentColor");
  out = out.replace(/stroke="#000"/gi, 'stroke="currentColor"');
  out = out.replace(/fill="#000"/gi, 'fill="currentColor"');
  out = out.replace(/stroke:\s*#000000\b/gi, "stroke: currentColor");
  out = out.replace(/fill:\s*#000000\b/gi, "fill: currentColor");

  // Root SVG: inherit lighter fills instead of default black
  if (!/\bfill="/.test(out.match(/<svg\b[^>]*>/)?.[0] ?? "")) {
    out = out.replace(/<svg\b([^>]*)>/, '<svg$1 fill="currentColor">');
  } else {
    out = out.replace(/<svg\b([^>]*)fill="[^"]*"/, '<svg$1fill="currentColor"');
  }
  // Keep Roboto Mono family hint (preserve trailing semicolon)
  out = out.replace(
    /font-family:\s*RobotoMono-[A-Za-z]+,\s*'Roboto Mono';/g,
    "font-family: 'Roboto Mono', ui-monospace, monospace;",
  );
  out = out.replace(
    /font-family:\s*NotoSansJP-[A-Za-z]+,\s*'Noto Sans JP';/g,
    "font-family: 'Noto Sans JP', 'Hiragino Sans', sans-serif;",
  );

  if (sceneFile) {
    // Scene typography must be white on dark HUD (do not inherit zinc/emerald tint)
    out = out.replace(
      /(font-family:[^;}]+;)/g,
      "$1\n        fill: #ffffff;",
    );
    // Avoid double fill if already present after font-family block
    out = out.replace(/fill:\s*#ffffff;\s*\n\s*fill:\s*#ffffff;/g, "fill: #ffffff;");
    out = out.replace(/<text\b([^>]*?)>/g, (_m, attrs: string) => {
      if (/\bfill=/.test(attrs)) {
        return `<text${attrs.replace(/\bfill="[^"]*"/, 'fill="#ffffff"')}>`;
      }
      return `<text${attrs} fill="#ffffff">`;
    });
  }

  if (sceneFile && SCENE_TEXT[sceneFile]) {
    const map = SCENE_TEXT[sceneFile];
    for (const [from, to] of Object.entries(map)) {
      out = out.split(from).join(to);
    }
  }

  return out;
}

function scopeClasses(svg: string, prefix: string): string {
  const classes = new Set<string>();
  for (const m of svg.matchAll(/\.(cls-\d+)\b/g)) {
    classes.add(m[1]!);
  }
  for (const m of svg.matchAll(/class(?:Name)?="([^"]+)"/g)) {
    for (const c of m[1]!.split(/\s+/)) {
      if (c.startsWith("cls-")) classes.add(c);
    }
  }
  let out = svg;
  for (const cls of classes) {
    const scoped = `${prefix}-${cls}`;
    out = out.replaceAll(`.${cls}`, `.${scoped}`);
    out = out.replaceAll(`class="${cls}"`, `class="${scoped}"`);
    out = out.replaceAll(`class="${cls} `, `class="${scoped} `);
    out = out.replaceAll(` ${cls}"`, ` ${scoped}"`);
    out = out.replaceAll(` ${cls} `, ` ${scoped} `);
  }
  return out;
}

function svgToJsx(svg: string, componentName: string): string {
  const prefix = componentName.replace(/^Mg/, "mg").toLowerCase();
  let body = svg.replace(/<\?xml[^?]*\?>\s*/i, "").trim();
  body = scopeClasses(body, prefix);
  body = body.replace(/\sclass=/g, " className=");

  // JSX: style tag content must not be escaped oddly; keep as-is
  body = body.replace(
    /<svg\b([^>]*)>/,
    (_m, attrs: string) => {
      const a = attrs
        .replace(/\sxmlns(:\w+)?="[^"]*"/g, "")
        .replace(/\sxml:space="[^"]*"/g, "")
        .replace(/\sid="[^"]*"/g, "")
        .replace(/\sdata-name="[^"]*"/g, "");
      return `<svg${a} aria-hidden {...props}>`;
    },
  );

  // Strip nested Layer ids that collide
  body = body.replace(/\sid="[^"]*"/g, "");
  body = body.replace(/\sdata-name="[^"]*"/g, "");

  // JSX-safe <style> blocks (CSS braces would otherwise be JS)
  body = body.replace(
    /<style>([\s\S]*?)<\/style>/g,
    (_m, css: string) => {
      const trimmed = css.trim().replace(/`/g, "\\`");
      return `<style>{\`${trimmed}\`}</style>`;
    },
  );

  // Common SVG presentation attrs → JSX camelCase when used as attributes
  const attrMap: Record<string, string> = {
    "stroke-width": "strokeWidth",
    "stroke-miterlimit": "strokeMiterlimit",
    "stroke-linecap": "strokeLinecap",
    "stroke-linejoin": "strokeLinejoin",
    "stroke-dasharray": "strokeDasharray",
    "stroke-dashoffset": "strokeDashoffset",
    "fill-rule": "fillRule",
    "clip-rule": "clipRule",
    "font-family": "fontFamily",
    "font-size": "fontSize",
    "letter-spacing": "letterSpacing",
    "xml:space": "xmlSpace",
  };
  for (const [from, to] of Object.entries(attrMap)) {
    body = body.replaceAll(`${from}=`, `${to}=`);
  }

  return `import type { SVGProps } from "react";

export function ${componentName}(props: SVGProps<SVGSVGElement>) {
  return (
    ${body}
  );
}
`;
}

function processDir(dir: string, outDir: string, isScene: boolean) {
  mkdirSync(outDir, { recursive: true });
  const files = readdirSync(dir).filter((f) => f.endsWith(".svg"));
  const exports: string[] = [];

  for (const file of files) {
    const raw = readFileSync(join(dir, file), "utf8");
    const normalized = normalizeSvg(raw, isScene ? file : undefined);
    writeFileSync(join(dir, file), normalized, "utf8");

    const name = `Mg${toPascal(file)}`;
    const jsx = svgToJsx(normalized, name);
    const outFile = `${basename(file, ".svg")}.tsx`;
    writeFileSync(join(outDir, outFile), jsx, "utf8");
    exports.push(`export { ${name} } from "./${basename(file, ".svg")}";`);
    console.log(`${isScene ? "scene" : "icon"} ${file} → ${name}`);
  }

  writeFileSync(join(outDir, "index.ts"), exports.join("\n") + "\n", "utf8");
}

processDir(join(ASSETS, "components"), OUT_COMP, false);
processDir(join(ASSETS, "scenes"), OUT_SCENE, true);
console.log("done");
