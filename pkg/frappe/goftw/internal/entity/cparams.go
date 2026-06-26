package entity

type CheckoutSiteParams struct {
	AddMissingSites    bool
	DropExtraSites     bool
	CheckoutAppsParams CheckoutAppsParams
}

type CheckoutAppsParams struct {
	AddMissingApps  bool
	DropExtraApps   bool
	IncludeRepoApps bool
}
