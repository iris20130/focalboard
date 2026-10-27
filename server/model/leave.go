// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

// Leave record kinds and actions
const (
	LeaveKindAnnual = "annual" // 年假
	LeaveKindComp   = "comp"   // 调休

	LeaveActionGrant = "grant" // 系统发放年假
	LeaveActionAdd   = "add"   // 调休增加（加班）
	LeaveActionUse   = "use"   // 消耗（请假/调休）
	LeaveActionVoid  = "void"  // 到期作废（读取时合成，不落库）
)

// LeaveRecord is one entry of a user's leave ledger, persisted as JSON in the
// user preferences under the leaveRecords key.
type LeaveRecord struct {
	ID        string  `json:"id"`
	Kind      string  `json:"kind"`
	Action    string  `json:"action"`
	Date      string  `json:"date"` // YYYY-MM-DD
	Days      float64 `json:"days"`
	Note      string  `json:"note,omitempty"`
	Expires   string  `json:"expires,omitempty"` // grant/add only
	CreatedAt int64   `json:"createdAt,omitempty"`
}

// LeaveSettings holds per-user work seniority and expiry configuration.
// A record accumulated in calendar year Y expires on (Y+ExpireYears)-ExpireMonth-ExpireDay
// (e.g. comp days earned in 2026 with years=1 clear on 2027-04-30; years=0 means the
// same-year date).
type LeaveSettings struct {
	WorkStartDate     string            `json:"workStartDate"` // YYYY-MM-DD, drives annual tier
	AnnualExpireYears int               `json:"annualExpireYears"`
	AnnualExpireMonth int               `json:"annualExpireMonth"`
	AnnualExpireDay   int               `json:"annualExpireDay"`
	CompExpireYears   int               `json:"compExpireYears"`
	CompExpireMonth   int               `json:"compExpireMonth"`
	CompExpireDay     int               `json:"compExpireDay"`
	Colors            map[string]string `json:"colors,omitempty"` // overtime/compLeave/annualLeave/term
}

// LeaveBalance is the computed balance for one kind.
type LeaveBalance struct {
	Kind             string  `json:"kind"`
	Total            float64 `json:"total"`     // non-expired grants/adds
	Used             float64 `json:"used"`      // consumption allocated to them
	Available        float64 `json:"available"` // Total - Used
	Expired          float64 `json:"expired"`   // voided remainder
	NextExpire       string  `json:"nextExpire,omitempty"`       // upcoming clear date YYYY-MM-DD
	ExpireWorkdays   int     `json:"expireWorkdays,omitempty"`   // weekday count from today to NextExpire
}

// LeaveSummary is returned by GET /api/v2/leaves/summary.
type LeaveSummary struct {
	Settings LeaveSettings  `json:"settings"`
	Balances []LeaveBalance `json:"balances"`
	Records  []LeaveRecord  `json:"records"` // current period, chronological, includes synthesized void rows
}
