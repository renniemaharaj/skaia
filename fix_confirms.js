const fs = require('fs');
const path = require('path');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;
            
            if (content.includes('window.confirm(')) {
                content = content.replace(/window\.confirm\(/g, 'await customConfirm(');
                modified = true;
            }
            if (content.match(/\bconfirm\(/)) {
                content = content.replace(/\bconfirm\(/g, 'await customConfirm(');
                modified = true;
            }
            
            if (modified) {
                if (!content.includes('import { customConfirm }')) {
                    const promptPath = path.resolve('/home/renniem/Workspace/docker/skaia/backend/frontend/src/components/ui/Prompt.tsx');
                    let relPath = path.relative(path.dirname(fullPath), promptPath);
                    relPath = relPath.replace(/\.tsx$/, '');
                    if (!relPath.startsWith('.')) relPath = './' + relPath;
                    content = `import { customConfirm } from "${relPath}";\n` + content;
                }
                fs.writeFileSync(fullPath, content);
                console.log('Updated ' + fullPath);
            }
        }
    }
}

processDir('/home/renniem/Workspace/docker/skaia/backend/frontend/src');
