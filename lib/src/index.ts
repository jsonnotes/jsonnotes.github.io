
import { fromjson } from "@jsonview/core";
import { Api, Hash } from "./dbconn.ts";

export { createApi, type Api, type ApiConfig, type Hash } from "./dbconn.ts";
export { server, dbname } from "./helpers.ts";
export { jsonOverview } from "./helpers.ts"




type SearchRes = {
  title: string,
  hash: Hash,
  schema: Hash,
  links: number,
}

const titleCache = fromjson(localStorage.getItem("titleList") || "[]") as SearchRes[]

export function NoteSearch(api: Api, update: (res: SearchRes)=>void){
  return (term:string) => {


  }
}
