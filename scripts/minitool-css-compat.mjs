import postcss from 'postcss';
// Vite already depends on PostCSS. Keep compatibility local to the Mini Tool build.
function replaceFunctions(value, names, replace) {
  let output = '', cursor = 0;
  const pattern = new RegExp(`\\b(${names.join('|')})\\(`, 'g');
  for (let match; (match = pattern.exec(value));) {
    let end = pattern.lastIndex, depth = 1;
    for (; end < value.length && depth; end++) { if (value[end] === '(') depth++; if (value[end] === ')') depth--; }
    if (depth) throw new Error('Unbalanced CSS function');
    output += value.slice(cursor, match.index) + replace(match[1], postcss.list.comma(value.slice(pattern.lastIndex, end - 1)));
    cursor = end; pattern.lastIndex = end;
  }
  return output + value.slice(cursor);
}
export default function miniToolCssCompatibility() {
  return { postcssPlugin: 'minitool-css-compat', Once(root) {
    root.prepend(postcss.parse('* { --minitool-row-gap: 0px; --minitool-column-gap: 0px; }'));
    root.walkRules(rule => {
      if (rule.selector.includes(':is(')) {
        let selectors = postcss.list.comma(rule.selector);
        while (selectors.some(selector => selector.includes(':is('))) {
          selectors = selectors.flatMap(selector => {
            const m = /:is\(([^()]*)\)/.exec(selector);
            if (!m) return [selector];
            return postcss.list.comma(m[1]).map(option => selector.replace(m[0], option));
          });
        }
        rule.selector = selectors.join(',');
      }
      // Keep unsupported selectors out of baseline selector lists.
      if (/:has\(|:focus-visible/.test(rule.selector)) {
        const baseline = rule.cloneBefore();
        baseline.selector = rule.selector.replace(/:has\(\.spin-control\.expanded\)/g, '.is-spin-expanded')
          .replace(/:has\(:focus-visible\)/g, ':focus-within').replace(/:focus-visible/g, ':focus');
        if (baseline.selector.includes(':has(')) throw new Error('Unhandled :has fallback');
      }
    });
    const declarations = []; root.walkDecls(decl => declarations.push(decl));
    declarations.forEach(decl => {
      const { prop, value } = decl;
      if (prop === 'place-items') {
        decl.cloneBefore({ prop: 'align-items' }); decl.cloneBefore({ prop: 'justify-items' });
      }
      if (prop === 'padding-block') {
        const parts = postcss.list.space(value);
        decl.cloneBefore({ prop: 'padding-top', value: parts[0] }); decl.cloneBefore({ prop: 'padding-bottom', value: parts[1] || parts[0] });
      }
      if (value.includes('color-mix(')) {
        decl.cloneBefore({ value: replaceFunctions(value, ['color-mix'], (_, args) => args[1].replace(/\s+[\d.]+%$/, '')) });
      }
      if (prop === 'inset') {
        const parts = postcss.list.space(value);
        const edges = [parts[0], parts[1] || parts[0], parts[2] || parts[0], parts[3] || parts[1] || parts[0]];
        ['top','right','bottom','left'].forEach((side,index) => decl.cloneBefore({ prop: side, value: edges[index] }));
      }
      if (/^(?:row-|column-)?gap$/.test(prop)) {
        decl.cloneBefore({ prop: `grid-${prop}` });
        const parts = postcss.list.space(value);
        if (prop !== 'column-gap') decl.cloneBefore({ prop: '--minitool-row-gap', value: parts[0] });
        if (prop !== 'row-gap') decl.cloneBefore({ prop: '--minitool-column-gap', value: parts[1] || parts[0] });
      }
      if (/\b(?:env|min|max|clamp)\(/.test(value)) {
        let fallback = replaceFunctions(value, ['env'], (_, args) => `var(--${args[0]}, ${args[1] || '0px'})`);
        fallback = replaceFunctions(fallback, ['min','max','clamp'], (name,args) => name === 'clamp' ? args[0] : name === 'min' ? args[args.length-1] : args[0]);
        if (prop.startsWith('--')) {
          decl.value = fallback;
          const enhanced = postcss.atRule({ name: 'supports', params: '(width: clamp(1px, 2vw, 3px))' });
          const rule = postcss.rule({ selector: decl.parent.selector }); rule.append({ prop, value }); enhanced.append(rule);
          decl.parent.after(enhanced);
        } else {
          if (/^(width|height)$/.test(prop) && value.startsWith('min(')) {
            const args = postcss.list.comma(value.slice(4,-1));
            if (args.length === 2) { decl.cloneBefore({ value: args[1] }); decl.cloneBefore({ prop: `max-${prop}`, value: args[0] }); }
          } else decl.cloneBefore({ value: fallback });
          // Native and simulated safe-area values share one path; env remains an enhancement.
          decl.value = replaceFunctions(value, ['env'], (_, args) => `var(--${args[0]}, env(${args.join(',')}))`);
        }
      }
    });
  } };
}
