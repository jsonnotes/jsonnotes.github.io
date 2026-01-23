import { hash128 } from "./hash"
const string = { type : "string"}
const number = { type : "number"}
const object = (properties: Record<string, any>, extra: any = {}) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  ...extra,
})

type NoteData = { schemaHash: "0", data: "{}" } | { schemaHash: string, data: string }

export function hashData(data: string, schemaHash: string){
  if (schemaHash === "0" && data != "{}") throw new Error("schema hash is 0 but data is not empty")
  return hash128(String(schemaHash), data) 
}

function NoteData(schema: NoteData, data: any): NoteData{

  return {
    schemaHash: hashData(schema.data, schema.schemaHash),
    data: JSON.stringify(data)
  }
}

export const top: NoteData = {schemaHash:"0", data: "{}"}

const script_schema = NoteData(top, object({
  title: string,
  code: string,
}, {
  title: "script_schema"
}))

export const schemas : NoteData[] = [
  script_schema
]

