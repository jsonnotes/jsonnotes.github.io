import { schema, table, t, SenderError } from 'spacetimedb/server';
import { Ajv } from 'ajv';
import { schemas } from './schemas';
import { hash128 } from './hash';

const JsonNotes = table(
  {
    name: 'note',
    public: true,
  },
  {
    id: t.u128().primaryKey(),
    schemaId: t.u128(),
    data: t.string(),
    hash: t.u128().unique(),
  }
);

export const spacetimedb = schema(JsonNotes);

const ajv = new Ajv();


const add_note = spacetimedb.reducer('add_note', {
  schemaId: t.u128(),
  data: t.string(),
}, (ctx, { schemaId, data }) => {


  const hash = hash128(String(schemaId), data);
  if (ctx.db.note.hash.find(hash)) return;

  if (schemaId !== 0n) {
    const schemaRow = ctx.db.note.id.find(schemaId);
    if (!schemaRow) throw new SenderError('Schema not found');
    try {
      const validate = ajv.compile(JSON.parse(schemaRow.data));
      const value = JSON.parse(data);
      if (!validate(value)) throw new SenderError(validate.errors?.map((e) => e.message).join(', ') || 'Invalid data');
    } catch (err: any) {
      if (err instanceof SenderError) throw err;
      throw new SenderError(err.message || 'Invalid JSON');
    }
  }

  let id = ctx.db.note.count();
  ctx.db.note.insert({ id, schemaId, data, hash });
});


spacetimedb.init((ctx)=>{
  for (const schema of schemas) {
    add_note(ctx, {schemaId: 0n, data: JSON.stringify(schema, undefined, 2 )})
  }
})
