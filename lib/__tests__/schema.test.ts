import { arrayT, object, schema_schema, string } from "../src/example/types.ts";
import { type Jsonable, validate } from "@jsonview/core";

import { it } from "node:test";

const testvalidate = (data: Jsonable, isvalid = true) => {
  try{
    validate(data, schema_schema)
    if (!isvalid) throw new Error("expected error")
  }catch (e) {
    if (isvalid) throw e
  }
}


it("validates schemas", ()=>{


  testvalidate(string, true)
  testvalidate({}, true)
  testvalidate({title: "empty schema"}, true)
  testvalidate(arrayT(string), true)
  testvalidate(arrayT(arrayT(string)), true)
  testvalidate(arrayT(arrayT("hello")), false)
  testvalidate({type: "hello"}, false)
  testvalidate(arrayT({type: "hello"}), false)
  testvalidate(object({hello: string}), true)
  testvalidate(object({hello: string}, {title: "hello schema"}), true)
  testvalidate(schema_schema, true)

})
