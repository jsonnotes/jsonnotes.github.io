import { schema, table, t, SenderError } from 'spacetimedb/server';
import { Ajv } from 'ajv';
import { hashData, schemas } from './schemas';
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

  const schemaRow = ctx.db.note.id.find(schemaId);
  if (!schemaRow) throw new SenderError('Schema not found');

  const validate = ajv.compile(JSON.parse(schemaRow.data));
  if (!validate(JSON.parse(data))) throw new SenderError(validate.errors?.map((e) => e.message).join(', ') || 'Invalid data');
  let id = ctx.db.note.count();

  const hash = hashData(data, schemaRow.hash);
  ctx.db.note.insert({ id, schemaId, data, hash})

});


const setup = spacetimedb.reducer('setup', {}, (ctx) => {
  ctx.db.note.insert({id: 0n, schemaId: 0n, data: "{}", hash:  hashData("{}", 0n)})
  for (const schema of schemas) {
    add_note(ctx, {schemaId: 0n, data: JSON.stringify(schema, undefined, 2 )})
  }
})

spacetimedb.init(setup)
