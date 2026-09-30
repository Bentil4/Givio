// Regenerates docs/diagrams/generated/routes.mmd from the Angular route files.
// Parses the TypeScript AST instead of importing the routes, because the route files pull in
// Angular + lazy component imports that can't be evaluated in plain Node.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'src/app/app.routes.ts');
const OUT = resolve(ROOT, 'docs/diagrams/generated/routes.mmd');

const sourceCache = new Map();

function parse(file) {
  if (!sourceCache.has(file)) {
    const text = readFileSync(file, 'utf8');
    sourceCache.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
  }
  return sourceCache.get(file);
}

function findRoutesArray(file, name) {
  const sf = parse(file);
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (decl.name.getText(sf) === name && decl.initializer) {
        return ts.isArrayLiteralExpression(decl.initializer) ? decl.initializer : null;
      }
    }
  }
  return null;
}

function resolveImport(file, name) {
  const sf = parse(file);
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause?.namedBindings) continue;
    const bindings = stmt.importClause.namedBindings;
    if (!ts.isNamedImports(bindings)) continue;
    if (bindings.elements.some((el) => el.name.text === name)) {
      return resolve(dirname(file), `${stmt.moduleSpecifier.text}.ts`);
    }
  }
  return null;
}

function prop(obj, key) {
  return obj.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === key)
    ?.initializer;
}

