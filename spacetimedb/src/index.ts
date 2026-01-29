import { schema, table, t, SenderError } from 'spacetimedb/server';
import { Hash, hashData, schemas, tojson, top, validate, expandLinksSync, fromjson} from './schemas';


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

export const spacetimedb = schema(JsonNotes);

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

    let id = ctx.db.note.count();

    const hash = hashData({schemaHash: schemaHash as Hash, data: parsed})


    if (ctx.db.note.hash.find(hash)) return;
    ctx.db.note.insert({ id, schemaId: schemaRow.id, data, hash})
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
