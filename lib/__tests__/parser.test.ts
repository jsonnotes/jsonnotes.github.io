

import test, { it, run } from "node:test";
import { type Jsonable } from "@jsonview/core";

import { runWithFuel } from "@jsonview/core/parser";



const testRun = (code: string, args: {fuel?: number, result? : Jsonable, shouldError?: true} = {}) =>{
  try{
    let res = runWithFuel(code, args.fuel || 1000)
    if ("err" in res) throw new Error (res.err)
    let {ok} = res
    if (args.shouldError) throw new Error(`Expected error: ${code}`);
    if (args.result == undefined) args.result = (Function(code))()
    let [a,b] = [args.result!, ok].map(x=>JSON.stringify(x))
    if (a != b) throw new Error(`${a} != ${b}`)
  }catch(e){
    if (!args.shouldError) throw e;
  }
}



it ("runs JS", ()=>{
  testRun("return 1+1", {result: 2})
  testRun("return [][0].e", {shouldError: true})
  testRun("while(true){}", {shouldError: true, fuel:100})
  testRun("while(true){return 0}")
})



