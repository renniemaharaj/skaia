import re

with open('handlers.go', 'r') as f:
    content = f.read()
content = content.replace('func (h *Handler) propagateAuthUser(userID int64, extra map[string]interface{}) {', 'func (h *Handler) propagateAuthUser(ctx context.Context, userID int64, extra map[string]interface{}) {')
content = content.replace('h.propagateAuthUser(user.ID, map[string]interface{}{"new_token": accessToken})', 'h.propagateAuthUser(r.Context(), user.ID, map[string]interface{}{"new_token": accessToken})')
with open('handlers.go', 'w') as f:
    f.write(content)

with open('hndle_totp.go', 'r') as f:
    content = f.read()
content = content.replace('h.propagateAuthUser(user.ID, map[string]interface{}{"new_token": accessToken})', 'h.propagateAuthUser(r.Context(), user.ID, map[string]interface{}{"new_token": accessToken})')
content = content.replace('h.propagateAuthUser(userID, nil)', 'h.propagateAuthUser(r.Context(), userID, nil)')
content = content.replace('h.propagateAuthUser(targetID, nil)', 'h.propagateAuthUser(r.Context(), targetID, nil)')
with open('hndle_totp.go', 'w') as f:
    f.write(content)
