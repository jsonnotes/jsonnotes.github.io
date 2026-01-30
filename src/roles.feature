Feature: Extracting Roles from FiDA
This feature describes how short names can be extracted from the FiDA text as well as what roles should be extracted.

Scenario: The following roles should be extracted
/** The following three roles must always be extracted. **/
Given that we extract roles from the following text
| legal text |
| "‘data holder’ means a financial institution other than an account information service provider   that collects, stores and otherwise processes  the data listed in Article 2(1) ;" |
| "‘data user’ means any of the entities listed in Article 2(2) who, following the permission of a customer, has lawful access to customer data listed in Article 2(1) ;" |
| "‘financial information service provider’ means a data user that is authorised under Article 14 to access the customer data listed in Article 2(1) for the provision of financial information services;" |
When roles have been extracted
Then the following roles should be part of the output
| Role Name |
| "Data Holder" |
| "Data User" |
| "Financial Information Service Provider" |

Scenario: Short Name should be extracted WHEN the abbreviation is mentioned in the text
Given the following role description,
| Role description |
| "‘financial information service provider’ (FISP) means a data user that is authorised under Article 14 to access the customer data listed in Article 2(1) for the provision of financial information services;" |
When the short name is extracted
Then the value should be
| Short Name |
| "FISP" |

Scenario: Short Name should NOT be extracted WHEN the abbreviation is NOT mentioned in the text
Given the following role description,
| Role description |
| "‘data holder’ means a financial institution other than an account information service provider   that collects, stores and otherwise processes  the data listed in Article 2(1) ; " |
When the short name is extracted
Then NO value is returned.