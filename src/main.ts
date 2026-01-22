
import { a, button, div, h2, input, p, popup, style, table, td, textarea, th, tr } from "./html"
import { openNoteView, Note } from "./note_view"

// const db_url = "https://maincloud.spacetimedb.com"
const db_url = "http://localhost:3000"
const body = document.body;

const DBNAME = "jsonview"

let access_token = null;
let runQuery = () => {};
let noteOverlay: HTMLElement | null = null;
let listSection: HTMLElement | null = null;
let editSection: HTMLElement | null = null;
let schemaIdField: HTMLInputElement | null = null;
let datafield: HTMLTextAreaElement | null = null;


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
  return server_request(`/v1/database/${DBNAME}/call/add_note`, 'POST', JSON.stringify({ schemaId: schemaIdValue, data }))
  .then(async (res) => {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed (${res.status})`);
    }
    popup(h2("SUCESS"), p("data added"));
  })
  .catch(e=>{popup(h2("ERROR"), p(e.message))})
}

const rowToNote = (names: string[], row: any[]): Note => {
  const note: any = {};
  names.forEach((name, index) => {
    note[name] = row[index];
  });
  return note as Note;
};

const showNote = (note: Note) => {
  if (noteOverlay) noteOverlay.remove();
  history.pushState({}, "", `/${note.id}`);
  noteOverlay = openNoteView(note, () => {
    if (noteOverlay) noteOverlay.remove();
    noteOverlay = null;
    history.pushState({}, "", "/");
  }, (schemaId) => {
    showNoteById(schemaId);
  });
};

const fillEditFromNote = (note: Note) => {
  if (!schemaIdField || !datafield) return;
  schemaIdField.value = String(note.schemaId);
  datafield.value = String(note.data);
  datafield.dispatchEvent(new Event("input"));
};

const showNoteById = (id: number) => {
  query_data(`select * from json_note where id = ${id} limit 1`)
    .then((data) => {
      if (!data.rows.length) throw new Error("note not found");
      showNote(rowToNote(data.names, data.rows[0]));
    })
    .catch((e) => popup(h2("ERROR"), p(e.message)));
};

const handleRoute = () => {
  const path = window.location.pathname.replace(/^\/+/, "");
  if (path === "edit") {
    if (noteOverlay) noteOverlay.remove();
    noteOverlay = null;
    if (listSection) listSection.style.display = "none";
    if (editSection) editSection.style.display = "block";
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id");
    const id = idParam ? Number(idParam) : NaN;
    if (Number.isFinite(id)) {
      query_data(`select * from json_note where id = ${id} limit 1`)
        .then((data) => {
          if (!data.rows.length) throw new Error("note not found");
          fillEditFromNote(rowToNote(data.names, data.rows[0]));
        })
        .catch((e) => popup(h2("ERROR"), p(e.message)));
    }
    return;
  }
  if (!path) {
    if (noteOverlay) noteOverlay.remove();
    noteOverlay = null;
    if (listSection) listSection.style.display = "block";
    if (editSection) editSection.style.display = "none";
    return;
  }
  const id = Number(path);
  if (Number.isFinite(id)) showNoteById(id);
};

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

body.appendChild(
  a(
    style({ textDecoration: "none", color: "inherit" }),
    { href: "/" },
    h2("LEXXTRACT DATABASE DASHBOARD")
  )
)

{
  let userinput = textarea(
    style({fontFamily: "monospace", padding: ".5em"}),
    "select * from json_note limit 100"
  )

  userinput.rows = 2;
  userinput.cols = 100;

  let result = div()
  runQuery = () => {
    result.innerHTML = ""
    result.append(p("running..."))
    query_data(userinput.value).then(data=>{
      result.innerHTML = ""
          result.append(table(
            bubble,
            tr(data.names.map(name=>th(style({border: "1px solid #ccc", padding: ".5em"}), name))),
            ...data.rows.map(row=>{
              const note = rowToNote(data.names, row);
              const href = `/${note.id}`;
              const link = (content: string) => a(
                style({color: "inherit", textDecoration: "none", display: "block"}),
                { href },
                content
              );
              return tr(
              style({cursor: "pointer"}),
              ...row.map((cell:string)=>{


                // cell = cell.replace(/[\n\r]/g, ''),
                cell = String(cell).replace(/[\n\r]/g, '');

                console.log(JSON.stringify(cell))
                const text = cell.length > 20 ? cell.substring(0, 20) + "..." : cell;
                return td(style({border: "1px solid #ccc", padding: ".5em"}), link(text))
              })
            )}),
        style({borderCollapse: "collapse"})
      ))
    })
  }
  listSection = div(

      bubble,
      a(style({textDecoration: "none", color: "inherit", fontWeight: "bold"}), { href: "/edit" }, "EDIT"),
      p("SQL console:"),
      userinput,

      button("run", {onclick: runQuery}),

      result
    )
  body.append(listSection)

  runQuery()
  handleRoute()
}

window.addEventListener("popstate", handleRoute);


{

  datafield = textarea(
    style({fontFamily: "monospace", minHeight: "12em", resize: "vertical"}),
`{"id": "some text"}`
  )


  schemaIdField = input("1", { placeholder: "schema id (seed is 1)" })

  let jsonStatus = p("valid json")
  jsonStatus.style.color = "#2f6f2f";

  datafield.rows = 10;

  datafield.cols = 100; 

  const resizeTextarea = () => {
    datafield.style.height = "auto";
    datafield.style.height = `${datafield.scrollHeight}px`;
  };

  datafield.onkeydown = (e)=>{
    const pairs: Record<string, string> = { "{": "}", "[": "]", "(": ")", "\"": "\"" };
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!(e.key in pairs)) return;
    const start = datafield.selectionStart || 0;
    const end = datafield.selectionEnd || 0;
    if (start === end && datafield.value[start] === pairs[e.key]) {
      e.preventDefault();
      datafield.setSelectionRange(start + 1, start + 1);
      return;
    }
    if (e.key === "\"" && start === end && datafield.value[start - 1] === "\\") return;
    e.preventDefault();
    const before = datafield.value.slice(0, start);
    const after = datafield.value.slice(end);
    const close = pairs[e.key];
    const selection = datafield.value.slice(start, end);
    datafield.value = `${before}${e.key}${selection}${close}${after}`;
    const cursor = start + 1 + selection.length;
    datafield.setSelectionRange(cursor, cursor);
    datafield.dispatchEvent(new Event("input"));
  }

  datafield.oninput = ()=>{
    try {
      JSON.parse(datafield.value);
      jsonStatus.innerText = "valid json";
      jsonStatus.style.color = "#2f6f2f";
    } catch (e: any) {
      jsonStatus.innerText = e.message || "invalid json";
      jsonStatus.style.color = "#a33";
    }
    resizeTextarea();
  }

  resizeTextarea();

  editSection = div(
    bubble,
    p("add note data:"),

    table(
      tr(td("schema id"), td(schemaIdField)),
      tr(td("data"), td(datafield)),
    ),
    div(
      style({display: "flex", gap: "0.5em", alignItems: "center"}),
      button("format json", {onclick: ()=>{
        try {
          const parsed = JSON.parse(datafield.value);
          datafield.value = JSON.stringify(parsed, null, 2);
          jsonStatus.innerText = "valid json";
          jsonStatus.style.color = "#2f6f2f";
        } catch (e: any) {
          jsonStatus.innerText = e.message || "invalid json";
          jsonStatus.style.color = "#a33";
        }
      }}),
      jsonStatus
    ),
    button("push", {onclick: ()=>{
      add_note(schemaIdField.value.trim() || "1", datafield.value)
        .then(()=>runQuery())
        .catch(()=>{})
    }}),
  )
  editSection.style.display = "none";
  document.body.appendChild(editSection)
  handleRoute()
}
