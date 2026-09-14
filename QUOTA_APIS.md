# Quota APIs

This document describes every upstream quota API used by the Management Center:

- Antigravity
- Claude
- Codex
- Cursor
- Kimi
- OpenCode Go
- xAI/Grok

It documents the current implementation and live response observations made on
2026-07-14. Examples redact tokens, account IDs, email addresses, user IDs, and
credit IDs.

## Common request flow

The Management Center does not expose provider OAuth tokens to the browser. For
each manual quota refresh, it calls the proxy's management relay:

```text
Browser -> POST /api/v0/management/api-call -> provider upstream API
```

The relay request has this shape:

```json
{
  "authIndex": "<selected auth-file index>",
  "method": "GET",
  "url": "https://provider.example/path",
  "header": {
    "Authorization": "Bearer $TOKEN$"
  },
  "data": ""
}
```

`$TOKEN$` is substituted server-side from the selected auth file. The relay
returns the upstream status, headers, and body:

```json
{
  "status_code": 200,
  "header": { "content-type": ["application/json"] },
  "body": "<upstream response body as a string>"
}
```

Do not put access tokens, refresh tokens, raw account IDs, or user IDs in this
document, frontend code, logs, or screenshots.

When quota-drain routing is enabled, the backend also refreshes and caches
provider snapshots every five minutes. The automatic collector keeps tokens on
the server and does not delay or rate-limit a user-triggered manual refresh.

## Provider summary

| Provider | Upstream endpoint(s) | Request pattern |
| --- | --- | --- |
| Antigravity | `retrieveUserQuotaSummary` on three fallback hosts | `POST` with a Google project ID |
| Claude | `/api/oauth/usage`, `/api/oauth/profile` | Two parallel `GET` requests |
| Codex | `/backend-api/wham/usage`, reset-credit endpoints | `GET`; manual reset is an explicit `POST` |
| Cursor | `DashboardService/GetCurrentPeriodUsage`, `GetPlanInfo`, `GetSandUsageStatus` | Three parallel authenticated `POST` requests |
| Kimi | `/coding/v1/usages` | `GET` |
| OpenCode Go | `/zen/go/v1/usage` | `GET` with the account API key |
| Devin CLI | `SeatManagementService/GetUserStatus` on `server.codeium.com` | Connect-RPC `POST`; the API key travels in the body |
| xAI/Grok | `/v1/billing?format=credits`, `/v1/billing` | Two parallel `GET` requests |

## Antigravity

### Endpoints

The UI tries these endpoints in order, stopping at the first successful quota
response:

```http
POST https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary
POST https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:retrieveUserQuotaSummary
POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary
```

### Headers and body

```http
Authorization: Bearer <access_token>
Content-Type: application/json
User-Agent: antigravity/cli/1.0.13 (aidev_client; os_type=darwin; arch=arm64)
```

```json
{ "project": "<Google project ID>" }
```

The project ID is resolved from the auth-file metadata or the auth file itself.

### Expected response shape

```ts
type AntigravityQuotaResponse = {
  groups?: Array<{
    displayName?: string;
    display_name?: string;
    description?: string;
    buckets?: Array<{
      bucketId?: string;
      bucket_id?: string;
      displayName?: string;
      display_name?: string;
      window?: string;
      remainingFraction?: number | string;
      remaining_fraction?: number | string;
      resetTime?: string;
      reset_time?: string;
      description?: string;
    }>;
  }>;
};
```

### UI mapping

Every group and every bucket returned by the API is rendered. The UI calculates
used percentage as `(1 - remainingFraction) * 100`, shows a reset time when
available, and preserves provider-supplied bucket names. Known 5-hour and
weekly buckets are sorted before other buckets.

## Claude

### Endpoints

```http
GET https://api.anthropic.com/api/oauth/usage
GET https://api.anthropic.com/api/oauth/profile
```

### Headers

