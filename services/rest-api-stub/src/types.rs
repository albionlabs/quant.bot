use serde::Serialize;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenInfo {
    pub address: String,
    pub symbol: String,
    pub name: String,
    #[serde(rename = "ISIN", skip_serializing_if = "Option::is_none")]
    pub isin: Option<String>,
    pub decimals: u8,
}

#[derive(Serialize)]
pub struct TokenListResponse {
    pub tokens: Vec<TokenInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataResponse {
    pub address: String,
    pub meta_hash: String,
    pub schema_hash: String,
    pub content: serde_json::Value,
}

#[derive(Serialize)]
pub struct MetadataHistoryResponse {
    pub history: Vec<serde_json::Value>,
}

#[derive(Serialize)]
pub struct DistributionsListResponse {
    pub distributions: Vec<serde_json::Value>,
}

#[derive(Serialize)]
pub struct ApiErrorDetail {
    pub code: String,
    pub message: String,
}

#[derive(Serialize)]
pub struct ApiErrorResponse {
    pub error: ApiErrorDetail,
}
