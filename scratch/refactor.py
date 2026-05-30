import re
import os
import sys

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Find all methods on *Service
    # e.g., func (s *Service) MethodName(param type, param2 type) returnType {
    
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if line.startswith('func (s *Service)'):
            # If it already has ctx context.Context, skip
            if 'ctx context.Context' in line:
                pass
            else:
                # Add ctx context.Context as first param
                # Find the first '(' after Service)
                idx = line.find('(', 18)
                if idx != -1:
                    # check if it's empty args
                    if line[idx+1] == ')':
                        lines[i] = line[:idx+1] + 'ctx context.Context' + line[idx+1:]
                    else:
                        lines[i] = line[:idx+1] + 'ctx context.Context, ' + line[idx+1:]
        
        # Replace context.Background() with ctx
        lines[i] = lines[i].replace('context.Background()', 'ctx')
        
    with open(filepath, 'w') as f:
        f.write('\n'.join(lines))

if __name__ == '__main__':
    process_file(sys.argv[1])
