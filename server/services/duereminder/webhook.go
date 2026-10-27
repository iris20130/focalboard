package duereminder

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Send dispatches the text message to the configured channel type.
func Send(channel, webhookURL, secret, text string) error {
	switch channel {
	case "wecom":
		return sendWecom(webhookURL, text)
	case "dingtalk":
		return sendDingtalk(webhookURL, secret, text)
	case "ftqq":
		return sendFTQQ(webhookURL, text)
	case "custom":
		return sendCustom(webhookURL, secret, text)
	default:
		return SendFeishu(webhookURL, secret, text)
	}
}

func postJSON(webhookURL string, payload interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post(webhookURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("webhook returned HTTP %d: %s", resp.StatusCode, string(responseBody))
	}
	return checkBizError(responseBody)
}

func checkBizError(responseBody []byte) error {
	var result struct {
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
		Code    int    `json:"code"`
		Msg     string `json:"msg"`
		ErrNo   int    `json:"errno"`
	}
	if err := json.Unmarshal(responseBody, &result); err != nil {
		return nil
	}
	if result.ErrCode != 0 {
		return fmt.Errorf("webhook error %d: %s", result.ErrCode, result.ErrMsg)
	}
	if result.Code != 0 {
		return fmt.Errorf("webhook error %d: %s", result.Code, result.Msg)
	}
	if result.ErrNo != 0 {
		return fmt.Errorf("webhook error %d", result.ErrNo)
	}
	return nil
}

// SendFeishu posts a plain text message to a Feishu (Lark) custom bot webhook.
// When secret is set, the request is signed according to Feishu's custom bot
// signature scheme.
func SendFeishu(webhookURL, secret, text string) error {
	payload := map[string]interface{}{
		"msg_type": "text",
		"content": map[string]string{
			"text": text,
		},
	}

	if secret != "" {
		timestamp := time.Now().Unix()
		stringToSign := fmt.Sprintf("%d\n%s", timestamp, secret)
		mac := hmac.New(sha256.New, []byte(stringToSign))
		sign := base64.StdEncoding.EncodeToString(mac.Sum(nil))
		payload["timestamp"] = strconv.FormatInt(timestamp, 10)
		payload["sign"] = sign
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post(webhookURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("feishu webhook returned HTTP %d: %s", resp.StatusCode, string(responseBody))
	}

	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
	}
	if err := json.Unmarshal(responseBody, &result); err == nil && result.Code != 0 && result.Code != 19001 {
		return fmt.Errorf("feishu webhook error %d: %s", result.Code, result.Msg)
	}
	return nil
}

// sendWecom posts to a WeCom (企业微信) group bot. Markdown keeps long
// multi-line reminder bodies readable, so markdown type is preferred.
func sendWecom(webhookURL, text string) error {
	payload := map[string]interface{}{
		"msgtype": "markdown",
		"markdown": map[string]string{
			"content": text,
		},
	}
	return postJSON(webhookURL, payload)
}

// sendDingtalk posts to a DingTalk (钉钉) custom robot. When secret is set
// (形如 SECxxx), it appends the timestamp+HMAC-SHA256 signature query.
func sendDingtalk(webhookURL, secret, text string) error {
	target := webhookURL
	if secret != "" {
		timestamp := strconv.FormatInt(time.Now().UnixMilli(), 10)
		stringToSign := timestamp + "\n" + secret
		mac := hmac.New(sha256.New, []byte(stringToSign))
		sign := url.QueryEscape(base64.StdEncoding.EncodeToString(mac.Sum(nil)))
		sep := "&"
		if !strings.Contains(target, "?") {
			sep = "?"
		}
		target = fmt.Sprintf("%s%stimestamp=%s&sign=%s", target, sep, timestamp, sign)
	}
	payload := map[string]interface{}{
		"msgtype": "text",
		"text": map[string]string{
			"content": text,
		},
	}
	return postJSON(target, payload)
}

// sendFTQQ posts to Server酱 (方糖, ftqq.com): title + desp, key is the
// webhook URL's token part (sendkey).
func sendFTQQ(webhookURL, text string) error {
	lines := strings.SplitN(text, "\n", 2)
	title := "Focalboard 到期提醒"
	if len(lines) > 0 && lines[0] != "" {
		title = lines[0]
	}
	desp := text
	if len(lines) > 1 {
		desp = lines[1]
	}
	form := url.Values{}
	form.Set("title", title)
	form.Set("desp", desp)
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.PostForm(webhookURL, form)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("ftqq webhook returned HTTP %d: %s", resp.StatusCode, string(responseBody))
	}
	return nil
}

// sendCustom posts {"text": ...} (plus {"secret": ...} when set) to any
// user-provided JSON endpoint, for platforms without a preset above.
func sendCustom(webhookURL, secret, text string) error {
	payload := map[string]string{"text": text}
	if secret != "" {
		payload["secret"] = secret
	}
	return postJSON(webhookURL, payload)
}
