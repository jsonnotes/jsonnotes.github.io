// page view

export type DomEvent = {
  type: "click"| "mousemove" | "mouseup" | "mousedown" | "drag",
  target: VDom
} | {
  type: "keydown" | "keyup"
  key: string,
  metaKey: boolean,
  shiftKey: boolean,
  value: string,
  target: VDom,
}

export type VDom = {
  tag: string
  textContent: string
  id: string
  style: Record<string, string>
  children: VDom[]
}

type DomUpdate = { op: "DEL", el: VDom } | { op: "ADD", parent: VDom, el: VDom[]}

export type View = {
  dom: VDom,
  onEvent: (event: DomEvent) => DomUpdate[]
}

export const showView = (view: View) => {

  

  let elements = new Map<VDom, HTMLElement>();
  let doms = new Map<HTMLElement, VDom>()
  const render = (dom: VDom) : HTMLElement => {
    let el = document.createElement(dom.tag)
    el.textContent = dom.textContent
    elements.set(dom, el)
    doms.set(el, dom)
    el.append(...dom.children.map(c=>render(c)))
    Object.entries(dom.style).forEach(st=>el.style.setProperty(...st))
    return el
  }

  let root = render(view.dom)

  const mkupdate = (update: DomUpdate) =>{
    if (update.op == "ADD") {
      elements.get(update.parent)?.append(...update.el.map(e=>render(e)))
    }else if (update.op == "DEL"){
      doms.delete(elements.get(update.el)!)
      elements.get(update.el)?.remove()
      elements.delete(update.el)
    }
  }

  (["click", "mousedown", "mouseup", "drag", "mousemove"] as ("click" ) [])
  .forEach((type) => root.addEventListener(type, (e) =>
    view.onEvent( { type, target: doms.get(e.target as HTMLElement) ! }).forEach(mkupdate)));

  (["keyup", "keydown"] as "keyup"[]).forEach((type) => root.addEventListener(type, (e) =>{
    let {key, metaKey, shiftKey} = e as KeyboardEvent;
    let value = ""
    if ((e.target as HTMLElement).tagName in ["input" , "textarea"]) value = (e.target as HTMLInputElement).value
    view.onEvent({ type, key, metaKey, shiftKey, value, target: doms.get(e.target as HTMLElement)!}).forEach(mkupdate)
  }))


  

  return root
  
}


type Content = string | VDom | Content[] | {id: string} | {style: Record<string, string>}


const mkDom = (tag: string) => (...content:Content[]) =>{
  let dm : VDom = {tag: tag, style: {}, textContent: "", id: "", children: []};
  let addcontent = (c: Content) => {
    if (c instanceof Array) c.forEach(addcontent);
    else if (typeof c == "string") dm.textContent = c;
    else if (c instanceof Object) {
      if ("tag" in c) return dm.children.push(c)
      if ("id" in c) dm.id = c.id;
      if ("style" in c) Object.entries(c.style).forEach(s=> dm.style[s[0].replace(/([A-Z])/g, '-$1')] = s[1])
    }
  }
  addcontent(content)

  return dm
}

export const HTML = {
  div: mkDom("div"),
  span: mkDom("span"),
  p: mkDom("p"),
  h1: mkDom("h1"),
  h2: mkDom("h2"),
  h3: mkDom("h3"),
  h4: mkDom("h4"),
  h5: mkDom("h5"),
  h6: mkDom("h6"),
  a: mkDom("a"),
  button: mkDom("button"),
  input: mkDom("input"),
  textarea: mkDom("textarea"),
}





let but = HTML.button("climme");

let parent = HTML.div(
  HTML.p("hello", {style: { color: "red" }}),
  but
)


let onEvent = (ev: DomEvent) : DomUpdate[] => {

  if (ev.type != "click") return[]


  if (ev.target == but && ev.type == "click"){
    let res: DomUpdate[] = [{op: "DEL", el: but}]
    but = HTML.button("clicked", {style: { backgroundColor: "red" }});
    res.push({op: "ADD", parent: parent, el: [but]});
    return res
  }
  return []
  
};


export const exampleView = showView({
  dom: parent,
  onEvent
})