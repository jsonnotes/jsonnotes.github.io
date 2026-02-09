import { fromjson, hash128, tojson, type Jsonable } from "@jsonview/core";

export const dbname = "jsonview"
export const server = "maincloud"



export function funCache  <Arg extends Jsonable, T extends Jsonable> (fn: (arg:Arg)=> T) :(arg: Arg)=>T;
export function funCache  <Arg extends Jsonable, T extends Promise<Jsonable>> (fn: (arg:Arg)=> T): (arg: Arg)=> T;
export function funCache <Arg extends Jsonable, T extends Jsonable> (fn :(arg:Arg)=> T | Promise<T>) {
  const map = new Map<string, T>();
  const fkey = hash128(fn.toString())
  const ls = typeof localStorage !== "undefined" ? localStorage : null
  return (arg:Arg)=>{
    const key = tojson(arg);
    if (map.has(key)) return map.get(key)
    const storekey = "funcache:" + hash128(fkey, key)
    const stored = ls?.getItem(storekey)
    if (stored != null){
      let res = fromjson(stored) as T
      map.set(key,res)
      return res
    }
    let setres = (res:T) => { ls?.setItem(storekey, tojson(res)); map.set(key, res); return res }
    let res = fn(arg)
    return (res instanceof Promise) ? res.then(setres) : setres(res)
  }
}

export const jsonOverview = (json: Jsonable) => {

  console.log("JSONING")

  let full = ""
  let table = (data:Jsonable, d:number)=> {
    let ws = "  ".repeat(d)
    if (typeof data == "string") {
      const isBigString = data.length > 60 || data.includes('\n');
      if (isBigString) {
        const lines = data.split('\n');
        full += "\n" + ws + "`";
        lines.forEach((line, i) => {
          full += (i === 0 ? "" : "\n" + ws) + line;
        });
        full += "`";
      } else {
        full += " " + data;
      }
    } else if (typeof data == "number") {
      full += " " + data;
    } else if (typeof data == "object") {
      Object.entries(data).forEach(([k,v]) => {
        full += "\n" + ws + k + ":"
        table(v, d+1)
      })
    }
  }
  table(json, 0)
  return full
}

