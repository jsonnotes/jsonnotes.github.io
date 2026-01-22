import { schema, table, t, SenderError } from 'spacetimedb/server';
import { Ajv } from 'ajv';

const JsonNotes = table(
  {
    name: 'json_note',
    public: true,
  },
  {
    id: t.u128().primaryKey().autoInc(),
    schemaId: t.u128(),
    data: t.string(),
  }
);

export const spacetimedb = schema(JsonNotes);

const ajv = new Ajv();


spacetimedb.init((ctx) => {
  if (!ctx.db.jsonNote.id.find(0n)) {
    ctx.db.jsonNote.insert({ id: 1n, schemaId: 1n, data: '{}' });
  }
});




spacetimedb.reducer('add_note', {
  schemaId: t.u128(),
  data: t.string(),
}, (ctx, { schemaId, data }) => {
  const schemaRow = ctx.db.jsonNote.id.find(schemaId);
  if (!schemaRow) throw new SenderError('Schema not found');

  try {
    const validate = ajv.compile(JSON.parse(schemaRow.data));
    const value = JSON.parse(data);
    if (!validate(value)) throw new SenderError(validate.errors?.map((e) => e.message).join(', ') || 'Invalid data');
  } catch (err: any) {
    if (err instanceof SenderError) throw err;
    throw new SenderError(err.message || 'Invalid JSON');
  }

  for (const row of ctx.db.jsonNote.iter()) {
    if (row.schemaId === schemaId && row.data === data) return;
  }
  ctx.db.jsonNote.insert({ id: 0n, schemaId, data });
});
