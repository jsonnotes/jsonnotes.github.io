import { schema, table, t, SenderError } from 'spacetimedb/server';
import { hashData, schemas, tojson, top, validate, expandLinksSync, fromjson, hashCall, function_schema } from './notes';
import type { Hash, Jsonable } from './notes';
import { runWithFuelShared } from './parser';
import { hash128 } from './hash';

const HashT = t.string()

const JsonNotes = table(
  {
    name: 'note',
    public: true,
  }, {
    hash: HashT.primaryKey(),
    schemaHash: HashT,
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
    to: HashT.primaryKey(),
    from: t.array(HashT),
  }
)



export const spacetimedb = schema(JsonNotes, Links, Store);

spacetimedb.view({ name: 'note_count', public: true }, t.array(t.object('NoteCountRow', { count: t.u64() })),
  (ctx) => [{ count: ctx.db.note.count() }]
);


spacetimedb.reducer('add_note', {
  schemaHash: t.string(),
  data: t.string(),
}, (ctx, { schemaHash, data } ) => {

  if (!schemaHash) schemaHash = hashData(top);
  const schemaRow = ctx.db.note.hash.find(schemaHash);
  if (!schemaRow) throw new SenderError('Schema not found');
  const schemaData = fromjson(schemaRow.data)

  try{
    const resolve = (hash: Hash) => {
      const note = ctx.db.note.hash.find(hash);
      if (!note) throw new SenderError('Note not found');
      return fromjson(note.data);
    }
    const parsed = fromjson(data)
    validate(expandLinksSync(parsed, resolve), expandLinksSync(schemaData, resolve))

    const hash = hashData({schemaHash: schemaHash as Hash, data: parsed})
    if (ctx.db.note.hash.find(hash)) return;
    ctx.db.note.insert({ hash, schemaHash, data})

    const targets = new Set<string>([schemaHash]);
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

    return;
  }catch (e){
    throw new SenderError( "INSERT ERROR: "+ String(e))
  }
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

spacetimedb.procedure('search_note', {query: t.string()}, t.array(t.object(
  "search_result",
  {
    title: t.string(),
    count: t.number(),
    hash: t.string()
  }
)), (ctx, {query})=> {
  return ctx.withTx(ctx=>{
    let reps = []
    for (let note of ctx.db.note.iter()){
      let dat = fromjson(note.data)
      if (typeof dat == "object" && "title" in dat && typeof dat.title == "string" && dat.title.startsWith(query)){
        let links = ctx.db.links.to.find(note.hash)
        reps.push({title: dat.title, count: links ? links.from.length : 0, hash: note.hash})
        if (reps.length >= 100) return reps
      }
    }
    return reps
  })!
})


spacetimedb.procedure('call_note', {fn: t.string(), arg: t.string()}, t.string(), (ctx, {fn, arg})=> {

  const fuelRef = { value: 10000 };
  const fnSchemaHash = hashData(function_schema);

  const call = (hash: string, arg:string) => {
    let x = hash == "e";
    const clean = (hash.startsWith("#") ? hash.slice(1) : hash) as Hash;
    const fn = ctx.withTx(c=> c.db.note.hash.find(clean))
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

    let {code, args, returnSchema} = fromjson(fn.data) as {code: string, args: {[key: string]: Jsonable}, returnSchema: Jsonable};
    console.log(tojson(args))
    let data = fromjson(arg) as {[key: string]: Jsonable};
    code = Object.keys(args).map(k=>`let ${k} = ${tojson(data[k])}`).join(";\n") + code;
    console.log(code)
    let ret = runWithFuelShared(code, fuelRef, {storage, call, hash: hash128})
    if ("err" in ret) throw new SenderError(String(ret.err));
    return (ret as any).ok;
  }

  return tojson(call(fn, arg))

})
