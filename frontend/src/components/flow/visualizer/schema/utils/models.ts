// Model dialects
const modelRegexExtractors = [
  // /(\w+)\s*{[^}]*}/g, // Handles `name { ... }`
  //   /\s+table\s+`(\w+)`\s\(([^\;])*/,
  /model\s+(\w+)\s*{[^}]*}/g, // Handles `model name { ... }`
  /type\s+(\w+)\s+struct\s*{[^}]*}/g, // Handles `type name struct { ... }`
  /\s*?interface\s*?(\w+)\s*{[^}]*}/g, // Handles `interface name { ... }`
  /type\s+(\w+)\s*=\s{[^}]*}/g, // Handles `type name = { ... }`
];

export default modelRegexExtractors;
