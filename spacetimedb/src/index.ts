import { schema, table, t, SenderError } from 'spacetimedb/server';
import { Hash, hashData, schemas, tojson, top, validate, expandLinksSync, fromjson, matchRef, Ref, function_schema, Jsonable} from './notes';
import { runWithFuel } from './parser';


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

export const spacetimedb = schema(JsonNotes, Links);

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

spacetimedb.procedure('run_note', {id:t.u64(), arg: t.string()}, t.string(), (ctx, {id, arg})=> ctx.withTx((ctx=>{
    // const note = ctx.db.note.id.find(id);
    // if (!note) throw new SenderError("note not found");
    // const fnSchemaRow = ctx.db.note.hash.find(hashData(function_schema));
    // if (!fnSchemaRow) throw new SenderError("function schema not found");
    // if (note.schemaId !== fnSchemaRow.id) throw new SenderError("note is not function schema");
  
    // const data = fromjson(note.data) as any;
    // const inputs = Array.isArray(data.inputs) ? data.inputs.map(String) : [];
    // const code = String(data.code ?? "");
    // const parsedArg = fromjson(arg);
    // const args = Array.isArray(parsedArg) ? parsedArg : [parsedArg];
    // const argsLiteral = args.map((a) => JSON.stringify(a)).join(", ");
    // const src = `const __fn = (${inputs.join(",")}) => { ${code} }; return __fn(${argsLiteral});`;
    // const res = runWithFuel(src, 10000);
    // if ("err" in res) return tojson({ err: String(res.err), fuel: res.fuel });
    // return tojson(res as Jsonable);


    const fnNote = ctx.db.note.id.find(id);
    if (!fnNote) throw new SenderError("note not found");
    const fnSchemaRow = ctx.db.note.hash.find(hashData(function_schema));
    if (fnNote.schemaId !== fnSchemaRow?.schemaId) throw new SenderError("note is not function schema");
    const data = fromjson(fnNote.data) as {inputs: string[], code: string};
    return tojson(runWithFuel(`let [${data.inputs.join(",")}] = ${arg}; ${data.code}}`, 10000) as Jsonable);
  })))
