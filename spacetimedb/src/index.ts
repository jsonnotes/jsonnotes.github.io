import { schema, table, t, SenderError } from 'spacetimedb/server';
import { Hash, hashData, schemas, tojson, top, validate, expandLinksSync, fromjson, matchRef, Ref} from './notes';


const JsonNotes = table(
  {
    name: 'note',
    public: true,
  },
  {
    id: t.u64().primaryKey(),
    schemaId: t.u64(),
    data: t.string(),
    hash: t.string().unique().index("btree"),
  }
);

const Links = table(
  {
    name: "links",
    public: true
  },{
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
