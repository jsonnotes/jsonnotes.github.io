
import { button, div, h2, input, p, popup, style, table, td, textarea, th, tr } from "./html"

// const db_url = "https://maincloud.spacetimedb.com"
const db_url = "http://localhost:3000"
const body = document.body;

const DBNAME = "jsonview"

let access_token = null;


function server_request(path: string, method: string, body: string = null){
  return fetch(`${db_url}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(access_token ?{'Authorization': `Bearer ${access_token}`} : {}),
    },
    body
  })
}

function setup(){
  server_request('/v1/identity', 'POST')
  .then(res=>res.json())
  .then(text=>{
    console.log(text.token)
    access_token = text.token})
}

setup()

function add_note(schemaId: string, data: string){
  const schemaIdValue = Number(schemaId || 1);
  server_request(`/v1/database/${DBNAME}/call/add_note`, 'POST', JSON.stringify({ schemaId: schemaIdValue, data }))
  .then(async (res) => {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed (${res.status})`);
    }
    popup(h2("SUCESS"), p("data added"));
  })
  .catch(e=>{popup(h2("ERROR"), p(e.message))})
}

function query_data(sql: string){
  return server_request(`/v1/database/${DBNAME}/sql`, 'POST', sql)
  .then(async res=>{
    console.log(res)
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(text || "Invalid response")
    }
  }).then(data=>{
    if (data.length > 1) console.warn("multiple rows returned, TODO: handle this")
    let {schema, rows} = data[0]
    return {names: schema.elements.map(e=>e.name.some),rows}
  })
  .catch(e=>{console.error(e);
    popup(p(e.message))
    return {names: ["error"], rows: [e.message]}})
}

let bubble = style({
  padding: "1.5em",
  margin: ".5em",
  borderRadius: "1em",
  background: "var(--background-color)",
  color: "var(--color)",
  border: "1px solid #ccc",
})

body.appendChild(h2( "LEXXTRACT DATABASE DASHBOARD"))

{
  let userinput = textarea(
    style({fontFamily: "monospace", padding: ".5em"}),
    "select * from json_note limit 100"
  )

  userinput.rows = 2;
  userinput.cols = 100;

  let result = div()
  body.append(
    div(

      bubble,
      p("SQL console:"),
      userinput,

      button("run", {onclick: ()=>{
        result.innerHTML = ""
        result.append(p("running..."))
        query_data(userinput.value).then(data=>{
          result.innerHTML = ""
          result.append(table(
            bubble,
            tr(data.names.map(name=>th(style({border: "1px solid #ccc", padding: ".5em"}), name))),
            ...data.rows.map(row=>tr(
              style({cursor: "pointer"}),
              {onclick: ()=>{
                popup(
                  table(
                    data.names.map((name, index)=>
                      tr(
                        td(name, style({border: "1px solid #ccc", padding: ".5em"})),
                        td(row[index], style({border: "1px solid #ccc", padding: ".5em"})),
                      )
                    ),
                    style({borderCollapse: "collapse"})
                  )
                )
              }},
              ...row.map((cell:string)=>{


                // cell = cell.replace(/[\n\r]/g, ''),
                cell = String(cell).replace(/[\n\r]/g, '');

                console.log(JSON.stringify(cell))
                return td(style({border: "1px solid #ccc", padding: ".5em"}), cell.length > 20 ? cell.substring(0, 20) + "..." : cell)
              })
            )),
            style({borderCollapse: "collapse"})
          ))
        })
      }}),

      result
    )
  )
}


{

  let datafield = textarea(
`{"id": "some text"}`
  )


  let schemaIdField = input("1", { placeholder: "schema id (seed is 1)" })

  datafield.rows = 10;

  datafield.cols = 100; 

  datafield.oninput = ()=>{
    console.log(datafield.value)
  }

  document.body.appendChild(div(
    bubble,
    p("add note data:"),

    table(
      tr(td("schema id"), td(schemaIdField)),
      tr(td("data"), td(datafield)),
    ),
    button("push", {onclick: ()=>{
      add_note(schemaIdField.value.trim() || "1", datafield.value)
    }}),
  ))
}
