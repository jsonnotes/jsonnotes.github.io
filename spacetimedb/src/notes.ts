import Ajv from "ajv"

import { hash128 } from "./hash"

const string = {type : "string"}
const number = {type : "number"}

export type Schema = Jsonable
const object = (properties: Record<string, any>, extra: any = {}) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  ...extra,
})

const arrayT = (items : Schema) => ({
  type:"array",
  items
})

export type Jsonable = string | number | boolean | Jsonable[] | {[key: string]: Jsonable}
export const tojson = (x: Jsonable)=>JSON.stringify(x, null, 2)
export const fromjson = (x:string): Jsonable => JSON.parse(x)

export const validate = (data: Jsonable, schema: Jsonable) => {
  const validate = new Ajv().compile(schema as any);
  if (validate(data)) return true;
  else throw new Error(validate.errors?.map((e: any) => e.message).join(", ") || "Invalid data");
}

export type Hash = string & { length: 32 }
export type Note = {data: string, id: number, hash: Hash, schemaId: number}
export type NoteData = { schemaHash: Hash, data: Jsonable }


export function hashData({schemaHash, data} : NoteData){
  if (schemaHash === "0" && tojson(data) != "{}") throw new Error("schema hash is 0 but data is not empty :" + tojson(data))
  return hash128(schemaHash, data) 
}

export function NoteData(title:string, schema: NoteData, data: any): NoteData{
  return {
    schemaHash: hashData(schema),
    data: {
      ...(title? {title} : {}),
      ...data
    }
  }
}

export const top: NoteData = {schemaHash : "0" as Hash, data: {}}

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
const titled1 = NoteData("titled1", has_titled_child, { child: titled.data })
const titled2 = NoteData("titled2", has_titled_child, {child: `#${hashData(titled)}`});



export const function_schema = NoteData("function schema", top, object({
  title: string,
  code: string,
}, {
  title: "function_schema",
  required: ["code"]
}))


export const server_function = NoteData("function schema", top, object({
  title: string,
  code: string,
}, {
  title: "server_function",
  required: ["code"]
}))




const example_function = NoteData("example function", function_schema, {
  title: "example function",
  inputs: ["a", "b"],
  code: "return a + b",
})



export const schemas : NoteData[] = [
  script_schema,
  script_result_schema,
  NoteData("", top, string),
  NoteData("", top, number),
  titled_schema,
  has_titled_child,
  titled,
  titled1, titled2,
  function_schema, example_function,
  server_function,  
]


export const isRef = (value: any) => typeof( value) == "string" && /^#([a-f0-9]+)$/.exec(value) as Ref[] | null;

export const expandLinksSync = (
  value: Jsonable,
  resolve: (ref: Ref) => Jsonable,
): Jsonable => {
  if (typeof value === "string") {
    const match = isRef(value);
    if (!match) return value;
    const ref = match[1];
    return expandLinksSync(resolve(ref), resolve);
  }
  if (Array.isArray(value)) return value.map((v) => expandLinksSync(v, resolve));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map( ([k, v]) => [k, expandLinksSync(v, resolve)]));
  }
  return value;
};


export const expandLinks = async (
  value: Jsonable,
  resolve: (ref: Ref ) => Promise<Jsonable>,
): Promise<Jsonable> => {
  if (typeof value === "string") {
    const match = isRef(value);
    if (!match) return value;
    const ref = match[1];
    return expandLinks(await resolve(ref), resolve);
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => expandLinks(v, resolve)));
  if (value && typeof value === "object") {
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await expandLinks(v, resolve)])));
  }
  return value;
};



/*** represents a note id or hash ***/
export type Ref = Hash | number | `#${number | Hash}` | `${number}`

export const matchRef= <T>(ref:Ref, onid: (n:number)=>T, onhash: (h:Hash) => T) =>{
  if (typeof ref == "number") return onid(ref)
  if (ref[0] == "#") ref = ref.slice(1) as Hash
  if (ref.length == 32) return onhash(ref as Hash)
  return onid(Number(ref))
}
