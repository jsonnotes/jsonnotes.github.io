import { createApi, server } from "@jsonview/lib";

let access_token: string | null = localStorage.getItem("access_token");
export const api = createApi({ server, accessToken: access_token });

if (access_token === null) {
  api.req("/v1/identity", "POST").then((res) => res.json()).then((text) => {
    access_token = text.token;
    api.setAccessToken(access_token);
  });
}
