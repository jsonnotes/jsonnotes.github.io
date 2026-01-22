import { schema, table, t, SenderError} from 'spacetimedb/server';
import {Ajv} from 'ajv';


const LLM_Results = table(
  {
    name: 'llm_result',
    public: true
  },
  {
    id: t.u128().autoInc().primaryKey(),
    prompt: t.string(),
    schema: t.string(),
    response: t.string(),
    provider: t.string(),
    model: t.string(),
  }
)


export const spacetimedb = schema(LLM_Results)


spacetimedb.reducer('add_call', {
  prompt: t.string(),
  schema: t.string(),
  response: t.string(),
  provider: t.string(),
  model: t.string(),
}, (ctx, { prompt, schema, response, provider, model }) => {

  try{

    const ajv = new Ajv();
    const validate = ajv.compile(JSON.parse(schema));
    const valid = validate(JSON.parse(response));
    if (!valid) {
      console.error("ERROR posting to database: ", validate.errors);  
      throw new SenderError(validate.errors ? validate.errors.map(e=>e.message).join(', ') : 'Invalid response');
    }
  }catch(e: any){
    throw new SenderError(e.message || 'JSON parsing error');
  }

  ctx.db.llmResult.insert({id: 0n, prompt, schema, response, provider, model });


});
