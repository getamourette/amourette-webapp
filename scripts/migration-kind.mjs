// Classifies a migration by what it does to the code already live (#434).
// For a minute or two after a merge the previous code runs on the new schema,
// and browser tabs opened earlier keep running it for longer.
//
//   1 additive   creates new objects only; the live code cannot notice.
//   2 behaviour  changes how an existing object behaves and removes nothing;
//                may ship with its code once the live code is proven on the
//                new schema.
//   3 removal    drops, renames or retypes something the live code may use,
//                or is not recognised. Ships alone, after the code stopped
//                using the object.
//
// Conservative on purpose: a statement that matches no rule is kind 3.
export const ADDITIVE = 1, BEHAVIOUR = 2, REMOVAL = 3;
export const KIND_NAMES = { [ADDITIVE]: 'additive', [BEHAVIOUR]: 'behaviour', [REMOVAL]: 'removal' };

// Splits on top-level semicolons and drops comments. Quoted text, dollar-quoted
// bodies and quoted identifiers are kept whole.
export function splitStatements(sql) {
  const statements = [];
  let current = '';
  for (let index = 0; index < sql.length;) {
    const rest = sql.slice(index);
    let match;
    if (rest.startsWith('--')) {
      index += (rest.indexOf('\n') + 1) || rest.length;
      current += ' ';
    } else if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/');
      index += end < 0 ? rest.length : end + 2;
      current += ' ';
    } else if ((match = /^\$[A-Za-z_]*\$/.exec(rest))) {
      const end = rest.indexOf(match[0], match[0].length);
      const length = end < 0 ? rest.length : end + match[0].length;
      current += rest.slice(0, length);
      index += length;
    } else if ((match = /^'(?:[^']|'')*'/.exec(rest)) || (match = /^"(?:[^"]|"")*"/.exec(rest))) {
      current += match[0];
      index += match[0].length;
    } else if (rest[0] === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      index += 1;
    } else {
      current += rest[0];
      index += 1;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

// `public.` is the default schema and quotes do not change these identifiers.
const name = text => text.replace(/"/g, '').toLowerCase().replace(/^public\./, '');
const flat = statement => statement.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, '$$body$$').replace(/'(?:[^']|'')*'/g, "''").replace(/\s+/g, ' ').trim().toLowerCase();
const IDENT = '((?:"[^"]+"|[a-z_][\\w$]*)(?:\\.(?:"[^"]+"|[a-z_][\\w$]*))?)';
const pattern = source => new RegExp(source.replace(/NAME/g, IDENT), 'i');

// Text between the parenthesis at `open` and its match.
function parenthesised(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')' && (depth -= 1) === 0) return text.slice(open + 1, index);
  }
  return null;
}
const topLevelParts = text => {
  const parts = [];
  let depth = 0, current = '';
  for (const char of text) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) { parts.push(current.trim()); current = ''; } else current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};
// Argument modes, names and defaults do not select an overload; types do, but
// names are kept too so a renamed argument (a changed RPC contract) differs.
const signature = args => topLevelParts(args ?? '').map(arg => arg.replace(/\s+default\s[\s\S]*$/i, '').replace(/\s*=[\s\S]*$/, '').replace(/\s+/g, ' ').trim().toLowerCase()).join(',');

// `p_venue uuid` -> `uuid`. A lone token is already a type.
const typesOf = full => full.split(',').map(arg => arg.replace(/^(?:in|out|inout|variadic) /, '').replace(/^\S+ (?=\S)/, '')).join(',');

// Every function signature defined by the given SQL, keyed by function name.
export function functionSignatures(sql) {
  const found = new Map();
  for (const statement of splitStatements(sql)) {
    const text = flat(statement);
    const match = pattern('^create (?:or replace )?function NAME ?\\(').exec(text);
    if (!match) continue;
    const key = name(match[1]);
    found.set(key, (found.get(key) ?? new Set()).add(signature(parenthesised(text, match[0].length - 1))));
  }
  return found;
}

const CREATE_OBJECT = '^create (?:unlogged )?(?:table|type|schema|sequence|(?:materialized )?view)(?: if not exists)? NAME';

// Every table, view, type, schema and sequence the given SQL creates. One
// dropped since still counts: treating it as existing is the cautious reading.
export function objectNames(sql) {
  const found = new Set();
  for (const statement of splitStatements(sql)) {
    const match = pattern(CREATE_OBJECT).exec(flat(statement));
    if (match) found.add(name(match[1]));
  }
  return found;
}

