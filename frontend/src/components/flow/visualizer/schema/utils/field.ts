// Field dialects
const fieldRegexExtractors = [
  /\s+(\w+)\s+([\w[\]?]+)/g, // Handles `name type`
  /(\w+)\??\s*:\s*(.+?);/g, // Handles `name: type; & name?: type;`
];

export default fieldRegexExtractors;
