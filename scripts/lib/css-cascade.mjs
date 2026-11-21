/**
 * A tiny CSS cascade resolver, used by the layout checks to ask the question a
 * phone-only test cannot: "at THIS viewport width, what value actually wins?"
 *
 * Why this exists rather than a browser: there is no Chromium in this sandbox,
 * so the responsive layout has never been rendered here. This is the next best
 * thing — it resolves the *winning* declaration, so a rule that is present but
 * overridden fails the check, which a string search would happily pass.
 *
 * It is deliberately narrow: it understands the constructs this stylesheet uses
 * (class/type/id/pseudo selectors, comma lists, `min-width`/`max-width` media
 * queries, custom properties, `!important`) and nothing more. It is not a
 * browser — no inheritance, no shorthand expansion, no layout. A property that
 * is never declared returns null, which the checks assert on directly, so an
 * absent rule reads as "unchanged" rather than as a silent pass.
 */
import * as csstree from 'css-tree';

function specificity(selectorNode) {
  let a = 0;
  let b = 0;
  let c = 0;
  csstree.walk(selectorNode, (node) => {
    if (node.type === 'IdSelector') a++;
    else if (
      node.type === 'ClassSelector' ||
      node.type === 'AttributeSelector' ||
      node.type === 'PseudoClassSelector'
    )
      b++;
    else if (node.type === 'PseudoElementSelector') c++;
    else if (node.type === 'TypeSelector' && node.name !== '*') c++;
  });
  return [a, b, c];
}

/** Parses a stylesheet into a flat, source-ordered list of (selector, decl) rules. */
export function parseRules(css) {
  const ast = csstree.parse(css);
  const rules = [];
  let order = 0;
  csstree.walk(ast, {
    visit: 'Rule',
    enter(node) {
      const media =
        this.atrule && this.atrule.name === 'media'
          ? csstree.generate(this.atrule.prelude)
          : null;
      const decls = [];
      node.block.children.forEach((d) => {
        if (d.type !== 'Declaration') return;
        decls.push({
          prop: d.property,
          value: csstree.generate(d.value).trim(),
          important: Boolean(d.important),
        });
      });
      if (decls.length === 0) return;
      node.prelude.children.forEach((selectorNode) => {
        rules.push({
          sel: csstree.generate(selectorNode).replace(/\s+/g, ' ').trim(),
          decls,
          media,
          spec: specificity(selectorNode),
          order: order++,
        });
      });
    },
  });
  return rules;
}

/** True when every width condition in the query holds. Non-width queries never match. */
export function mediaMatches(media, width) {
  if (!media) return true;
  const conds = [...media.matchAll(/\(\s*(min|max)-width\s*:\s*([\d.]+)px\s*\)/g)];
  if (conds.length === 0) return false;
  return conds.every(([, kind, px]) =>
    kind === 'min' ? width >= Number(px) : width <= Number(px),
  );
}

/** Lexicographic compare of [important, a, b, c, order]. */
function compareRank(x, y) {
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return 0;
}

export function createCascade(css) {
  const rules = parseRules(css);

  /** The winning declaration for one selector + property at one width. */
  function declaredAt(selector, prop, width) {
    let best = null;
    for (const rule of rules) {
      if (rule.sel !== selector) continue;
      if (!mediaMatches(rule.media, width)) continue;
      for (const decl of rule.decls) {
        if (decl.prop !== prop) continue;
        const rank = [decl.important ? 1 : 0, ...rule.spec, rule.order];
        if (!best || compareRank(rank, best.rank) > 0) best = { value: decl.value, rank };
      }
    }
    return best ? best.value : null;
  }

  /** Substitutes var(--x) using the :root value that wins at the same width. */
  function resolve(value, width, depth = 0) {
    if (value === null || depth > 6) return value;
    return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (match, name, fallback) => {
      const got = declaredAt(':root', name, width);
      if (got !== null) return resolve(got, width, depth + 1);
      return fallback !== undefined ? fallback.trim() : match;
    });
  }

  /** The effective value of one property on one selector at one width. */
  function valueAt(selector, prop, width) {
    return resolve(declaredAt(selector, prop, width), width);
  }

  return { declaredAt, resolve, valueAt, rules };
}
