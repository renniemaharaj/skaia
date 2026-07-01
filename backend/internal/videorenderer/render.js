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
  const workDir = process.argv[2] || __dirname;
  const outFile = process.argv[3] || path.join(workDir, 'output.mp4');

  fs.mkdirSync(workDir, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'project.tsx'), path.join(workDir, 'project.tsx'));
  fs.writeFileSync(path.join(workDir, 'project.json'), JSON.stringify(projectData, null, 2));

  try {
    const resultPath = await renderVideo({
      projectFile: path.join(workDir, 'project.tsx'),
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
