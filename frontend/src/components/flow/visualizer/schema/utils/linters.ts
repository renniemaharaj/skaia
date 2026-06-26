// Linters
const linterRegexSetup = [
  /@\s*(.+)/g, // Handles `@comment`
  /(\/\/\s*.+)/g, // Handles `// comment`
  /\/\*\s*(.|\n)*?\*\//g, // Handles `/* comment */`
];

export default linterRegexSetup;
