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
    data: tojson({
      ...(title? {title} : {}),
      ...data
    })
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


const isRef = (value: string) => /^#([a-f0-9]+)$/.exec(value);

export const expandLinksSync = (
  value: Jsonable,
  resolve: (ref: string) => Jsonable,
  seen = new Set<string>()
): Jsonable => {
  if (typeof value === "string") {
    const match = isRef(value);
    if (!match) return value;
    const ref = match[1];
    if (seen.has(ref)) throw new Error(`cycle: #${ref}`);
    seen.add(ref);
    return expandLinksSync(resolve(ref), resolve, seen);
  }
  if (Array.isArray(value)) return value.map((v) => expandLinksSync(v, resolve, seen));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map( ([k, v]) => [k, expandLinksSync(v, resolve, seen)]));
  }
  return value;
};


export const expandLinks = async (
  value: Jsonable,
  resolve: (ref: string) => Promise<Jsonable>,
  seen = new Set<string>()
): Promise<Jsonable> => {
  if (typeof value === "string") {
    const match = isRef(value);
    if (!match) return value;
    const ref = match[1];
    if (seen.has(ref)) throw new Error(`cycle: #${ref}`);
    seen.add(ref);
    return expandLinks(await resolve(ref), resolve, seen);
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => expandLinks(v, resolve, seen)));
  if (value && typeof value === "object") {
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await expandLinks(v, resolve, seen)])));
  }
  return value;
};
