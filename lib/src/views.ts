// page view

type MouseEventType = "click"| "mousemove" | "mouseup" | "mousedown" | "drag"
type KeyboardEventType = "keydown" | "keyup"
type DomEventType = MouseEventType | KeyboardEventType;

const mouseEvents : MouseEventType[] = ["click", "mouseup", "mousedown", "drag"];
const keyboardEvents : KeyboardEventType[] = ["keydown", "keyup"];



type MouseEvent = {
  type: MouseEventType
  target: VDom
};

type KeyboardEvent = {
  type: KeyboardEventType
  key: string,
  metaKey: boolean,
  shiftKey: boolean,
  target: VDom,
}

export type DomEvent = MouseEvent | KeyboardEvent


type Listener = (e: DomEvent) => void

export type UPPER = {
  add: (parent: VDom, ...el: VDom[])=> void,
  del: (el: VDom) => void,
  update: (el: VDom) => void,
}

export type VDom = {
  tag: string
  textContent: string
  id: string
  style: Record<string, string>
  children: VDom[]
  onEvent?: Listener
  value? : string
}

type DomUpdate = { op: "DEL", el: VDom } | { op: "ADD", parent: VDom, el: VDom[]} | { op: "UPDATE", el: VDom }


let doms = new WeakMap<HTMLElement, VDom>();
let elements = new WeakMap<VDom, HTMLElement>();



export const renderDom = (mker: (ufn: UPPER) => VDom): HTMLElement => {

  const render = (dom:VDom) : HTMLElement=>{
    let el = document.createElement(dom.tag)
    el.textContent = dom.textContent
    if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && dom.value) el.value = dom.value
    elements.set(dom, el)
    doms.set(el, dom)
    el.append(...dom.children.map(c=>render(c)))
    Object.entries(dom.style).forEach(st=>el.style.setProperty(...st))
    mouseEvents.forEach((type) => el.addEventListener(type, (e) => {
      if (dom.onEvent!= undefined) dom.onEvent!( { type, target: doms.get(e.target as HTMLElement) ! })
    }));
    keyboardEvents.forEach((type) => el.addEventListener(type, (e) =>{
      let {key, metaKey, shiftKey} = e as globalThis.KeyboardEvent;
      if (["INPUT" , "TEXTAREA"].includes((e.target as HTMLElement).tagName)) dom.value = (e.target as HTMLInputElement).value
      if (dom.onEvent!=undefined) dom.onEvent({ type, key, metaKey, shiftKey, target: doms.get(e.target as HTMLElement)!})
    }))
    return el

  }
  return render(mker({
    add: (parent: VDom, ...el: VDom[]) => {
      elements.get(parent)?.append(...el.map(e=>render(e)))
    },
    del: (el: VDom) => {
      doms.delete(elements.get(el)!)
      elements.get(el)?.remove()
      elements.delete(el)
    },
    update: (el: VDom) => {
      let oldel = elements.get(el)!
      oldel.replaceWith(render(el))
      doms.delete(oldel)
    }
  }))
}




type KeyListener = (e:KeyboardEvent) => void
type MouseListener = (e:MouseEvent) => void
type Subscriber = {
  "onkeyup"? : KeyListener
  "onkeydown"? : KeyListener
  "onmouseup"? : MouseListener
  "onmousedown"? : MouseListener
  "onclick"? :MouseListener
};

type Content = string | VDom | Content[] | {id: string} | {style: Record<string, string>} | Subscriber | {value: string}


const mkDom = (tag: string) => (...content:Content[]) =>{

  let listeners = new Map<KeyboardEventType | MouseEventType, Listener>();
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
      if ("value" in c) dm.value = c.value;
      if ("style" in c) Object.entries(c.style).forEach(s=> dm.style[s[0].replace(/([A-Z])/g, '-$1')] = s[1])
      Object.entries(c).forEach(([k,v])=>{

        if (k.startsWith("on")) listeners.set(k.slice(2) as KeyboardEventType, v as Listener)
      })
    }
  }

  addcontent(content)

  return dm
}

let div= mkDom("div")




const popup = (...cs:VDom[])=>{

  const dialogfield = div(
    {
      style: {
        background: "var(--background-color)",
        color: "var(--color)",
        padding: "1em",
        paddingBottom: "2em",
        borderRadius: "1em",
        zIndex: "2000",
        overflowY: "scroll",
      }
    },
    ...cs)

  const popupbackground = div(
    {style:{
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      background: "rgba(166, 166, 166, 0.5)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: "2000",
    }},
    dialogfield
  )

  // const closePopup = () => {
  //   popupbackground.remove();
  //   document.removeEventListener("keydown", handleKeydown);
  // };

  // const handleKeydown = (e: KeyboardEvent) => {
  //   if (e.key === "Escape") {
  //     closePopup();
  //   }
  // };

  // popupbackground.onclick = closePopup;
  // document.addEventListener("keydown", handleKeydown);

  // dialogfield.onclick = (e) => {
  //   e.stopPropagation();
  // }
  return popupbackground

}


export const HTML = {
  div,
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
  pre: mkDom("pre"),
  popup
}
