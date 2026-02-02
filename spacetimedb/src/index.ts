import { schema, table, t, SenderError } from 'spacetimedb/server';
import { Hash, hashData, schemas, tojson, top, validate, expandLinksSync, fromjson, matchRef, Ref, Jsonable, server_function} from './notes';
import { runWithFuelShared } from './parser';
import { hash128 } from './hash';


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




const add_note = spacetimedb.procedure('add_note', {
  schemaHash: t.string(),
  data: t.string(),
}, t.string(), (ctx, { schemaHash, data } ) => {
  return ctx.withTx(ctx => {
    const schemaRow = ctx.db.note.hash.find(schemaHash);
    if (!schemaRow) throw new SenderError('Schema not found');

    try{
      const resolve = (ref: Ref) => {
        let note = matchRef(ref, id => ctx.db.note.id.find(BigInt(id)), hash => ctx.db.note.hash.find(hash))
        if (!note) throw new SenderError('Note not found');
        return fromjson(note.data);
      }
      const parsed = fromjson(data)
      const expandedJson = expandLinksSync(parsed, resolve);
      const expandedSchema = expandLinksSync(fromjson(schemaRow.data), resolve);
      validate(expandedJson, expandedSchema)

      const id = ctx.db.note.count();
      const hash = hashData({schemaHash: schemaHash as Hash, data: parsed})

      const existing = ctx.db.note.hash.find(hash);
      if (existing) return String(existing.id);

      ctx.db.note.insert({ id, schemaId: schemaRow.id, data, hash})

      const targets = new Set([schemaRow.id]);
      const re = /#([a-f0-9]+)/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(data))) {
        const targetId = matchRef<number | bigint | undefined>(match[1] as Ref, id=>id, hash=> ctx.db.note.hash.find(hash)?.id)
        if (targetId!==undefined) targets.add(BigInt(targetId))
      }
      for (const to of targets) {
        const existing = ctx.db.links.to.find(to);
        if (!existing) ctx.db.links.insert({ to, from: [id] });
        else if (!existing.from.some((x) => x === id)) ctx.db.links.to.update({ ...existing, from: [...existing.from, id] });
      }

      return String(id);
    }catch (e){
      throw new SenderError( "INSERT ERROR: "+fromjson(schemaRow.data))
    }
  });
});


const setup = spacetimedb.reducer('setup', {}, (ctx) => {

  try{
    ctx.db.note.insert({id: 0n, schemaId: 0n, data: tojson(top.data), hash: hashData(top)})
  }catch {}

  for (const note of schemas) {
    const id = ctx.db.note.count();
    const hash = hashData(note);
    if (ctx.db.note.hash.find(hash)) continue;
    ctx.db.note.insert({
      id,
      schemaId: 0n,
      data: tojson(note.data),
      hash
    });
  }
})

spacetimedb.init(setup)


/* this will outside of transaction allowing for fetch requests */
spacetimedb.procedure('run_note_async', {id:t.u64(), arg: t.string()}, t.string(), (ctx, {id, arg})=> {

  const getNote = (ref : Ref) => ctx.withTx(c=> matchRef(ref,id => c.db.note.id.find(BigInt(id)), hash => c.db.note.hash.find(hash)))
  const fuelRef = { value: 10000 };
  const fnSchemaId = getNote(hashData(server_function))?.id;

  const call = (ref: Ref, arg:string) => {

    const fn = getNote(ref);
    if (fn == null) throw new SenderError("fn not found")
    if (fn.schemaId != fnSchemaId) throw new SenderError("not a server function")

    const keyFor = (key: string) => `${fn.id}:${key}`;
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

  return tojson(call(Number(id), arg))

})
