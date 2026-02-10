export type htmlKey = 'innerText'|'onclick' | 'oninput' | 'onkeydown' |'children'|'class'|'id'|'href'|'data-nav'|'contentEditable'|'eventListeners'|'color'|'background' | 'style' | 'placeholder' | 'tabIndex' | 'colSpan'

const htmlElement = (tag:string, text:string, cls:string = "", args?:Partial<Record<htmlKey, any>>):HTMLElement =>{
  const _element = document.createElement(tag)
  _element.innerText = text
  if (args) Object.entries(args).forEach(([key, value])=>{
    if (key === 'parent'){
      (value as HTMLElement).appendChild(_element)
    }
    if (key==='children'){
      (value as HTMLElement[]).forEach(c=>_element.appendChild(c))
    }else if (key==='eventListeners'){
      Object.entries(value as Record<string, (e:Event)=>void>).forEach(([event, listener])=>{
        _element.addEventListener(event, listener)
      })
    }else if (key === 'color' || key === 'background'){
      _element.style[key] = value
    }else if (key === 'style'){
      Object.entries(value as Record<string, string>).forEach(([key, value])=>{
        key = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        _element.style.setProperty(key, value)
      })
    }else if (key === 'class'){
      _element.classList.add(...(value as string).split('.').filter(x=>x))
    }else if (key.startsWith('data-')){
      _element.setAttribute(key, value)
    }else{
      _element[(key as 'innerText' | 'onclick' | 'oninput' | 'id' | 'href' | 'contentEditable')] = value
    }
  })
  return _element
}

type HTMLArg = string | number | HTMLElement | Partial<Record<htmlKey, any>> | Promise<HTMLArg> | HTMLArg[]

export const html = (tag:string, ...cs:HTMLArg[]):HTMLElement=>{
  let children: HTMLElement[] = []
  let args: Partial<Record<htmlKey, any>> = {}

  const add_arg = (arg:HTMLArg)=>{
    if (typeof arg === 'string') children.push(htmlElement("span", arg))
    else if (typeof arg === 'number') children.push(htmlElement("span", arg.toString()))
    else if (arg instanceof Promise){
      const el = span()
      arg.then((value)=>{
        el.innerHTML = ""
        el.appendChild(span(value))
      })
      children.push(el)
    }
    else if (arg instanceof HTMLElement) children.push(arg)
    else if (arg instanceof Array) arg.forEach(add_arg)
    else args = {...args, ...arg}
  }
  for (let arg of cs){
    add_arg(arg)
  }
  return htmlElement(tag, "", "", {...args, children})
}

export type HTMLGenerator<T extends HTMLElement = HTMLElement> = (...cs:HTMLArg[]) => T

const newHtmlGenerator = <T extends HTMLElement>(tag:string)=>(...cs:HTMLArg[]):T=>html(tag, ...cs) as T

export const p:HTMLGenerator<HTMLParagraphElement> = newHtmlGenerator("p")
export const h2:HTMLGenerator<HTMLHeadingElement> = newHtmlGenerator("h2")
export const h3:HTMLGenerator<HTMLHeadingElement> = newHtmlGenerator("h3")

export const div:HTMLGenerator<HTMLDivElement> = newHtmlGenerator("div")
export const pre:HTMLGenerator<HTMLDivElement> = newHtmlGenerator("pre")
export const button:HTMLGenerator<HTMLButtonElement> = newHtmlGenerator("button")
export const a:HTMLGenerator<HTMLAnchorElement> = newHtmlGenerator("a")
export const routeLink = (href: string, text = null, ...cs: HTMLArg[]) =>
  a(
    text ?? href,
    { href, onclick: (e) => {
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      history.pushState({}, "", href);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, style:{color:"inherit", textDecoration: "none", border: "1px solid #ccc", padding: "0.1em", borderRadius: "0.25em"}},
    ...cs
  );
export const span:HTMLGenerator<HTMLSpanElement> = newHtmlGenerator("span")

export const table:HTMLGenerator<HTMLTableElement> = newHtmlGenerator("table")
export const tr:HTMLGenerator<HTMLTableRowElement> = newHtmlGenerator("tr")
export const td:HTMLGenerator<HTMLTableCellElement> = newHtmlGenerator("td")
export const th:HTMLGenerator<HTMLTableCellElement> = newHtmlGenerator("th")

export const style = (...rules: Record<string, string>[]) => {
  return {style: Object.assign({}, ...rules)}
}

const textInput = (tag: string, cs:HTMLArg[])=>{
  const content = cs.filter(c=>typeof c == 'string').join(' ')
  const el = html(tag, ...cs) as HTMLInputElement | HTMLTextAreaElement
  el.value = content
  return el
}

export const input:HTMLGenerator<HTMLInputElement> = (...cs)=> textInput("input", cs) as HTMLInputElement
export const textarea:HTMLGenerator<HTMLTextAreaElement> = (...cs)=> textInput("textarea", cs) as HTMLTextAreaElement

export const popup = (...cs:HTMLArg[])=>{
  const dialogfield = div(
    {style: {
      background: "var(--background-color)",
      color: "var(--color)",
      padding: "1em",
      paddingBottom: "2em",
      borderRadius: "1em",
      zIndex: "2000",
      overflowY: "scroll",
    }},
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
    }}
  )

  popupbackground.appendChild(dialogfield);
  document.body.appendChild(popupbackground);

  const closePopup = () => {
    popupbackground.remove();
    document.removeEventListener("keydown", handleKeydown);
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") closePopup();
  };

  popupbackground.onclick = closePopup;
  document.addEventListener("keydown", handleKeydown);
  dialogfield.onclick = (e) => e.stopPropagation();
  return popupbackground
}
