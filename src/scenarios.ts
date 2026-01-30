import { NoteData, top } from "../spacetimedb/src/notes";
import { addNote } from "./dbconn";

const string = { type: "string" };
const table = { type: "array", items: { type: "array", items: string } };
const step = {
  type: "object",
  properties: { text: string, table },
  required: ["text"],
  additionalProperties: false,
};
const scenario_schema = NoteData("scenario_schema", top, {
  type: "object",
  properties: {
    title: string,
    given: { type: "array", items: step },
    when: { type: "array", items: step },
    then: { type: "array", items: step },
  },
  required: ["title", "given", "when", "then"],
  additionalProperties: false,
});

const roles_extracted = NoteData("roles_extracted", scenario_schema, {
  title: "The following roles should be extracted",
  given: [{
    text: "we extract roles from the following text",
    table: [
      ["legal text"],
      ["‘data holder’ means a financial institution other than an account information service provider   that collects, stores and otherwise processes  the data listed in Article 2(1) ;"],
      ["‘data user’ means any of the entities listed in Article 2(2) who, following the permission of a customer, has lawful access to customer data listed in Article 2(1) ;"],
      ["‘financial information service provider’ means a data user that is authorised under Article 14 to access the customer data listed in Article 2(1) for the provision of financial information services;"],
    ],
  }],
  when: [{ text: "roles have been extracted" }],
  then: [{
    text: "the following roles should be part of the output",
    table: [
      ["Role Name"],
      ["Data Holder"],
      ["Data User"],
      ["Financial Information Service Provider"],
    ],
  }],
});

const short_name_extracted = NoteData("short_name_extracted", scenario_schema, {
  title: "Short Name should be extracted WHEN the abbreviation is mentioned in the text",
  given: [{
    text: "the following role description",
    table: [
      ["Role description"],
      ["‘financial information service provider’ (FISP) means a data user that is authorised under Article 14 to access the customer data listed in Article 2(1) for the provision of financial information services;"],
    ],
  }],
  when: [{ text: "the short name is extracted" }],
  then: [{
    text: "the value should be",
    table: [["Short Name"], ["FISP"]],
  }],
});

const short_name_not_extracted = NoteData("short_name_not_extracted", scenario_schema, {
  title: "Short Name should NOT be extracted WHEN the abbreviation is NOT mentioned in the text",
  given: [{
    text: "the following role description",
    table: [
      ["Role description"],
      ["‘data holder’ means a financial institution other than an account information service provider   that collects, stores and otherwise processes  the data listed in Article 2(1) ; "],
    ],
  }],
  when: [{ text: "the short name is extracted" }],
  then: [{ text: "NO value is returned." }],
});



const scenarios = [roles_extracted, short_name_extracted, short_name_not_extracted]

export const insert_scenarios = async () => {

  await addNote(scenario_schema.schemaHash, scenario_schema.data)
  scenarios.forEach(s => {
    addNote(s.schemaHash, s.data)
  })


}


