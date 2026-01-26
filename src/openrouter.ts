import { hash128 } from "../spacetimedb/src/hash";
import { h2, input, popup } from "./html";
import { Stored } from "./store";

const OPENROUTER_API_KEY = new Stored("$$"+hash128("openrouter"), "")

export const openrouter = async (prompt: string) => {

  if (await OPENROUTER_API_KEY.get() === "") {
    popup(  
      h2("Please enter your OpenRouter API key to use the LLM feature"),
      input(OPENROUTER_API_KEY)
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
      "Authorization": `Bearer ${await OPENROUTER_API_KEY.get()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "model": "mistralai/mistral-7b-instruct:free",
      "messages": [
        {
          "role": "user",
          "content": prompt
        }
      ]
    })
  });

  const data = await response.json();
  console.log(data.choices[0].message.content);
  return data.choices[0].message.content;
}
