import Ajv from "ajv"
import { hash128 } from "./hash"
const string = {type : "string"}
const number = {type : "number"}
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

export function NoteData(title:string, schema: NoteData, data: any): NoteData{
  return {
    schemaHash: hashData(schema),
    data: JSON.stringify({
      ...(title? {title} : {}),
      ...data
    })
  }
}

export const top: NoteData = {schemaHash : "0" as Hash, data: "{}"}

export const script_schema = NoteData("script_schema", top, object({
  title: string,
  code: string,
}))


export const script_result_schema = NoteData("script_result_schema", top, object({
  title: string,
  script: "#" + hashData(script_schema),
  content: {},
}, {
  title: "script_result_schema"
}))

const titled_schema = NoteData("titled_schema", top, object({title: string}))

const has_titled_child = NoteData("has_titled_child", top, object({"child": object({title:string})}))


const titled = NoteData("a titled", titled_schema, {title: "im child"})
const titled1 = NoteData("titled1", has_titled_child, { child: JSON.parse(titled.data) })
const titled2 = NoteData("titled2", has_titled_child, {child: `#${hashData(titled)}`})


export const schemas : NoteData[] = [
  script_schema,
  script_result_schema,
  NoteData("", top, string),
  NoteData("", top, number),
  titled_schema,
  has_titled_child,
  titled,
  titled1, titled2
]
