import re

def fix_mfarequired():
    with open('mfarequired.go', 'r') as f:
        content = f.read()
    
    # authSvc.Method(args...) -> authSvc.Method(r.Context(), args...)
    # Some don't have args? e.g. authSvc.Method() -> authSvc.Method(r.Context())
    content = re.sub(r'authSvc\.([A-Z]\w*)\(\)', r'authSvc.\1(r.Context())', content)
    content = re.sub(r'authSvc\.([A-Z]\w*)\((?!\s*r\.Context\(\))', r'authSvc.\1(r.Context(), ', content)
    
    with open('mfarequired.go', 'w') as f:
        f.write(content)

fix_mfarequired()
