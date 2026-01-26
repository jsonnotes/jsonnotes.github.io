import Ajv from "ajv"
import { hash128 } from "./hash"
const string = { type : "string"}
const number = { type : "number"}
const object = (properties: Record<string, any>, extra: any = {}) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  ...extra,
})



export const validate = (data: string, schema: string) => {
  const validate = new Ajv().compile(JSON.parse(schema));
  if (validate(JSON.parse(data))) return true;
  else throw new Error(validate.errors?.map((e: any) => e.message).join(", ") || "Invalid data");
}

export type Hash = string & { length: 32 }

export type NoteData = { schemaHash: Hash, data: string }

export function hashData({schemaHash, data} : NoteData){
  if (schemaHash === "0" && data != "{}") throw new Error("schema hash is 0 but data is not empty")
  return hash128(String(schemaHash), data) 
}



export function NoteData(schema: NoteData, data: any): NoteData{

  validate(JSON.stringify(data), schema.data)

  return {
    schemaHash: hashData(schema),
    data: JSON.stringify(data)
  }
}

export const top: NoteData = {schemaHash : "0" as Hash, data: "{}"}

export const script_schema = NoteData(top, object({
  title: string,
  code: string,
}, {
  title: "script_schema"
}))


export const script_result_schema = NoteData(top, object({
  title: string,
  script: string,
  content: {},
}, {
  title: "script_result_schema"
}))



export const schemas : NoteData[] = [
  script_schema,
  script_result_schema,
  NoteData(top, {title: "string", ...string}),
  NoteData(top, {title: "number", ...number}),
  NoteData(top, {title: "titled", ...object({title: string})}),
]

