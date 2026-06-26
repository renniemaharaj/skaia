package bench

import "goftw/internal/entity"

var (
	appsForReact = []entity.AppForReact{
		{
			Name:        "erpnext",
			Description: "ERPNext is a comprehensive open source ERP system for businesses.",
			// Asset:       "/assets/erpnext/logo.png", // or whatever frappe provides
		},
		{
			Name:        "builder",
			Description: "Builder helps you visually design and customize Frappe apps.",
			// Asset:       "/assets/builder/logo.png",
		},
		{
			Name:        "frappe",
			Description: "Frappe Framework is a full-stack web application framework in Python & JS.",
			// Asset:       "/assets/frappe/logo.png",
		},
		{
			Name:        "hrms",
			Description: "HRMS provides human resource management features like payroll, leave, and attendance.",
			// Asset:       "/assets/hrms/logo.png",
		},
		{
			Name:        "lending",
			Description: "Lending app for managing loan requests, approvals, and repayments.",
			// Asset:       "/assets/lending/logo.png",
		},
		{
			Name:        "helpdesk",
			Description: "Helpdesk app to manage support tickets and customer queries.",
			// Asset:       "/assets/helpdesk/logo.png",
		},
		{
			Name:        "crm",
			Description: "CRM app to manage leads, opportunities, and customer relationships.",
			// Asset:       "/assets/crm/logo.png",
		},
		{
			Name:        "insights",
			Description: "Insights provides analytics and reporting tools within the Frappe ecosystem.",
			// Asset:       "/assets/insights/logo.png",
		},
		{
			Name:        "blog",
			Description: "Blog app for publishing articles and managing content.",
			// Asset:       "/assets/blog/logo.png",
		},
	}
)

func GetAppsForReact() []entity.AppForReact {
	return appsForReact
}