```http
Authorization: Bearer <access_token>
Content-Type: application/json
anthropic-beta: oauth-2025-04-20
```

### Usage response shape

The upstream usage response includes legacy named windows and the newer,
authoritative `limits` array:

```ts
type ClaudeUsageResponse = {
  five_hour?: { utilization: number; resets_at: string | null } | null;
  seven_day?: { utilization: number; resets_at: string | null } | null;
  seven_day_oauth_apps?: { utilization: number; resets_at: string | null } | null;
  seven_day_opus?: { utilization: number; resets_at: string | null } | null;
  seven_day_sonnet?: { utilization: number; resets_at: string | null } | null;
  seven_day_cowork?: { utilization: number; resets_at: string | null } | null;
  iguana_necktie?: { utilization: number; resets_at: string | null } | null;
  extra_usage?: {
    is_enabled: boolean;
    monthly_limit: number | null;
    used_credits: number | null;
    utilization: number | null;
  } | null;
  limits?: Array<{
    kind?: string | null;
    group?: string | null;
    percent?: number | null;
    resets_at?: string | null;
    scope?: {
      model?: { id?: string | null; display_name?: string | null } | null;
      surface?: string | null;
    } | null;
    is_active?: boolean | null;
  }> | null;
};
```

The live response included `session`, `weekly_all`, and `weekly_scoped` limits.
The scoped weekly limit contained `scope.model.display_name: "Fable"`.

### Profile response shape

```ts
type ClaudeProfileResponse = {
  account?: {
    uuid?: string;
    full_name?: string;
    display_name?: string;
    email?: string;
    has_claude_max?: boolean;
    has_claude_pro?: boolean;
    created_at?: string;
  };
  organization?: {
    uuid?: string;
    name?: string;
    organization_type?: string;
    billing_type?: string;
    rate_limit_tier?: string;
    has_extra_usage_enabled?: boolean;
    subscription_status?: string;
  };
};
```

### UI mapping

`limits[]` is authoritative and every valid limit is rendered. Examples:

| API limit | UI label |
| --- | --- |
| `session` | Session limit |
| `weekly_all` | Weekly limit |
| `weekly_scoped` with model `Fable` | Weekly limit · Fable |
| An unknown weekly kind | Humanized provider kind, for example `Weekly Cowork` |

If `limits[]` is absent, the UI falls back to the legacy named windows.
`utilization` and `percent` represent consumed quota; the card displays
remaining quota as `100 - consumed`. The profile endpoint supplies the plan
label, and `extra_usage` is shown only when enabled.

## Codex

### Endpoints

```http
GET  https://chatgpt.com/backend-api/wham/usage
GET  https://chatgpt.com/backend-api/wham/rate-limit-reset-credits
POST https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume
```

### Headers

```http
Authorization: Bearer <access_token>
Chatgpt-Account-Id: <account_id>
Content-Type: application/json
User-Agent: codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal
```

The reset-credit `GET` also sends:

```http
Accept: application/json
OpenAI-Beta: codex-1
Originator: Codex Desktop
```

### Usage response shape

```ts
type CodexUsageWindow = {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_after_seconds?: number;
  reset_at?: number; // Unix seconds
};

type CodexRateLimit = {
  allowed?: boolean;
  limit_reached?: boolean;
  primary_window?: CodexUsageWindow | null;
  secondary_window?: CodexUsageWindow | null;
};

type CodexUsageResponse = {
  user_id?: string;
  account_id?: string;
  email?: string;
  plan_type?: string;
  rate_limit?: CodexRateLimit | null;
  code_review_rate_limit?: CodexRateLimit | null;
  additional_rate_limits?: Array<{
    limit_name?: string;
    metered_feature?: string;
    rate_limit?: CodexRateLimit | null;
  }> | null;
  credits?: {
    has_credits?: boolean;
    unlimited?: boolean;
    overage_limit_reached?: boolean;
    balance?: string;
    approx_local_messages?: [number, number];
    approx_cloud_messages?: [number, number];
  };
  spend_control?: { reached?: boolean; individual_limit?: number | null };
  rate_limit_reached_type?: string | null;
  promo?: unknown | null;
  rate_limit_reset_credits?: { available_count?: number };
};
```

