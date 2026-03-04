use crate::types::{TokenInfo, TokenListResponse};
use rocket::serde::json::Json;

#[get("/")]
pub fn get_tokens() -> Json<TokenListResponse> {
    let tokens = vec![
        TokenInfo {
            address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".into(),
            symbol: "USDC".into(),
            name: "USD Coin".into(),
            isin: None,
            decimals: 6,
        },
        TokenInfo {
            address: "0x4200000000000000000000000000000000000006".into(),
            symbol: "WETH".into(),
            name: "Wrapped Ether".into(),
            isin: None,
            decimals: 18,
        },
        TokenInfo {
            address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22".into(),
            symbol: "cbETH".into(),
            name: "Coinbase Wrapped Staked ETH".into(),
            isin: None,
            decimals: 18,
        },
        TokenInfo {
            address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb".into(),
            symbol: "DAI".into(),
            name: "Dai Stablecoin".into(),
            isin: None,
            decimals: 18,
        },
    ];

    Json(TokenListResponse { tokens })
}
