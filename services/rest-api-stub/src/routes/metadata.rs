use crate::types::{MetadataHistoryResponse, MetadataResponse};
use rocket::serde::json::Json;

#[get("/metadata/<address>?<hash>")]
pub fn get_metadata(address: &str, hash: Option<&str>) -> Json<MetadataResponse> {
    let _ = hash;
    Json(MetadataResponse {
        address: address.to_string(),
        meta_hash: "0x0000000000000000000000000000000000000000000000000000000000000000"
            .into(),
        schema_hash: "0x0000000000000000000000000000000000000000000000000000000000000000"
            .into(),
        content: serde_json::json!({}),
    })
}

#[get("/metadata/<_address>/history")]
pub fn get_metadata_history(_address: &str) -> Json<MetadataHistoryResponse> {
    Json(MetadataHistoryResponse {
        history: vec![],
    })
}
