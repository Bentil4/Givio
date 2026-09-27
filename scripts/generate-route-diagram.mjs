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

function readRoutes(file, array) {
  const routes = [];
  for (const el of array.elements) {
    if (ts.isSpreadElement(el) && ts.isIdentifier(el.expression)) {
      const name = el.expression.text;
      const target = resolveImport(file, name) ?? file;
      const nested = findRoutesArray(target, name);
      if (nested) routes.push(...readRoutes(target, nested));
      continue;
    }
    if (!ts.isObjectLiteralExpression(el)) continue;
    const children = prop(el, 'children');
    routes.push({
      path: stringProp(el, 'path') ?? '',
      title: stringProp(el, 'title'),
      redirectTo: stringProp(el, 'redirectTo'),
      guards: [...new Set([...guardList(el, 'canActivate'), ...guardList(el, 'canMatch')])],
      source: relative(ROOT, file),
      children: children && ts.isArrayLiteralExpression(children) ? readRoutes(file, children) : [],
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
// (events -> events/:id), so the diagram reads as navigation, not a flat list.
function parentAmong(route, siblings) {
  const segments = route.path.split('/');
  for (let n = segments.length - 1; n > 0; n--) {
    const prefix = segments.slice(0, n).join('/');
    const match = siblings.find((s) => s.path === prefix && !s.redirectTo);
    if (match) return match;
  }
  return null;
}

function render(routes, linkedId) {
  const lines = [];
  const edges = [];

  function emit(list, base, parentId, indent) {
    for (const route of list) {
      const url = join(base, route.path);
      if (route.redirectTo) {
        edges.push(
          `${parentId} -->|"${escape(url)} redirects"| ${nodeId(join('', route.redirectTo))}`,
        );
        continue;
      }
      const id = nodeId(url);
      const from = parentAmong(route, list);
      const fromId = from ? nodeId(join(base, from.path)) : parentId;

      if (route.children.length) {
        const guards = route.guards.length ? ` — ${route.guards.join(' + ')}` : '';
        lines.push(`${indent}subgraph sg${id}["${escape(url)}${escape(guards)}"]`);
        const home = route.children.find((c) => c.path === '');
        lines.push(`${indent}  ${id}[${label(url, home?.title ?? route.title)}]`);
        emit(
          route.children.filter((c) => c !== home),
          url,
          id,
          `${indent}  `,
        );
        lines.push(`${indent}end`);
      } else {
        const guards = route.guards.length ? `<br/><i>${escape(route.guards.join(' + '))}</i>` : '';
        lines.push(`${indent}${id}[${label(url, route.title).replace(/"$/, `${guards}"`)}]`);
      }
      const redirected = edges.some((e) => e.startsWith(`${fromId} -->|`) && e.endsWith(` ${id}`));
      if (!redirected) edges.push(`${fromId} --> ${id}`);
    }
  }

  emit(routes, '', 'app', '  ');
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
