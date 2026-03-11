import type { AnyUIComponent } from "@openclaw/protocol";
import { componentRegistry } from "./registry.js";

export interface ValidationError {
  path: string;
  message: string;
}

/** Validate a single A2UI component */
export function validateComponent(
  component: AnyUIComponent,
  path: string = "root",
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!component || typeof component !== "object") {
    errors.push({ path, message: "Component must be an object" });
    return errors;
  }

  if (!component.type || typeof component.type !== "string") {
    errors.push({ path, message: "Component must have a string 'type' field" });
    return errors;
  }

  const meta = componentRegistry.get(component.type);
  if (!meta) {
    errors.push({ path, message: `Unknown component type: '${component.type}'` });
    return errors;
  }

  // Check required fields
  for (const field of meta.requiredFields) {
    if (
      !(field in component) ||
      (component as unknown as Record<string, unknown>)[field] === undefined
    ) {
      errors.push({
        path: `${path}.${field}`,
        message: `Missing required field '${field}' for '${component.type}'`,
      });
    }
  }

  // Recursively validate children
  if (
    "children" in component &&
    Array.isArray((component as unknown as Record<string, unknown>).children)
  ) {
    const children = (component as unknown as Record<string, unknown>).children as AnyUIComponent[];
    for (let i = 0; i < children.length; i++) {
      errors.push(...validateComponent(children[i], `${path}.children[${i}]`));
    }
  }

  // Validate button group buttons
  if (component.type === "button_group" && Array.isArray(component.buttons)) {
    for (let i = 0; i < component.buttons.length; i++) {
      errors.push(...validateComponent(component.buttons[i], `${path}.buttons[${i}]`));
    }
  }

  // Validate tabs children
  if (component.type === "tabs" && Array.isArray(component.tabs)) {
    for (let i = 0; i < component.tabs.length; i++) {
      const tab = component.tabs[i];
      if (Array.isArray(tab.children)) {
        for (let j = 0; j < tab.children.length; j++) {
          errors.push(...validateComponent(tab.children[j], `${path}.tabs[${i}].children[${j}]`));
        }
      }
    }
  }

  // Validate split left/right panes
  if (component.type === "split") {
    const record = component as unknown as Record<string, unknown>;
    if (Array.isArray(record.left)) {
      const left = record.left as AnyUIComponent[];
      for (let i = 0; i < left.length; i++) {
        errors.push(...validateComponent(left[i], `${path}.left[${i}]`));
      }
    }
    if (Array.isArray(record.right)) {
      const right = record.right as AnyUIComponent[];
      for (let i = 0; i < right.length; i++) {
        errors.push(...validateComponent(right[i], `${path}.right[${i}]`));
      }
    }
  }

  return errors;
}

/** Validate an array of A2UI components */
export function validateComponents(components: AnyUIComponent[]): ValidationError[] {
  if (!Array.isArray(components)) {
    return [{ path: "root", message: "Components must be an array" }];
  }

  const errors: ValidationError[] = [];
  for (let i = 0; i < components.length; i++) {
    errors.push(...validateComponent(components[i], `components[${i}]`));
  }
  return errors;
}
