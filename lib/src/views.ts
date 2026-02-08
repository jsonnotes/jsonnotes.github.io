// page view

type VMouseEvent = "click"| "mousemove" | "mouseup" | "mousedown" | "drag"
type VKeyboardEvent = "keydown" | "keyup"

const mouseEvents : VMouseEvent[] = ["click", "mousemove", "mouseup", "mousedown", "drag"];
const keyboardEvents : VKeyboardEvent[] = ["keydown", "keyup"];

export type DomEvent = {
  type: VMouseEvent
  target: VDom
} | {
  type: VKeyboardEvent
  key: string,
  metaKey: boolean,
  shiftKey: boolean,
  value: string,
  target: VDom,
}


type Listener = (e: DomEvent) => DomUpdate[] | void

export type VDom = {
  tag: string
  textContent: string
  id: string
  style: Record<string, string>
  children: VDom[]
  onEvent?: Listener
}

type DomUpdate = { op: "DEL", el: VDom } | { op: "ADD", parent: VDom, el: VDom[]} | { op: "UPDATE", el: VDom }


let doms = new WeakMap<HTMLElement, VDom>();
let elements = new WeakMap<VDom, HTMLElement>();

export const renderDom = (dom: VDom) => {

  let el = document.createElement(dom.tag)
  el.textContent = dom.textContent
  elements.set(dom, el)
  doms.set(el, dom)
  el.append(...dom.children.map(c=>renderDom(c)))
  Object.entries(dom.style).forEach(st=>el.style.setProperty(...st))
  
  const mkupdate = (update: DomUpdate) =>{
    if (update.op == "ADD") {
      elements.get(update.parent)?.append(...update.el.map(e=>renderDom(e)))
    }else if (update.op == "DEL"){
      doms.delete(elements.get(update.el)!)
      elements.get(update.el)?.remove()
      elements.delete(update.el)
    }else if (update.op == "UPDATE"){
      let oldel = elements.get(update.el)!
      oldel.replaceWith(renderDom(update.el))
      doms.delete(oldel)
    }
  }

  mouseEvents.forEach((type) => el.addEventListener(type, (e) => {
    if (dom.onEvent!= undefined) {
      (dom.onEvent!( { type, target: doms.get(e.target as HTMLElement) ! })|| []).forEach(mkupdate);
    }
  }));

  keyboardEvents.forEach((type) => el.addEventListener(type, (e) =>{
    let {key, metaKey, shiftKey} = e as KeyboardEvent;
    let value = ""
    if ((e.target as HTMLElement).tagName in ["input" , "textarea"]) value = (e.target as HTMLInputElement).value
    if (dom.onEvent!=undefined) (dom.onEvent({ type, key, metaKey, shiftKey, value, target: doms.get(e.target as HTMLElement)!})||[]).forEach(mkupdate)
  }))

  return el
}


type Content = string | VDom | Content[] | {id: string} | {style: Record<string, string>} | Record<string, Listener>


const mkDom = (tag: string) => (...content:Content[]) =>{

  let listeners = new Map<VKeyboardEvent | VMouseEvent, Listener>();
  let dm : VDom = {tag: tag, style: {}, textContent: "", id: "", children: [], onEvent: e=> {
    let fn = listeners.get(e.type);
    if (fn) return fn(e)
    }
  };
  let addcontent = (c: Content) => {
    if (c instanceof Array) c.forEach(addcontent);
    else if (typeof c == "string") dm.textContent = c;
    else if (c instanceof Object) {
      if ("tag" in c) return dm.children.push(c as VDom)
      if ("id" in c) dm.id = c.id as string;
      if ("style" in c) Object.entries(c.style).forEach(s=> dm.style[s[0].replace(/([A-Z])/g, '-$1')] = s[1])
      Object.entries(c).forEach(([k,v])=>{

        if (k.startsWith("on")){
          console.log(k,v)
          listeners.set(k.slice(2) as VKeyboardEvent, v as Listener)
        }
      })
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


export const exampleView = renderDom(parent)