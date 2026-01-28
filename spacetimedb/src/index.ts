import { schema, table, t, SenderError } from 'spacetimedb/server';
import { Hash, hashData, NoteData, schemas, top, validate } from './schemas';
import { expandLinksSync } from './expand_links';

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
  let expandedJson: any;
  let expandedSchema: any;
  try {
    const parsed = JSON.parse(data);
    const resolve = (ref: string) => {
      const row = /^\d+$/.test(ref)
        ? ctx.db.note.id.find(BigInt(ref))
        : ctx.db.note.hash.find(ref);
      if (!row) throw new SenderError(`ref not found: #${ref}`);
      return JSON.parse(row.data);
    };
    expandedJson = expandLinksSync(parsed, resolve);
    expandedSchema = expandLinksSync(JSON.parse(schemaRow.data), resolve);
  } catch (e: any) {
    throw new SenderError(e.message || "Invalid JSON");
  }
  validate(JSON.stringify(expandedJson), JSON.stringify(expandedSchema))
  let id = ctx.db.note.count();

  const hash = hashData({schemaHash: schemaHash as Hash, data})
  if (ctx.db.note.hash.find(hash)) return;
  ctx.db.note.insert({ id, schemaId: schemaRow.id, data, hash})

});


const setup = spacetimedb.reducer('setup', {}, (ctx) => {
  try{
    ctx.db.note.insert({id: 0n, schemaId: 0n, data: top.data, hash:  hashData(top)})
  }catch {}
  for (const note of schemas) add_note(ctx, note)
})

spacetimedb.init(setup)
// spacetimedb.procedure("eval", t.string(), (c)=>"ok" )
