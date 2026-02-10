import { hash128 } from "@jsonview/core/hash";
import { openrouterCall } from "@jsonview/lib";
import { input, p, popup } from "./html";


const storekey = "$"+hash128("openrouter")



let OPENROUTER_API_KEY = localStorage.getItem(storekey) || ""

export const openrouter = async (prompt: string, schema: any, model = "openai/gpt-4o") => {

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

  return openrouterCall({
    apiKey: OPENROUTER_API_KEY,
    prompt,
    schema,
    model,
  });
}
