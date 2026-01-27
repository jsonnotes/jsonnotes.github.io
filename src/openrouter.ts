import { hash128 } from "../spacetimedb/src/hash";
import { h2, input, p, popup, style } from "./html";
import { Stored } from "./store";

const OPENROUTER_API_KEY = new Stored("$$"+hash128("openrouter"), "")

export const openrouter = async (prompt: string, schema: any) => {

  if (await OPENROUTER_API_KEY.get() === "") {
    popup(  
      p("Please enter your OpenRouter API key to use the LLM feature"),
      input(OPENROUTER_API_KEY, style({width:"100%"}))
    )
    await new Promise<string>((resolve, reject) => {
      OPENROUTER_API_KEY.subscribeLater((key) => {
        if (key) resolve(key)
      })
    })
  }


  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await OPENROUTER_API_KEY.get()}`,
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
    console.log("openrouter response:", data)
    return data
  }
}
