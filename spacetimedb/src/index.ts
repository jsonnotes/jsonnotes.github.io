import { schema, table, t, SenderError } from 'spacetimedb/server';
import { Hash, hashData, schemas, tojson, top, validate, expandLinksSync, fromjson, Ref, server_function, normalizeRef } from './notes';
import { runWithFuelShared } from './parser';
import { hash128 } from './hash';


const JsonNotes = table(
  {
    name: 'note',
    public: true,
  }, {
    hash: t.string().primaryKey(),
    schemaHash: t.string(),
    data: t.string(),
  }
);

const Store = table(
  {
    name: 'store',
    public: false,
  }, {
    key: t.string().primaryKey(),
    value: t.string()
  }
)

const Links = table(
  {
    name: "links",
    public: true
  }, {
    to: t.string().primaryKey(),
    from: t.array(t.string()),
  }
)

export const spacetimedb = schema(JsonNotes, Links, Store);

spacetimedb.view({ name: 'note_count', public: true }, t.array(t.object('NoteCountRow', { count: t.u64() })),
  (ctx) => [{ count: ctx.db.note.count() }]
);




const add_note = spacetimedb.procedure('add_note', {
  schemaHash: t.string(),
  data: t.string(),
}, t.string(), (ctx, { schemaHash, data } ) => {
  return ctx.withTx(ctx => {
    const schemaRow = ctx.db.note.hash.find(schemaHash);
    if (!schemaRow) throw new SenderError('Schema not found');

    try{
      const resolve = (ref: Ref) => {
        const note = ctx.db.note.hash.find(normalizeRef(ref));
        if (!note) throw new SenderError('Note not found');
        return fromjson(note.data);
      }
      const parsed = fromjson(data)
      const expandedJson = expandLinksSync(parsed, resolve);
      const expandedSchema = expandLinksSync(fromjson(schemaRow.data), resolve);
      validate(expandedJson, expandedSchema)

      const hash = hashData({schemaHash: schemaHash as Hash, data: parsed})

      const existing = ctx.db.note.hash.find(hash);
      if (existing) return String(existing.hash);

      ctx.db.note.insert({ hash, schemaHash, data })

      const targets = new Set<string>([schemaRow.hash]);
      const re = /#([a-f0-9]{32})/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(data))) {
        targets.add(match[1]);
      }
      for (const to of targets) {
        const existing = ctx.db.links.to.find(to);
        if (!existing) ctx.db.links.insert({ to, from: [hash] });
        else if (!existing.from.some((x) => x === hash)) ctx.db.links.to.update({ ...existing, from: [...existing.from, hash] });
      }

      return String(hash);
    }catch (e){
      throw new SenderError( "INSERT ERROR: "+fromjson(schemaRow.data))
    }
  });
});


const setup = spacetimedb.reducer('setup', {}, (ctx) => {

  try{
    ctx.db.note.insert({ hash: hashData(top), schemaHash: top.schemaHash, data: tojson(top.data) })
  }catch {}

  for (const note of schemas) {
    const hash = hashData(note);
    if (ctx.db.note.hash.find(hash)) continue;
    ctx.db.note.insert({
      hash,
      schemaHash: note.schemaHash,
      data: tojson(note.data),
    });
  }
})

spacetimedb.init(setup)

// Simple reducer for migration - no validation, no return value
spacetimedb.reducer('import_note', { schemaHash: t.string(), data: t.string() }, (ctx, { schemaHash, data }) => {
  const schemaRow = ctx.db.note.hash.find(schemaHash);
  if (!schemaRow) throw new SenderError('Schema not found: ' + schemaHash);

  const parsed = fromjson(data);
  const hash = hashData({ schemaHash: schemaHash as Hash, data: parsed });

  if (ctx.db.note.hash.find(hash)) return; // already exists

  ctx.db.note.insert({ hash, schemaHash, data });
})


/* this will outside of transaction allowing for fetch requests */
spacetimedb.procedure('run_note_async', {hash: t.string(), arg: t.string()}, t.string(), (ctx, {hash, arg})=> {

  const getNote = (ref : Ref) => ctx.withTx(c=> c.db.note.hash.find(normalizeRef(ref)))
  const fuelRef = { value: 10000 };
  const fnSchemaHash = hashData(server_function);

  const call = (ref: Ref, arg:string) => {

    const fn = getNote(ref);
    if (fn == null) throw new SenderError("fn not found")
    if (fn.schemaHash != fnSchemaHash) throw new SenderError("not a server function")

    const keyFor = (key: string) => `${fn.hash}:${key}`;
    const storage = {
      getItem: (key: string) => ctx.withTx(ctx => ctx.db.store.key.find(keyFor(key))?.value ?? null),
      setItem: (key: string, value: string) => ctx.withTx(ctx => {
        const k = keyFor(key);
        if (ctx.db.store.key.find(k)) ctx.db.store.key.update({ key: k, value });
        else ctx.db.store.insert({ key: k, value });
      })
    };

    let ret = runWithFuelShared(`let args = ${arg}; ${(fromjson(fn.data) as {code: string}).code}`, fuelRef, {storage, call, hash: hash128})
    if ("err" in ret) throw new SenderError(String(ret.err));
    return (ret as any).ok;
  }

  return tojson(call(hash as Hash, arg))

})
