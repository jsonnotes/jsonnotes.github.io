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
    hash: t.u128(),
  }
);

export const spacetimedb = schema(JsonNotes);

const ajv = new Ajv();
const FNV_OFFSET_1 = 0xcbf29ce484222325n;
const FNV_OFFSET_2 = 0x84222325cbf29ce4n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;

const hash64 = (value: string, offset: bigint): bigint => {
  let hash = offset;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= BigInt(value.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash;
};

const hash128 = (schemaData: string, data: string): bigint => {
  const input = `${schemaData}\n${data}`;
  const high = hash64(input, FNV_OFFSET_1);
  const low = hash64(input, FNV_OFFSET_2);
  return (high << 64n) | low;
};



// spacetimedb.init((ctx) => {

//   try{
//     add_note(0n, '{}')
//   }catch(e){
//     console.log(e)
//   }
// });




const world = spacetimedb.reducer('world', (ctx) => {
  //  clearAllTables(ctx);
  console.log('hello world');
   // ...
});


spacetimedb.reducer('hello', (ctx) => {
   try {
      world(ctx, {})
   } catch (e) {
      // otherChanges(ctx);
      console.error('error hello world',e);

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

  const hash = hash128(schemaRow.data, data);
  for (const row of ctx.db.jsonNote.iter()) {
    if (row.hash === hash) return;
  }
  ctx.db.jsonNote.insert({ id: 0n, schemaId, data, hash });
});