function stringProp(obj, key) {
  const node = prop(obj, key);
  return node && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function guardList(obj, key) {
  const node = prop(obj, key);
  if (!node || !ts.isArrayLiteralExpression(node)) return [];
  return node.elements.map((el) =>
    el
      .getText()
      .replace(/\s+/g, ' ')
      .replace(/['[\]]/g, ''),
  );
}

// Resolves an identifier that names a routes array (`...ADMIN_ROUTES`, `children: CHILD_ROUTES`)
// to the file declaring it, following a named import when there is one.
function resolveRoutesRef(file, name) {
  const target = resolveImport(file, name) ?? file;
  const array = findRoutesArray(target, name);
  return array ? readRoutes(target, array) : [];
}

function readRoutes(file, array) {
  const routes = [];
  for (const el of array.elements) {
    if (ts.isSpreadElement(el) && ts.isIdentifier(el.expression)) {
      routes.push(...resolveRoutesRef(file, el.expression.text));
      continue;
    }
    if (!ts.isObjectLiteralExpression(el)) continue;
    const children = prop(el, 'children');
    routes.push({
      path: stringProp(el, 'path') ?? '',
      title: stringProp(el, 'title'),
      // `redirectTo: ''` is a real redirect (to the parent route), so presence matters, not truthiness.
      redirectTo: stringProp(el, 'redirectTo'),
      matchers: guardList(el, 'canMatch'),
      guards: [...new Set([...guardList(el, 'canActivate'), ...guardList(el, 'canMatch')])],
      source: relative(ROOT, file),
      children: !children
        ? []
        : ts.isArrayLiteralExpression(children)
          ? readRoutes(file, children)
          : ts.isIdentifier(children)
            ? resolveRoutesRef(file, children.text)
            : [],
    });
  }
  return routes;
}

const join = (base, path) => `/${[base, path].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
const nodeId = (url) => `r_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
const escape = (text) => text.replace(/"/g, '#quot;');

function label(url, title) {
  return title ? `"${escape(url)}<br/>${escape(title)}"` : `"${escape(url)}"`;
}

// Links a route to the sibling whose path is its longest segment prefix
// (events -> events/:id), so the diagram reads as navigation, not a flat list. When that prefix
// is shared by several canMatch variants the parent is ambiguous, so the route stays unlinked.
function parentAmong(route, siblings) {
  const segments = route.path.split('/');
  for (let n = segments.length - 1; n > 0; n--) {
    const prefix = segments.slice(0, n).join('/');
    const matches = siblings.filter((s) => s.path === prefix && s.redirectTo === undefined);
    if (matches.length) return matches.length === 1 ? matches[0] : null;
  }
  return null;
}

// Sibling routes that share a path (canMatch variants such as approved/pending /company) need
// distinct node ids; the suffix is carried down so their children stay distinct too.
function variantSuffixes(list, base) {
  const suffixes = new Map();
  for (const [i, route] of list.entries()) {
    const url = join(base, route.path);
    const twins = list.filter((r) => r.redirectTo === undefined && join(base, r.path) === url);
    if (route.redirectTo !== undefined || twins.length < 2) continue;
    const byMatcher = route.matchers.join('_');
    const unique =
      byMatcher && twins.filter((r) => r.matchers.join('_') === byMatcher).length === 1;
    suffixes.set(route, `__${unique ? byMatcher.replace(/[^a-zA-Z0-9]/g, '_') : i}`);
  }
  return suffixes;
}

function render(routes, linkedId) {
  const lines = [];
  const edges = [];

  const declared = new Set();

  function declare(id) {
    if (declared.has(id)) throw new Error(`Duplicate Mermaid node id ${id}`);
    declared.add(id);
  }

  function emit(list, base, parentId, indent, variant) {
    const suffixes = variantSuffixes(list, base);
    const idOf = (route) => nodeId(join(base, route.path)) + variant + (suffixes.get(route) ?? '');
    for (const route of list) {
      const url = join(base, route.path);
      if (route.redirectTo !== undefined) {
        const absolute = route.redirectTo.startsWith('/');
        const target =
          nodeId(join(absolute ? '' : base, route.redirectTo)) + (absolute ? '' : variant);
        edges.push(`${parentId} -->|"${escape(url)} redirects"| ${target}`);
        continue;
      }
      const id = idOf(route);
      const from = parentAmong(route, list);
      const fromId = from ? idOf(from) : parentId;

      if (route.children.length) {
        const guards = route.guards.length ? ` — ${route.guards.join(' + ')}` : '';
        declare(`sg${id}`);
        lines.push(`${indent}subgraph sg${id}["${escape(url)}${escape(guards)}"]`);
        const home = route.children.find((c) => c.path === '' && c.redirectTo === undefined);
        declare(id);
        lines.push(`${indent}  ${id}[${label(url, home?.title ?? route.title)}]`);
        emit(
          route.children.filter((c) => c !== home),
          url,
          id,
          `${indent}  `,
          id.slice(nodeId(url).length),
        );
        lines.push(`${indent}end`);
      } else {
        const guards = route.guards.length ? `<br/><i>${escape(route.guards.join(' + '))}</i>` : '';
        declare(id);
        lines.push(`${indent}${id}[${label(url, route.title).replace(/"$/, `${guards}"`)}]`);
      }
      const redirected = edges.some((e) => e.startsWith(`${fromId} -->|`) && e.endsWith(` ${id}`));
      if (!redirected) edges.push(`${fromId} --> ${id}`);
    }
  }

  emit(routes, '', 'app', '  ', '');
  const sources = [...new Set(collectSources(routes))].sort();

  return [
    '---',
    'title: Givio route map (auto-generated)',
    ...(linkedId ? [`id: ${linkedId}`] : []),
    '---',
    '%% AUTO-GENERATED by scripts/generate-route-diagram.mjs — do not edit by hand.',
    '%% Regenerated on every push to dev/main by .github/workflows/route-diagram.yaml.',
    ...sources.map((s) => `%% Source: ${s}`),
    'flowchart TD',
    '  app([App entry])',
    ...lines,
    ...edges.map((e) => `  ${e}`),
    '',
  ].join('\n');
}

function collectSources(routes) {
  return routes.flatMap((r) => [r.source, ...collectSources(r.children)]);
}

const routes = readRoutes(ENTRY, findRoutesArray(ENTRY, 'routes'));
mkdirSync(dirname(OUT), { recursive: true });
// `id:` is written by `mermaidchart link` and ties the file to its diagram on mermaid.ai;
// dropping it on regeneration would make every push create a new, unlinked diagram.
const linkedId = existsSync(OUT)
  ? readFileSync(OUT, 'utf8').match(/^---\n[\s\S]*?^id: (.+)$[\s\S]*?^---$/m)?.[1]
  : undefined;
writeFileSync(OUT, render(routes, linkedId));
console.log(`Wrote ${relative(ROOT, OUT)}`);