Known window durations are `18000` seconds (5-hour), `604800` seconds
(weekly), and 28–31 days (monthly). The live response had one weekly primary
window, no code-review/additional windows, and three available reset credits.

### Manual reset credits

```ts
type CodexResetCreditResponse = {
  credits?: Array<{
    id?: string;
    reset_type?: "codex_rate_limits";
    status?: "available" | string;
    granted_at?: string;
    expires_at?: string;
    redeem_started_at?: string | null;
    redeemed_at?: string | null;
    title?: string;
    description?: string;
  }>;
  available_count?: number;
  total_earned_count?: number;
};
```

The consume endpoint is user-triggered only and uses a new UUID:

```json
{ "redeem_request_id": "<new UUID>" }
```

It consumes a reset credit and must never be used for ordinary refreshes.

### UI mapping

The UI already supports primary/secondary 5-hour, weekly, and monthly windows,
Code Review limits, and every `additional_rate_limits[]` item. It displays
reset-credit count and available-credit expiry times. Inactive/zero `credits`,
`spend_control`, and `promo` data are not displayed.

## Cursor

Cursor tracking uses the individual IDE dashboard API. This API is not part of
Cursor's documented Admin API and may change without notice.

### Endpoints and headers

```http
POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage
POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetPlanInfo
POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetSandUsageStatus
Authorization: Bearer <cursor_access_token>
Content-Type: application/json
Accept: application/json
Connect-Protocol-Version: 1
```

Both requests use `{}` as their JSON body. The token can be imported from
Cursor's local `state.vscdb` with `scripts/import-cursor-auth.zsh`. The generated
auth file has `type: "cursor"` and is tracker-only; the proxy does not route model
requests through it.

### Expected response shapes

```ts
type CursorCurrentPeriodUsage = {
  billingCycleStart?: string;
  billingCycleEnd?: string;
  planUsage?: {
    totalSpend?: number;       // cents
    includedSpend?: number;    // cents
    bonusSpend?: number;       // cents
    limit?: number;            // cents
    autoPercentUsed?: number;  // Cursor Models pool
    apiPercentUsed?: number;   // Other Models pool
    totalPercentUsed?: number;
  };
  spendLimitUsage?: {
    pooledLimit?: number;      // cents
    pooledUsed?: number;       // cents
    pooledRemaining?: number;  // cents
    individualUsed?: number;   // cents
    limitType?: string;
  };
};

type CursorPlanInfo = {
  planInfo?: {
    planName?: string;
    includedAmountCents?: number;
    price?: string;
    billingCycleEnd?: string;
  };
};

type CursorSandUsage = {
  currentPeriodStart?: string;
  nextResetTimestampUtc?: string;
  usagePercent?: number;
  hasAvailableUsage?: boolean;
  hasNonZeroIncludedLimit?: boolean;
  usesPooledEnterpriseAllowance?: boolean;
  grokPlanLabel?: string;
};
```

### UI mapping

The card displays the separate Cursor Models and Other Models monthly pools,
plan name, on-demand spend when a spend limit exists, and the billing-cycle
reset. The aggregate total is shown only as a compatibility fallback when
Cursor does not report either split pool, because it is not a third allowance.
The card also renders Grok Bot's separate weekly meter and reset from
`GetSandUsageStatus`; that percentage is never merged into the monthly Cursor
Models pool. Cursor reports consumed percentages; the card converts them to
remaining percentages. `includedAmountCents` is used as the fallback total
limit when `planUsage.limit` is zero or missing. Sand usage is best-effort, so a
failed Grok Bot request does not hide the monthly Cursor data. Pooled enterprise
sand allowances are omitted because their semantics differ from the personal
weekly meter.

