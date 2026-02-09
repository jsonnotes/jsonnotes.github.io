import { fromjson, function_schema, Hash, hashData, NoteData, tojson, top } from "@jsonview/core";
import { createApi } from "./dbconn";
import { HTML, renderDom } from "./views";

const body = document.body;
const api = createApi({server:"local"})

body.append(renderDom(({add, del, update})=>{
  const page = HTML.div();
  const section = (title:string, defval :string,  onclick: (value:string)=>Promise<any>) => {
    let inp = HTML.textarea({value:defval})
    let but = HTML.button("go", {
      onclick:async ()=>{
        try{
          await onclick(inp.value!)
        }catch (e){
          setRes(String(e))
        }
      }
    });
    let res = HTML.pre()
    page.children.push(
      HTML.div(
        HTML.h3(title), inp, but, res,
        {
          style:{
            padding:"1em",
            minWidth: "20em",
            border: "2px solid var(--color)",
            margin: "1em auto",
          }
        },
      )
    )
    let setRes = (s:string)=>{res.textContent = s; update(res)}
    return setRes
  }

  let exfunc = NoteData("example", function_schema, {
    title:"example func",
    args: {},
    code: "return [33]",
    returnSchema: {type:"array", items: {type: "number"} }
  })

  api.addNote(exfunc)

  let sqlres = section("sql", "select * from note", v=> api.sql(v).then(res=>sqlres(JSON.stringify(res, null, 2))))
  let getNote = section("get note", hashData(exfunc), v=> api.getNote(v as Hash).then(r=>getNote(JSON.stringify(r, null, 2))) )
  let addNote = section("add note", tojson(exfunc), v=> api.addNote(JSON.parse(v) as NoteData).then(res=>addNote(res)))
  let callNote = section(
    "call note",
    hashData(exfunc),
    v=> new Promise((res, rej)=>{
      let inp = HTML.input({
        value: tojson({a:2, b:4}),
        onkeyup: e=>{
          if (e.key == "Enter"){
            api.callNote(v as Hash, fromjson(inp.value as string))
            .then(res=>{callNote(tojson(res))}).catch(rej)
            del(pop)
          }
        }
      })
      let pop = HTML.popup(
        HTML.h3("enter args"),
        inp
      )
      pop.onEvent = (e) => {
        if (e.type == "click" && e.target == pop){
          del(pop)
        }
      }
      add(page, pop)
    })
  )

  return page
}))
