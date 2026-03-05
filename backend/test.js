const axios = require("axios");

const testCode = `#include <iostream>
int main() {
  std::cout << "Hello World";
  return 0;
}`;

axios.post("https://emkc.org/api/v2/piston/execute", {
  language: "c++",
  version: "*",
  files: [{ name: "main.cpp", content: testCode }]
})
.then(r => console.log("Success:", JSON.stringify(r.data, null, 2)))
.catch(e => console.log("Error:", e.response?.status, JSON.stringify(e.response?.data, null, 2) || e.message));
