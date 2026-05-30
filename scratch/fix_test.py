import re

with open('service_test.go', 'r') as f:
    content = f.read()

# Replace svc.Method() -> svc.Method(context.Background())
content = re.sub(r'svc\.([A-Z]\w*)\(\)', r'svc.\1(context.Background())', content)
# Replace svc.Method(arg, ...) -> svc.Method(context.Background(), arg, ...)
content = re.sub(r'svc\.([A-Z]\w*)\((?!\s*context\.Background\(\))', r'svc.\1(context.Background(), ', content)

with open('service_test.go', 'w') as f:
    f.write(content)
