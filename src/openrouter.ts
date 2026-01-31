import { hash128 } from "../spacetimedb/src/hash";
import { h2, input, p, popup, style } from "./html";


const storekey = "$"+hash128("openrouter")



let OPENROUTER_API_KEY = localStorage.getItem(storekey) || ""

export const openrouter = async (prompt: string, schema: any) => {

  if (OPENROUTER_API_KEY === "") {
    await new Promise<void>((resolve, reject) => {

      let inp = input()
      
      let pop = popup(
        p("Please enter your OpenRouter API key to use the LLM feature"),
        inp
      )

      inp.addEventListener("keydown", e=>{
        if (e.key == "Enter"){
          OPENROUTER_API_KEY = inp.value
          localStorage.setItem(storekey, OPENROUTER_API_KEY)
          resolve()
          pop.remove()
        }
      })
    })
  }


  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/gpt-4o",
      messages: [{role: "user",content: prompt}],
      "response_format": { "type": "json_schema", json_schema: {"name": "response", "schema": schema}}

    })
  });

  const data = await response.json();
  try{
    return JSON.parse(data.choices[0].message.content);
  }catch {
    // console.log("openrouter response:", data)
    return data
  }
}
