import { fromjson, function_schema, type Hash, hashData, type NoteData, tojson } from "@jsonview/core"
import { createApi } from "../dbconn"
import { noteSearch } from "../index"
import { HTML, renderDom } from "../views"

const api = createApi({server: "maincloud"})

document.body.append(renderDom(({update}) => {
  const page = HTML.div()

  const section = (title: string, defval: string, onclick: (value: string) => Promise<any>) => {
    const inp = HTML.textarea({value: defval})
    const res = HTML.pre()
    const setRes = (s: string) => { res.textContent = s; update(res) }
    const but = HTML.button("go", {
      onclick: async () => {
        try { await onclick(inp.value!) }
        catch (e) { setRes(String(e)) }
      }
    })
    page.children.push(HTML.div(
      HTML.h3(title), inp, but, res,
      {style: {padding: "1em", minWidth: "20em", border: "2px solid var(--color)", margin: "1em auto"}}
    ))
    return setRes
  }

  const exfunc: NoteData = {
    schemaHash: hashData(function_schema),
    data: {title: "example func", args: {}, code: "return [33]", returnSchema: {type: "array", items: {type: "number"}}}
  }
  api.addNote(exfunc)

  const sqlres = section("sql", "select * from note",
    v => api.sql(v).then(r => sqlres(JSON.stringify(r, null, 2))))
  const getNote = section("get note", hashData(exfunc),
    v => api.getNote(v as Hash).then(r => getNote(JSON.stringify(r, null, 2))))
  const addNote = section("add note", tojson(exfunc),
    v => api.addNote(JSON.parse(v) as NoteData).then(r => addNote(r)))
  const callNote = section("call note", hashData(exfunc),
    v => api.callNote(v as Hash, fromjson('{}')).then(r => callNote(tojson(r))))

  const search = noteSearch(results => searchres(JSON.stringify(results, null, 2)))
  const searchres = section("search", "title", async query => await search(query))

  return page
}))