// `earlier` is the SQL of every migration already in main, concatenated.
export function classifyMigration(sql, earlier = '') {
  const known = functionSignatures(earlier);
  const existing = objectNames(earlier);
  const created = new Set();
  const dropped = new Map();
  const constraints = new Set();
  const findings = [];
  const add = (kind, statement, reason, object) => findings.push({ kind, reason, object, statement: statement.slice(0, 120) });
  const own = (object, statement, changed) => created.has(name(object))
    ? add(ADDITIVE, statement, 'on an object this migration creates')
    : add(BEHAVIOUR, statement, changed);

  for (const statement of splitStatements(sql)) {
    const text = flat(statement);
    let match;
    const is = source => (match = pattern(source).exec(text));
    if (is('^(?:begin|commit|set |reset |notify |comment on )') || is('^select pg_notify')) {
      add(ADDITIVE, text, 'no schema effect');
    } else if (is(CREATE_OBJECT) || is('^create extension(?: if not exists)? NAME')) {
      // `if not exists` on an object an earlier migration created is a no-op,
      // and what follows then alters an existing object, not a new one.
      if (existing.has(name(match[1]))) add(ADDITIVE, text, 'already exists: no effect');
      else {
        created.add(name(match[1]));
        add(ADDITIVE, text, 'new object');
      }
    } else if (is('^create (unique )?index (?:concurrently )?(?:if not exists )?(?:NAME )?on (?:only )?NAME')) {
      const table = match[3];
      if (created.has(name(table)) || !match[1]) add(ADDITIVE, text, 'new index');
      else add(BEHAVIOUR, text, 'a unique index can refuse writes the live code makes');
    } else if (is('^create (or replace )?function NAME ?\\(')) {
      const key = name(match[2]);
      const args = signature(parenthesised(text, match[0].length - 1));
      const before = known.get(key);
      const reinstated = dropped.get(key);
      if (!before && !reinstated) {
        created.add(key);
        add(ADDITIVE, text, 'new function');
      } else if (before?.has(args) || reinstated?.has(args)) {
        add(BEHAVIOUR, text, 'replaces an existing function with the same arguments');
      } else {
        add(REMOVAL, text, 'changes the arguments of an existing function: add a new name instead', key);
      }
      known.set(key, (known.get(key) ?? new Set()).add(args));
    } else if (is('^drop function (?:if exists )?NAME ?(\\()?')) {
      const key = name(match[1]);
      const before = known.get(key);
      const listed = match[2] ? parenthesised(text, match[0].length - 1) : null;
      // The statement lists types, with or without names; a definition has both.
      const gone = !before ? [] : listed === null ? [...before]
        : [...before].filter(item => [signature(listed), typesOf(signature(listed))].some(wanted => wanted === item || wanted === typesOf(item)));
      for (const item of gone) before.delete(item);
      dropped.set(key, new Set([...(dropped.get(key) ?? []), ...gone]));
      // Settled after the last statement: recreated with the same arguments is
      // a replacement. A function with that name but no matching overload is
      // left as a removal.
      findings.push({ kind: REMOVAL, reason: 'drops a function', object: key, statement: text.slice(0, 120), droppedFunction: { key, gone, existed: Boolean(before) } });
    } else if (is('^create (?:or replace )?(?:constraint )?trigger NAME [\\s\\S]*? on NAME')) {
      own(match[2], text, 'adds a trigger to an existing table');
    } else if (is('^create policy (?:"[^"]+"|\\S+) on NAME') || is('^alter policy (?:"[^"]+"|\\S+) on NAME')) {
      own(match[1], text, 'changes row access on an existing table');
    } else if (is('^drop (?:policy|trigger) (?:if exists )?(?:"[^"]+"|\\S+) on NAME')) {
      // Application code never names a policy or a trigger.
      own(match[1], text, 'removes a policy or trigger of an existing table');
    } else if (is('^drop index ')) {
      add(BEHAVIOUR, text, 'removes an index');
    } else if (is('^(?:grant|revoke) [\\s\\S]*? on (?:table |function |schema |sequence |type |all \\w+ in schema )?NAME')) {
      own(match[1], text, 'changes privileges on an existing object');
    } else if (is('^alter default privileges ')) {
      add(BEHAVIOUR, text, 'changes default privileges');
    } else if (is('^alter function NAME')) {
      if (/ rename to | set schema /.test(text)) add(REMOVAL, text, 'renames a function', name(match[1]));
      else own(match[1], text, 'changes a function setting');
    } else if (is('^alter table (?:if exists )?(?:only )?NAME (.*)$')) {
      const table = match[1];
      for (const action of topLevelParts(match[2])) alterTable(table, action, text);
    } else if (is('^do ')) {
      // The body is opaque: one that can drop, rename or build its own SQL is
      // not recognised.
      if (/\b(drop|rename|truncate|execute)\b|\balter\b[\s\S]*?\btype\b/i.test(statement)) add(REMOVAL, text, 'a DO block that may drop, rename or run dynamic SQL');
      else add(BEHAVIOUR, text, 'changes data');
    } else if (is('^(?:insert into|update|delete from|truncate|with|select|lock table) ')) {
      add(BEHAVIOUR, text, 'changes data or a scheduled job');
    } else if (is('^alter publication ')) {
      add(BEHAVIOUR, text, 'changes what Realtime publishes');
    } else if (is('^drop (table|view|materialized view|type|schema|sequence|extension) (?:if exists )?NAME')) {
      add(REMOVAL, text, `drops a ${match[1]}`, name(match[2]));
    } else {
      add(REMOVAL, text, 'not recognised as additive or as a behaviour change');
    }
  }

  function alterTable(table, action, text) {
    let match;
    const is = source => (match = pattern(source).exec(action));
    if (created.has(name(table))) add(ADDITIVE, text, 'on a table this migration creates');
    else if (is('^add (?:unique|check|primary key|foreign key|exclude)\\b')) add(BEHAVIOUR, text, 'a constraint can refuse writes the live code makes');
    else if (is('^add (?:column )?(?:if not exists )?(?!constraint )NAME ')) {
      if (/ not null/.test(action) && !/ default /.test(action)) add(BEHAVIOUR, text, 'a required column without a default refuses the inserts the live code makes');
      else add(ADDITIVE, text, 'new column');
    } else if (is('^(?:enable|force|disable|no force) row level security') || is('^(?:enable|disable) trigger')) add(BEHAVIOUR, text, 'changes row access or triggers on an existing table');
    else if (is('^add constraint NAME') || is('^validate constraint NAME')) {
      constraints.add(`${name(table)}.${name(match[1])}`);
      add(BEHAVIOUR, text, 'a constraint can refuse writes the live code makes');
    }
    else if (is('^alter (?:column )?NAME (?:set|drop) (?:default|not null)')) add(BEHAVIOUR, text, 'changes a default or a required column');
    else if (is('^alter (?:column )?NAME (?:set data )?type ')) add(REMOVAL, text, 'changes a column type', name(match[1]));
    else if (is('^drop (?:column )?(?:if exists )?(?!constraint )NAME')) add(REMOVAL, text, 'drops a column', name(match[1]));
    else if (is('^drop constraint (?:if exists )?NAME')) findings.push({ kind: REMOVAL, reason: 'drops a constraint the code may match by name', object: name(match[1]), statement: text.slice(0, 120), droppedConstraint: `${name(table)}.${name(match[1])}` });
    else if (is('^rename (?:column )?NAME to ')) add(REMOVAL, text, 'renames a column', name(match[1]));
    else if (is('^rename to ')) add(REMOVAL, text, 'renames a table', name(table));
    else if (is('^owner to ') || is('^replica identity ') || is('^set \\(')) add(BEHAVIOUR, text, 'changes a table setting');
    else add(REMOVAL, text, 'not recognised as additive or as a behaviour change');
  }

  // A function dropped and created again with the same arguments still answers
  // the live code: its return shape is what the live-code run verifies.
  for (const finding of findings) {
    if (finding.droppedConstraint) {
      // Replaced under the same name: the code that matches it still does.
      if (constraints.has(finding.droppedConstraint)) Object.assign(finding, { kind: BEHAVIOUR, reason: 'replaces a constraint under the same name', object: undefined });
      delete finding.droppedConstraint;
    }
    if (!finding.droppedFunction) continue;
    const { key, gone, existed } = finding.droppedFunction;
    const now = known.get(key);
    if (!existed) Object.assign(finding, { kind: ADDITIVE, reason: 'drops a function that does not exist yet', object: undefined });
    else if (gone.length && gone.every(item => now?.has(item))) Object.assign(finding, { kind: BEHAVIOUR, reason: 'drops and recreates a function with the same arguments', object: undefined });
    delete finding.droppedFunction;
  }

  const kind = findings.reduce((highest, finding) => Math.max(highest, finding.kind), ADDITIVE);
  return { kind, findings, removed: [...new Set(findings.filter(finding => finding.kind === REMOVAL && finding.object).map(finding => finding.object))] };
}
