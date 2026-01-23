import { hash128 } from "./hash"
const string = { type : "string"}
const number = { type : "number"}
const object = (properties: Record<string, any>, extra: any = {}) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  ...extra,
})

type NoteData = { schema: undefined, data: "{}" } | { schema: NoteData, data: string }

function NoteData(schema: NoteData, data: any){
  return {schema, data: JSON.stringify(data)}
}

export const top: NoteData = {schema: undefined, data: "{}"}

const script_schema = NoteData(top, object({
  title: string,
  code: string,
}, {
  title: "script_schema"
}))

export const schemas : NoteData[] = [
  script_schema
]


export function hashData(data: string, schemaHash: bigint){
  if (schemaHash === 0n && data != "{}") throw new Error("schema hash is 0n but data is not empty")
  return hash128(String(schemaHash), data)
  
}


