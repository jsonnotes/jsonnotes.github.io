#!/usr/bin/env node
import { function_schema, hashData } from "@jsonview/core";
import { createApi, type Ref } from "./src/api.ts";

const api = createApi({ server: "maincloud" });


let schr = hashData(function_schema);

await api.addNote(function_schema.schemaHash, function_schema.data)

await api.getNote(schr).then(nt=>{
  console.log("schema:", nt.data.required);
})

console.log(schr)



api.addNote(
  schr,
  {
    args:{
      "x": {}
    },
    code: "return x;",
    returnSchema: {}
  }
)
.then((r) => console.log("done", r))
.catch(e=>console.error(e))


