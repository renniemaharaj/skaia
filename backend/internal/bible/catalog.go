package bible

type catalogBook struct {
	title         string
	slug          string
	testament     string
	division      string
	divisionOrder int
	bookOrder     int
}

// canonicalCatalog stays in standard biblical order because that exact order is
// part of the tracked corpus fingerprint. Division order preserves the legacy
// TheWriterCo picker, which presents New Testament groupings first.
var canonicalCatalog = []catalogBook{
	{"Genesis", "genesis", "Old Testament", "The Pentateuch", 6, 1},
	{"Exodus", "exodus", "Old Testament", "The Pentateuch", 6, 2},
	{"Leviticus", "leviticus", "Old Testament", "The Pentateuch", 6, 3},
	{"Numbers", "numbers", "Old Testament", "The Pentateuch", 6, 4},
	{"Deuteronomy", "deuteronomy", "Old Testament", "The Pentateuch", 6, 5},
	{"Joshua", "joshua", "Old Testament", "Historical Books", 7, 1},
	{"Judges", "judges", "Old Testament", "Historical Books", 7, 2},
	{"Ruth", "ruth", "Old Testament", "Historical Books", 7, 3},
	{"1 Samuel", "1-samuel", "Old Testament", "Historical Books", 7, 4},
	{"2 Samuel", "2-samuel", "Old Testament", "Historical Books", 7, 5},
	{"1 Kings", "1-kings", "Old Testament", "Historical Books", 7, 6},
	{"2 Kings", "2-kings", "Old Testament", "Historical Books", 7, 7},
	{"1 Chronicles", "1-chronicles", "Old Testament", "Historical Books", 7, 8},
	{"2 Chronicles", "2-chronicles", "Old Testament", "Historical Books", 7, 9},
	{"Ezra", "ezra", "Old Testament", "Historical Books", 7, 10},
	{"Nehemiah", "nehemiah", "Old Testament", "Historical Books", 7, 11},
	{"Esther", "esther", "Old Testament", "Historical Books", 7, 12},
	{"Job", "job", "Old Testament", "Wisdom Books", 8, 1},
	{"Psalms", "psalms", "Old Testament", "Wisdom Books", 8, 2},
	{"Proverbs", "proverbs", "Old Testament", "Wisdom Books", 8, 3},
	{"Ecclesiastes", "ecclesiastes", "Old Testament", "Wisdom Books", 8, 4},
	{"Song of Solomon", "song-of-solomon", "Old Testament", "Wisdom Books", 8, 5},
	{"Isaiah", "isaiah", "Old Testament", "Prophetic Books", 9, 1},
	{"Jeremiah", "jeremiah", "Old Testament", "Prophetic Books", 9, 2},
	{"Lamentations", "lamentations", "Old Testament", "Prophetic Books", 9, 3},
	{"Ezekiel", "ezekiel", "Old Testament", "Prophetic Books", 9, 4},
	{"Daniel", "daniel", "Old Testament", "Prophetic Books", 9, 5},
	{"Hosea", "hosea", "Old Testament", "Prophetic Books", 9, 6},
	{"Joel", "joel", "Old Testament", "Prophetic Books", 9, 7},
	{"Amos", "amos", "Old Testament", "Prophetic Books", 9, 8},
	{"Obadiah", "obadiah", "Old Testament", "Prophetic Books", 9, 9},
	{"Jonah", "jonah", "Old Testament", "Prophetic Books", 9, 10},
	{"Micah", "micah", "Old Testament", "Prophetic Books", 9, 11},
	{"Nahum", "nahum", "Old Testament", "Prophetic Books", 9, 12},
	{"Habakkuk", "habakkuk", "Old Testament", "Prophetic Books", 9, 13},
	{"Zephaniah", "zephaniah", "Old Testament", "Prophetic Books", 9, 14},
	{"Haggai", "haggai", "Old Testament", "Prophetic Books", 9, 15},
	{"Zechariah", "zechariah", "Old Testament", "Prophetic Books", 9, 16},
	{"Malachi", "malachi", "Old Testament", "Prophetic Books", 9, 17},
	{"Matthew", "matthew", "New Testament", "Canonical Gospels", 1, 1},
	{"Mark", "mark", "New Testament", "Canonical Gospels", 1, 2},
	{"Luke", "luke", "New Testament", "Canonical Gospels", 1, 3},
	{"John", "john", "New Testament", "Canonical Gospels", 1, 4},
	{"Acts", "acts", "New Testament", "Acts of the Apostles", 2, 1},
	{"Romans", "romans", "New Testament", "Epistles of Paul", 3, 1},
	{"1 Corinthians", "1-corinthians", "New Testament", "Epistles of Paul", 3, 2},
	{"2 Corinthians", "2-corinthians", "New Testament", "Epistles of Paul", 3, 3},
	{"Galatians", "galatians", "New Testament", "Epistles of Paul", 3, 4},
	{"Ephesians", "ephesians", "New Testament", "Epistles of Paul", 3, 5},
	{"Philippians", "philippians", "New Testament", "Epistles of Paul", 3, 6},
	{"Colossians", "colossians", "New Testament", "Epistles of Paul", 3, 7},
	{"1 Thessalonians", "1-thessalonians", "New Testament", "Epistles of Paul", 3, 8},
	{"2 Thessalonians", "2-thessalonians", "New Testament", "Epistles of Paul", 3, 9},
	{"1 Timothy", "1-timothy", "New Testament", "Epistles of Paul", 3, 10},
	{"2 Timothy", "2-timothy", "New Testament", "Epistles of Paul", 3, 11},
	{"Titus", "titus", "New Testament", "Epistles of Paul", 3, 12},
	{"Philemon", "philemon", "New Testament", "Epistles of Paul", 3, 13},
	{"Hebrews", "hebrews", "New Testament", "Epistles of Paul", 3, 14},
	{"James", "james", "New Testament", "General Epistles", 4, 1},
	{"1 Peter", "1-peter", "New Testament", "General Epistles", 4, 2},
	{"2 Peter", "2-peter", "New Testament", "General Epistles", 4, 3},
	{"1 John", "1-john", "New Testament", "General Epistles", 4, 4},
	{"2 John", "2-john", "New Testament", "General Epistles", 4, 5},
	{"3 John", "3-john", "New Testament", "General Epistles", 4, 6},
	{"Jude", "jude", "New Testament", "General Epistles", 4, 7},
	{"Revelation", "revelation", "New Testament", "Book of Revelation", 5, 1},
}
