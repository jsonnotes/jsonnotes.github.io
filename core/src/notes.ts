import Ajv from "ajv"

import { hash128 } from "./hash.ts"
export { hash128 } from "./hash.ts"

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

// export function validate (data: NoteData): void;
// export function validate (data: Jsonable, schema: Jsonable): void;

export function validate (data:Jsonable , schema: Jsonable) {
  // if (schema == undefined) ({schemaHash:schema, data} = data as NoteData)
  const validate = new Ajv().compile(schema as any);
  if (validate(data)) return true;
  else throw new Error(validate.errors?.map((e: any) => e.message).join(", ") || "Invalid data");
}

export type Hash = string & { length: 32 }
export type Note = { data: string, hash: Hash, schemaHash: Hash }
export type NoteData = { schemaHash: Hash, data: Jsonable }


export function hashData({schemaHash, data} : NoteData){
  if (schemaHash === "0" && tojson(data) != "{}") throw new Error("schema hash is 0 but data is not empty :" + tojson(data))
  return hash128(schemaHash, data)
}

export const hashCall : (fn:Hash, data:Jsonable) => Hash = hash128

export function NoteData(data: Jsonable): NoteData
export function NoteData(title: string, data: Jsonable): NoteData
export function NoteData(title: string, schema: NoteData, data: Record<string, Jsonable>): NoteData

export function NoteData(title:string | Jsonable, schema?: NoteData | Jsonable, data?: Record<string, Jsonable>): NoteData{

  if (schema == undefined){
    data = title as Record<string, Jsonable>
    title = ""
    schema = top
  }
  if (data == undefined){
    data = schema as Record<string, Jsonable>
    schema = top
  }

  return {
    schemaHash: hashData(schema as NoteData),
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
  args: { type: "object", additionalProperties: {} },
  code: string,
  returnSchema: {}
}, {required: ["args", "code", "returnSchema"]  }))

export const example_function = NoteData("example function", function_schema, {
  title: "example function",
  args: {a:{}, b:{}},
  code: "return a + b",
  returnSchema: {}
})

export const schemas : NoteData[] = [
  script_schema,
  script_result_schema,
  NoteData("string", top, string),
  NoteData("number", top, number),
  titled_schema,
  has_titled_child,
  titled,
  titled1, titled2,
  function_schema, example_function,
]

export const isRef = (value: any) =>
  typeof value == "string" && /^#([a-f0-9]{32})$/.exec(value) as `#${Hash}`[] | null;

export const expandLinksSync = (
  value: Jsonable,
  resolve: (ref: Hash) => Jsonable,
): Jsonable => {
  if (typeof value === "string") {
    const match = isRef(value);
    if (!match) return value;
    const ref = match[1];
    return expandLinksSync(resolve(ref as Hash), resolve);
  }
  if (Array.isArray(value)) return value.map((v) => expandLinksSync(v, resolve));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map( ([k, v]) => [k, expandLinksSync(v, resolve)]));
  }
  return value;
};


export const expandLinks = async (
  value: Jsonable,
  resolve: (ref: Hash ) => Promise<Jsonable>,
): Promise<Jsonable> => {
  if (typeof value === "string") {
    const match = isRef(value);
    if (!match) return value;
    const ref = match[1];
    return expandLinks(await resolve(ref as Hash), resolve);
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => expandLinks(v, resolve)));
  if (value && typeof value === "object") {
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await expandLinks(v, resolve)])));
  }
  return value;
};