## Kimi

### Endpoint and headers

```http
GET https://api.kimi.com/coding/v1/usages
Authorization: Bearer <access_token>
```

### Expected response shape

```ts
type KimiUsageDetail = {
  used?: number;
  limit?: number;
  remaining?: number;
  name?: string;
  title?: string;
  reset_at?: string;
  reset_time?: string;
  reset_in?: number;
  ttl?: number;
};

type KimiUsageResponse = {
  usage?: KimiUsageDetail;
  limits?: Array<{
    name?: string;
    title?: string;
    scope?: string;
    detail?: KimiUsageDetail;
    window?: { duration?: number; timeUnit?: string };
  }>;
};
```

### UI mapping

The optional summary `usage` becomes a quota row. Every item in `limits[]`
also becomes a row. The UI uses a provider-supplied name/title/scope when
available, otherwise derives a label from its window duration. It accepts both
`used` and `remaining`, and derives one from the other when possible. Reset
hints support absolute timestamps and relative seconds.

## OpenCode Go

### Endpoint and headers

```http
GET https://opencode.ai/zen/go/v1/usage
Authorization: Bearer <api_key>
Accept: application/json
```

Add the key from **Logins → Other login methods → OpenCode Go**. The generated
auth file has `type: "opencode-go"` and `auth_kind: "api_key"`. It is used only
for quota tracking; the key stays in the backend auth directory and is not sent
to the browser after upload.

### Expected response shape

```ts
type OpenCodeGoUsageResponse = {
  usage?: {
    rolling?: { status?: string; percent?: number; resetsAt?: string };
    weekly?: { status?: string; percent?: number; resetsAt?: string };
    monthly?: { status?: string; percent?: number; resetsAt?: string };
  };
};
```

### UI mapping

The three percentages become separate 5-hour, weekly, and monthly remaining
usage rows with clickable reset timestamps. These allowances are shared across
the models available in OpenCode Go. The supported usage endpoint does not
return a per-model split, so the UI does not attribute aggregate consumption to
individual models. The backend collector refreshes the credential every five
minutes and exposes the latest snapshot to the quota page; manual refreshes are
still available on demand.

## Devin CLI

Devin CLI tracking uses the Connect-RPC seat-management endpoint shared with
the Windsurf-backed Devin products. The API is not publicly documented and may
change without notice.

### Endpoint and headers

```http
POST https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus
Content-Type: application/json
Accept: application/json
Connect-Protocol-Version: 1
```

```json
{
  "metadata": {
    "apiKey": "<windsurf_api_key>",
    "ideName": "devin",
    "ideVersion": "1.108.2",
    "extensionName": "devin",
    "extensionVersion": "1.108.2",
    "locale": "en"
  }
}
```

Unlike every other provider here, the credential travels inside the JSON body
(`metadata.apiKey`), not in an `Authorization` header. The auth file has
`type: "devin-cli"` and `auth_kind: "api_key"`; it is tracker-only and never
routes model requests. `scripts/import-devin-auth.zsh` imports the session
token from `~/.local/share/devin/credentials.toml` (`windsurf_api_key`, plus
`api_server_url` when a custom server is configured), with a Devin desktop-app
`state.vscdb` fallback on macOS. **Logins → Other login methods → Devin CLI**
accepts the token, an optional `https://` API server URL, and an optional
account email instead. Because the key sits in the request body, the manual
refresh path relies on `$TOKEN$` substitution inside the api-call `data` field;
the stored `api_server_url` is exposed on the auth-file entry so the UI can
target custom servers.

### Expected response shape

