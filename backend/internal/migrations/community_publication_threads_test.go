package migrations

import (
	"os"
	"strings"
	"testing"
)

func TestCommunityPublicationThreadsHaveFreshAndIncrementalParity(t *testing.T) {
	fresh, err := os.ReadFile("001_schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	incremental, err := os.ReadFile("047_community_publication_threads.sql")
	if err != nil {
		t.Fatal(err)
	}

	for _, contract := range []string{
		"Community Discussions",
		"canonical_thread_id BIGINT NOT NULL UNIQUE",
		"FOREIGN KEY(canonical_thread_id,author_id)",
		"REFERENCES forum_threads(id,user_id)",
	} {
		if !strings.Contains(string(fresh), contract) {
			t.Errorf("fresh schema missing community-thread contract %q", contract)
		}
	}

	for _, contract := range []string{
		"thread_owner_id IS DISTINCT FROM publication_row.author_id",
		"ALTER COLUMN canonical_thread_id SET NOT NULL",
		"idx_community_publications_canonical_thread_id",
		"community_publications_thread_owner_fkey",
	} {
		if !strings.Contains(string(incremental), contract) {
			t.Errorf("migration 047 missing community-thread contract %q", contract)
		}
	}
}
