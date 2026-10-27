package assets

import (
	_ "embed"
)

// DefaultTemplatesArchive is an embedded archive file containing the default
// templates to be imported to team 0.
// This archive is generated with `make templates-archive`
//
//go:embed templates.boardarchive
var DefaultTemplatesArchive []byte

// DefaultTemplatesArchiveZH is the Simplified Chinese copy of the default
// templates. Only interface-visible strings are translated; card bodies are
// kept in English. Generated with `make templates-archive-zh`.
//
//go:embed templates-zh.boardarchive
var DefaultTemplatesArchiveZH []byte