```ts
type DevinCliUserStatus = {
  userStatus?: {
    name?: string;
    email?: string;
    planStatus?: {
      planInfo?: {
        planName?: string;
        hideDailyQuota?: boolean;
      };
      planStart?: string;                    // ISO-8601 instant
      planEnd?: string;                      // ISO-8601 instant
      dailyQuotaRemainingPercent?: number | string;
      weeklyQuotaRemainingPercent?: number | string;
      dailyQuotaResetAtUnix?: number | string;
      weeklyQuotaResetAtUnix?: number | string;
      overageBalanceMicros?: number | string; // USD * 1e6
    };
  };
};
```

Snake-case alternatives (`user_status`, `plan_status`, `plan_info`,
`daily_quota_remaining_percent`, and similar) are also accepted.

### UI mapping

The card shows the plan name and plan-period end, a daily meter and a weekly
meter with clickable reset times, and the extra-usage balance in USD when
`overageBalanceMicros` is present. Devin reports percent *remaining*; the UI
inverts it to percent used for the shared row component. When `hideDailyQuota`
is set and no weekly figure is returned, the daily allowance is surfaced in
the weekly row so the card stays meaningful. The backend collector refreshes
the credential every five minutes and exposes the latest snapshot to the quota
page; manual refreshes are still available on demand.

## xAI / Grok

### Endpoints

```http
GET https://cli-chat-proxy.grok.com/v1/billing?format=credits
GET https://cli-chat-proxy.grok.com/v1/billing
```

### Headers

```http
Authorization: Bearer <access_token>
x-xai-token-auth: xai-grok-cli
x-grok-client-version: 0.2.91
Accept: */*
User-Agent: grok-pager/0.2.91 grok-shell/0.2.91 (macos; aarch64)
x-userid: <optional user ID from auth metadata>
```

### Expected response shape

```ts
type XaiBillingResponse = {
  config?: {
    currentPeriod?: { type?: string; start?: string; end?: string } | null;
    creditUsagePercent?: number | string | null;
    productUsage?: Array<{
      product?: string;
      usagePercent?: number | string | null;
    }> | null;
    monthlyLimit?: { val?: number | string } | number | string | null;
    used?: { val?: number | string } | number | string | null;
    onDemandCap?: { val?: number | string } | number | string | null;
    onDemandUsed?: { val?: number | string } | number | string | null;
    billingPeriodStart?: string;
    billingPeriodEnd?: string;
  } | null;
};
```

Snake-case alternatives (`current_period`, `credit_usage_percent`,
`product_usage`, `monthly_limit`, `on_demand_cap`, and similar) are also
accepted.

### UI mapping

The two responses are merged. The UI renders weekly credit usage, every
`productUsage[]` item, pay-as-you-go usage/cap, and monthly credit usage. It
derives included and on-demand usage from the reported cents when needed and
identifies SuperGrok plans from the monthly limit.

### Grok Bot weekly allowance (backend-only)

The account's own Grok Bot meter is not part of the billing API — it is
exposed by the computer hub over WebSocket:

```text
wss://computer-hub.grok.com/v1/tools?role=bot_client
```

The collector opens the socket with the credential's `Authorization: Bearer`
token plus the Grok CLI headers, sends the `protocol_version`/`bot_client`
hello frame, and issues a single JSON-RPC `bot.usage` call. The result's
`usagePercent` and `nextResetAtMs` become the `xai-grok-bot` window in the
credential's `quota_capacity` snapshot. Browsers cannot send the auth header
on a WS upgrade, so the quota card always reads this row from the stored
snapshot rather than through the manual-refresh `api-call` relay.

## Source of truth

The endpoint constants, request headers, and provider fetch functions are in:

- `management-center/src/utils/quota/constants.ts`
- `management-center/src/features/quota/providers/*/data.ts`

Response models and dynamic mapping are in:

- `management-center/src/types/quota.ts`
- `management-center/src/features/quota/providers/*/*QuotaBody.tsx`
- `CLIProxyAPI/internal/quotadrain/providers.go`
