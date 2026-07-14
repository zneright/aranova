#![cfg(test)]
use super::{SystemLoanContract, SystemLoanContractClient};
use soroban_sdk::{contract, contractimpl, testutils::Address as _, token, Address, Env, IntoVal, Symbol};

#[contract]
pub struct MockTrustContract;

#[contractimpl]
impl MockTrustContract {
    pub fn record_event(env: Env, user: Address, event_type: u32) {
        env.events().publish((Symbol::new(&env, "mock_record_event"), user), event_type);
    }
    pub fn get_trust_score(env: Env, user: Address) -> i128 { 55 }
}

#[test]
fn test_system_loan_disburse_repay() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let borrower = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin);
    let token = token::Client::new(&env, &token_id);
    let asset = token::StellarAssetClient::new(&env, &token_id);

    let trust_id = env.register_contract(None, MockTrustContract);
    let loan_id = env.register_contract(None, SystemLoanContract);
    let loan = SystemLoanContractClient::new(&env, &loan_id);

    loan.init(&admin, &trust_id);

    asset.mint(&admin, &50_000_000);
    asset.mint(&borrower, &10_000_000);

    loan.disburse_loan(&borrower, &token_id, &30_000_000, &500, &30);

    assert_eq!(token.balance(&borrower), 40_000_000);
    assert_eq!(token.balance(&admin), 20_000_000);

    loan.repay_loan(&borrower, &token_id);

    assert_eq!(token.balance(&borrower), 40_000_000 - 30_123_287);
    assert!(loan.get_loan(&borrower).is_none());
}
