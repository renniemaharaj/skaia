import os
import re

def clean_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    
    # 1. Remove multi-line AI descriptive block comments entirely
    pattern_multiline = r'\/\*[ ─]+\n.*?\n\s*(?:\*)?[ ─]+\*\/'
    content = re.sub(pattern_multiline, '', content, flags=re.DOTALL)
    
    # 2. Clean single-line block comments: /* ── Text ── */ -> /* Text */
    pattern_single_block = r'\/\*[ ─]+([^─\n]*?)[ ─]+\*\/'
    content = re.sub(pattern_single_block, lambda m: '/* ' + m.group(1).strip() + ' */' if m.group(1).strip() else '', content)

    # 3. Clean single-line inline comments: // ── Text ── -> // Text
    pattern_inline = r'\/\/[ ─]+([^─\n]*?)[ ─]+$'
    content = re.sub(pattern_inline, lambda m: '// ' + m.group(1).strip() if m.group(1).strip() else '', content, flags=re.MULTILINE)
    
    # 4. Clean SQL style comments: -- ── Text ── -> -- Text
    pattern_sql = r'--[ ─]+([^─\n]*?)[ ─]+$'
    content = re.sub(pattern_sql, lambda m: '-- ' + m.group(1).strip() if m.group(1).strip() else '', content, flags=re.MULTILINE)

    # 5. Remove any remaining lines containing just // ──── or -- ───
    content = re.sub(r'\/\/[ ─]+$', '', content, flags=re.MULTILINE)
    content = re.sub(r'--[ ─]+$', '', content, flags=re.MULTILINE)
    
    # 6. Clean up any stray box drawing characters inside remaining comments
    def clean_comment_chars(m):
        c = m.group(0)
        c = c.replace('─', '').replace('—', '-').replace('‑', '-')
        return c

    content = re.sub(r'\/\*.*?\*\/', clean_comment_chars, content, flags=re.DOTALL)
    content = re.sub(r'\/\/.*$', clean_comment_chars, content, flags=re.MULTILINE)
    content = re.sub(r'--.*$', clean_comment_chars, content, flags=re.MULTILINE)

    if content != original:
        # Also clean up multiple blank lines left by removing block comments
        content = re.sub(r'\n{3,}', '\n\n', content)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Cleaned {path}")

# Run on all files
exclude_dirs = {'.git', 'node_modules', 'vendor', 'dist', 'build'}
for root, dirs, files in os.walk('/home/renniem/Workspace/docker/skaia'):
    dirs[:] = [d for d in dirs if d not in exclude_dirs]
    for f in files:
        if f.endswith(('.ts', '.tsx', '.css', '.js', '.go', '.sql')):
            clean_file(os.path.join(root, f))
