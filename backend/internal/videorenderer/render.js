const fs = require('fs');
const path = require('path');
const { renderVideo } = require('@twick/renderer');

async function main() {
  // Read project JSON from stdin
  const chunks = [];
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const jsonStr = chunks.join('');
  const projectData = JSON.parse(jsonStr);

  // Write it to project.json so project.tsx can import it
  fs.writeFileSync(path.join(__dirname, 'project.json'), JSON.stringify(projectData, null, 2));

  // Determine output file
  const outFile = path.join(__dirname, 'output.mp4');

  try {
    const resultPath = await renderVideo({
      projectFile: path.join(__dirname, 'project.tsx'),
      settings: {
        outFile: outFile,
        logProgress: false
      }
    });

    console.log(JSON.stringify({ status: 'success', file: resultPath }));
  } catch (error) {
    console.error("Render failed:", error);
    console.log(JSON.stringify({ status: 'error', message: error.message }));
    process.exit(1);
  }
}

main();
