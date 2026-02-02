import { schema, table, t, SenderError } from 'spacetimedb/server';
import { Hash, hashData, schemas, tojson, top, validate, expandLinksSync, fromjson, matchRef, Ref, function_schema, Jsonable, server_function} from './notes';
import { runWithFuelShared } from './parser';


const JsonNotes = table(
  {
    name: 'note',
    public: true,
  }, {
    id: t.u64().primaryKey(),
    schemaId: t.u64(),
    data: t.string(),
    hash: t.string().unique().index("btree"),
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
    to: t.u64().primaryKey(),
    from: t.array(t.u64()),
  }
)

export const spacetimedb = schema(JsonNotes, Links, Store);

spacetimedb.view({ name: 'note_count', public: true }, t.array(t.object('NoteCountRow', { count: t.u64() })),
  (ctx) => [{ count: ctx.db.note.count() }]
);

const add_note = spacetimedb.reducer('add_note', {
  schemaHash: t.string(),
  data: t.string(),
}, (ctx, { schemaHash, data } ) => {
  const schemaRow = ctx.db.note.hash.find(schemaHash);
  if (!schemaRow) throw new SenderError('Schema not found');


  try{

    const resolve = (ref: string) => {
      const row = /^\d+$/.test(ref)
        ? ctx.db.note.id.find(BigInt(ref))
        : ctx.db.note.hash.find(ref);
      if (!row) throw new SenderError(`ref not found: #${ref}`);
      return JSON.parse(row.data);
    };
    const parsed = fromjson(data)
    const expandedJson = expandLinksSync(parsed, resolve);
    const expandedSchema = expandLinksSync(fromjson(schemaRow.data), resolve);
    validate(expandedJson, expandedSchema)

    const id = ctx.db.note.count();
    const hash = hashData({schemaHash: schemaHash as Hash, data: parsed})

    if (ctx.db.note.hash.find(hash)) return;
    ctx.db.note.insert({ id, schemaId: schemaRow.id, data, hash})

    const targets = new Set([schemaRow.id]);
    const re = /#([a-f0-9]+)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(data))) {
      const id = matchRef<number | bigint | undefined>(match[1] as Ref, id=>id, hash=> ctx.db.note.hash.find(hash)?.id)
      if (id!==undefined) targets.add(BigInt(id))
    }
    for (const to of targets) {
      const existing = ctx.db.links.to.find(to);
      if (!existing) ctx.db.links.insert({ to, from: [id] });
      else if (!existing.from.some((x) => x === id)) ctx.db.links.to.update({ ...existing, from: [...existing.from, id] });
    }
  }catch (e){
    throw new SenderError( "INSERT ERROR: "+fromjson(schemaRow.data))
  }

});


const setup = spacetimedb.reducer('setup', {}, (ctx) => {
  try{
    ctx.db.note.insert({id: 0n, schemaId: 0n, data: tojson(top.data), hash: hashData(top)})
  }catch {}
  for (const note of schemas) add_note(ctx, {schemaHash: note.schemaHash, data: tojson(note.data)})
})

spacetimedb.init(setup)

spacetimedb.procedure('run_note_v2', {id:t.u64(), arg: t.string()}, t.string(), (ctx, {id, arg})=> ctx.withTx((ctx=>{

  const fuelRef = { value: 10000 };
  const keyFor = (key: string) => `${id}:${key}`;
  const storage = {
    getItem : (key:string)=> ctx.db.store.key.find(keyFor(key))?.value ?? null,
    setItem : (key:string, value: string) => {
      const k = keyFor(key);
      const existing = ctx.db.store.key.find(k);
      if (existing) ctx.db.store.key.update({ key: k, value });
      else ctx.db.store.insert({ key: k, value });
    }
  }

  const call = (ref: Ref, ...args: Jsonable[]) => {
    const idOrHash = ref.toString().replace(/^#/, "");
    const target = /^\d+$/.test(idOrHash)
      ? ctx.db.note.id.find(BigInt(idOrHash))
      : ctx.db.note.hash.find(idOrHash);
    if (!target) throw new SenderError("function not found");
    const fnSchemaRow = ctx.db.note.hash.find(hashData(server_function));
    if (target.schemaId !== fnSchemaRow?.id) throw new SenderError("note is not function schema");
    const data = fromjson(target.data) as {inputs: string[], code: string};
    const argsLiteral = JSON.stringify(args);
    const src = `let [${data.inputs.join(",")}] = ${argsLiteral}; ${data.code}`;
    const res = runWithFuelShared(src, fuelRef, { storage, call });
    if ("err" in res) throw new SenderError(String(res.err));
    return (res as any).ok;
  };
  
  const fnNote = ctx.db.note.id.find(id);
  if (!fnNote) throw new SenderError("note not found (v2)");
  const fnSchemaRow = ctx.db.note.hash.find(hashData(server_function));
  if (fnNote.schemaId !== fnSchemaRow?.id) throw new SenderError("note is not function schema");
  const data = fromjson(fnNote.data) as {inputs: string[], code: string};
  const res = runWithFuelShared(`let [${data.inputs.join(",")}] = ${arg}; ${data.code}`, fuelRef, { storage, call });
  return tojson(res as Jsonable);
})))
