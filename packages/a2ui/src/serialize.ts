import type { AnyUIComponent } from "@openclaw/protocol";
import { validateComponents } from "./validate.js";

/** Serialize UI components to a JSON-safe format for Matrix events */
export function serializeUI(components: AnyUIComponent[]): string {
  return JSON.stringify(components);
}

/** Deserialize and validate UI components from a Matrix event */
export function deserializeUI(data: unknown): AnyUIComponent[] | null {
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(data)) return null;

  const components = data as AnyUIComponent[];
  const errors = validateComponents(components);

  if (errors.length > 0) {
    console.warn("[ui-components] Validation errors:", errors);
  }

  return components;
}
