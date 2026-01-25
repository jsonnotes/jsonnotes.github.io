import { schema, table, t, SenderError } from 'spacetimedb/server';
import { Ajv } from 'ajv';
import { Hash, hashData, NoteData, schemas, top } from './schemas';

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

const ajv = new Ajv();

const add_note = spacetimedb.reducer('add_note', {
  schemaHash: t.string(),
  data: t.string(),
}, (ctx, { schemaHash, data } ) => {


  const schemaRow = ctx.db.note.hash.find(schemaHash);
  if (!schemaRow) throw new SenderError('Schema not found');

  const validate = ajv.compile(JSON.parse(schemaRow.data));
  if (!validate(JSON.parse(data))) throw new SenderError(validate.errors?.map((e) => e.message).join(', ') || 'Invalid data');
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
spacetimedb.procedure("eval", t.string(), (c)=>"ok" )
