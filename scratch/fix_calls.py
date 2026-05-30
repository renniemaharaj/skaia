import re
import glob

def fix_service_go():
    with open('service.go', 'r') as f:
        content = f.read()
    
    # Fix internal calls
    content = re.sub(r's\.generateAccessToken\(([^c])', r's.generateAccessToken(ctx, \1', content)
    content = re.sub(r's\.generateRefreshToken\(([^c])', r's.generateRefreshToken(ctx, \1', content)
    
    with open('service.go', 'w') as f:
        f.write(content)

def fix_handlers():
    files = glob.glob('*.go')
    for file in files:
        if file == 'service.go' or file == 'repository.go' or file == 'password.go' or file == 'validation.go' or file == 'interface.go':
            continue
        
        with open(file, 'r') as f:
            content = f.read()
            
        if file.endswith('_test.go'):
            # In tests, it's s.svc.Method(args...)
            content = re.sub(r's\.svc\.([A-Z]\w*)\(\)', r's.svc.\1(context.Background())', content)
            content = re.sub(r's\.svc\.([A-Z]\w*)\((?!\s*context\.Background\(\))', r's.svc.\1(context.Background(), ', content)
            # Also newTestService doesn't need context
        else:
            # In handlers, it's h.svc.Method(args...)
            content = re.sub(r'h\.svc\.([A-Z]\w*)\(\)', r'h.svc.\1(r.Context())', content)
            content = re.sub(r'h\.svc\.([A-Z]\w*)\((?!\s*r\.Context\(\))', r'h.svc.\1(r.Context(), ', content)
            
        with open(file, 'w') as f:
            f.write(content)

fix_service_go()
fix_handlers()
