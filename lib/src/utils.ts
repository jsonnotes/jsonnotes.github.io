import { Jsonable } from "@jsonview/core";


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