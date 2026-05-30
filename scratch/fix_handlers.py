import re

with open('handlers.go', 'r') as f:
    content = f.read()

content = content.replace('func (h *Handler) newAuthUser(user *models.User)', 'func (h *Handler) newAuthUser(ctx context.Context, user *models.User)')
content = content.replace('h.svc.GetTOTPEnabled(r.Context(), user.ID)', 'h.svc.GetTOTPEnabled(ctx, user.ID)')
content = content.replace('h.newAuthUser(updatedUser)', 'h.newAuthUser(r.Context(), updatedUser)')
content = content.replace('h.newAuthUser(user)', 'h.newAuthUser(r.Context(), user)')

with open('handlers.go', 'w') as f:
    f.write(content)
