/**
 * Sets CSS custom properties on an element from script. The Content Security
 * Policy forbids `style` attributes in markup; setting properties through the
 * element's style object is allowed, and this is the one place it is done.
 */
export function cssVar(node: HTMLElement, vars: Record<string, string>) {
  const apply = (next: Record<string, string>) => {
    for (const [name, value] of Object.entries(next)) node.style.setProperty(name, value);
  };
  apply(vars);
  return { update: apply };
}
