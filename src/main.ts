
import { button, div, h2, input, p, padding, popup, style, table, td, textarea, th, tr } from "./html"
import { Ajv } from "ajv";

const db_url = "https://maincloud.spacetimedb.com"
const body = document.body;

const DBNAME = "lexxtract"

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

function add_data(prompt: string, schema: string, response: string, provider: string, model: string){
  const ajv = new Ajv();
  const validate = ajv.compile(JSON.parse(schema));
  const valid = validate(JSON.parse(response));
  if (!valid) {
    console.error("ERROR posting to database: ", validate.errors);  
    throw new Error(validate.errors ? validate.errors.map(e=>e.message).join(', ') : 'Invalid response');
  }

  server_request(`/v1/database/${DBNAME}/call/add_call`, 'POST', JSON.stringify({prompt, schema, response, provider, model}))

  .then(() => popup(h2("SUCESS"), p("data added")))
  .catch(e=>{popup(h2("ERROR"), p(e.message))})

}

function query_data(sql: string){
  return server_request(`/v1/database/${DBNAME}/sql`, 'POST', sql)
  .then(res=>{console.log(res); return res.json()}).then(data=>{
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
    "select * from llm_result limit 100"
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

  let schemafield = textarea(

`{
  "type": "object",
  "properties": {
    "id": { "type": "string" }
  },
  "required": ["id"],
  "additionalProperties": false
}`
  )

  let responsefield = textarea(
`{"id": "some text"}`
  )


  schemafield.rows = 10;
  responsefield.rows = 10;

  schemafield.cols = 100;
  responsefield.cols = 100; 

  schemafield.oninput = ()=>{
    console.log(schemafield.value)
  }

  responsefield.oninput = ()=>{
    console.log(responsefield.value)
  }

  let inputs = [
    input("generate text", { placeholder: "prompt"}),

    schemafield,
    responsefield,

  ]

  document.body.appendChild(div(
    bubble,
    p("add call data:"),

    table(
      tr(td("prompt"), td(inputs[0])),
      tr(td("schema"), td(inputs[1])),
      tr(td("response"), td(inputs[2])),
      tr(td("provider"), "dashboard_test"),
      tr(td("model"), "dashboard_test"),
    ),
    button("push", {onclick: ()=>{
      add_data(inputs[0].value, inputs[1].value, inputs[2].value, "dashboard_test", "dashboard_test")
    }}),
  ))
}
